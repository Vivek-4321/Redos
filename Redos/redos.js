//reods.js
const fs = require('fs').promises;
const zlib = require('zlib');

class Redos {
  constructor(options = {}) {
    this.data = new Map();
    this.pubsub = new Map();
    this.expiration = new Map();
    this.persistencePath = options.persistencePath || './redos-data.json';
    this.persistenceInterval = options.persistenceInterval || 5000; // 5 seconds
    this.stringIntern = new Map(); // For string interning
    this.setupPersistence();
    this.bloomFilters = new Map(); // For Bloom filters
  }

  async setupPersistence() {
    try {
      const data = await fs.readFile(this.persistencePath, 'utf-8');
      const parsedData = JSON.parse(data);
      this.data = new Map(parsedData.data.map(([k, v]) => [k, this.decodeValue(v)]));
      this.expiration = new Map(parsedData.expiration);
    } catch (error) {
      console.log('No existing data found or error reading data. Starting fresh.');
    }

    setInterval(() => this.persist(), this.persistenceInterval);
  }

  async persist() {
    const data = {
      data: Array.from(this.data.entries()).map(([k, v]) => [k, this.encodeValue(v)]),
      expiration: Array.from(this.expiration.entries())
    };
    await fs.writeFile(this.persistencePath, JSON.stringify(data));
  }

  encodeVarint(value) {
    const buffer = [];
    while (value > 127) {
      buffer.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    buffer.push(value);
    return Buffer.from(buffer);
  }

  decodeVarint(buffer) {
    let value = 0;
    let shift = 0;
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return value;
  }

  compressString(str) {
    return zlib.deflateSync(str);
  }

  decompressString(buffer) {
    return zlib.inflateSync(buffer).toString();
  }

  internString(str) {
    if (!this.stringIntern.has(str)) {
      this.stringIntern.set(str, this.stringIntern.size);
    }
    return this.stringIntern.get(str);
  }

  getInternedString(id) {
    for (const [str, internId] of this.stringIntern.entries()) {
      if (internId === id) return str;
    }
    return null;
  }

  packBooleans(...bools) {
    let packed = 0;
    bools.forEach((bool, index) => {
      if (bool) packed |= (1 << index);
    });
    return packed;
  }

  unpackBooleans(packed, count) {
    const bools = [];
    for (let i = 0; i < count; i++) {
      bools.push((packed & (1 << i)) !== 0);
    }
    return bools;
  }

  encodeFloat(value) {
    const buffer = Buffer.alloc(2);
    const sign = value < 0 ? 1 : 0;
    value = Math.abs(value);
    const exponent = Math.floor(Math.log2(value));
    const mantissa = Math.round((value / Math.pow(2, exponent) - 1) * 1024);
    buffer.writeUInt16BE((sign << 15) | ((exponent + 15) << 10) | mantissa);
    return buffer;
  }

  decodeFloat(buffer) {
    const bits = buffer.readUInt16BE();
    const sign = bits >> 15 ? -1 : 1;
    const exponent = ((bits >> 10) & 0x1F) - 15;
    const mantissa = (bits & 0x3FF) / 1024 + 1;
    return sign * mantissa * Math.pow(2, exponent);
  }

  encodeValue(value) {
    if (value === null || value === undefined) {
      return Buffer.from([0xFF]); // Null value optimization
    } else if (typeof value === 'boolean') {
      return Buffer.from([value ? 0x01 : 0x00]);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        const varint = this.encodeVarint(value);
        return Buffer.concat([Buffer.from([0x02]), varint]);
      } else {
        const floatBuffer = this.encodeFloat(value);
        return Buffer.concat([Buffer.from([0x03]), floatBuffer]);
      }
    } else if (typeof value === 'string') {
      if (value.length <= 44) {
        const buffer = Buffer.alloc(1 + value.length);
        buffer.writeUInt8(0x10 | value.length, 0);
        buffer.write(value, 1);
        return buffer;
      } else {
        const compressed = this.compressString(value);
        const internedId = this.internString(value);
        const buffer = Buffer.alloc(5 + compressed.length);
        buffer.writeUInt8(0x11, 0);
        buffer.writeUInt32BE(internedId, 1);
        compressed.copy(buffer, 5);
        return buffer;
      }
    } else if (Array.isArray(value)) {
      if (value.length < 16 && value.every(v => typeof v === 'boolean')) {
        const packed = this.packBooleans(...value);
        const buffer = Buffer.alloc(2);
        buffer.writeUInt8(0x20 | value.length, 0);
        buffer.writeUInt8(packed, 1);
        return buffer;
      }
    }
    // For other types, return as is
    return value;
  }

  decodeValue(value) {
    if (Buffer.isBuffer(value)) {
      const firstByte = value.readUInt8(0);
      if (firstByte === 0xFF) {
        return null; // Null value optimization
      } else if (firstByte === 0x00 || firstByte === 0x01) {
        return firstByte === 0x01; // Boolean
      } else if (firstByte === 0x02) {
        return this.decodeVarint(value.slice(1)); // Varint
      } else if (firstByte === 0x03) {
        return this.decodeFloat(value.slice(1)); // Float
      } else if ((firstByte & 0xF0) === 0x10) {
        if (firstByte === 0x11) {
          const internedId = value.readUInt32BE(1);
          const compressed = value.slice(5);
          const decompressed = this.decompressString(compressed);
          return this.getInternedString(internedId) || decompressed;
        } else {
          return value.toString('utf8', 1, 1 + (firstByte & 0x0F));
        }
      } else if ((firstByte & 0xF0) === 0x20) {
        const count = firstByte & 0x0F;
        const packed = value.readUInt8(1);
        return this.unpackBooleans(packed, count);
      }
    }
    // For non-encoded values, return as is
    return value;
  }

  set(key, value) {
    this.data.set(key, this.encodeValue(value));
    return 'OK';
  }

  get(key) {
    const value = this.data.get(key);
    return value !== undefined ? this.decodeValue(value) : null;
  }

  del(key) {
    return this.data.delete(key) ? 1 : 0;
  }

  expire(key, seconds) {
    if (!this.data.has(key)) return 0;
    const expirationTime = Date.now() + seconds * 1000;
    this.expiration.set(key, expirationTime);
    setTimeout(() => {
      if (this.expiration.get(key) === expirationTime) {
        this.del(key);
        this.expiration.delete(key);
      }
    }, seconds * 1000);
    return 1;
  }

  lpush(key, ...values) {
    if (!this.data.has(key)) this.data.set(key, []);
    const list = this.data.get(key);
    if (!Array.isArray(list)) {
      this.data.set(key, []);
      return this.lpush(key, ...values);
    }
    list.unshift(...values.map(v => this.encodeValue(v)));
    return list.length;
  }

  rpush(key, ...values) {
    if (!this.data.has(key)) this.data.set(key, []);
    const list = this.data.get(key);
    if (!Array.isArray(list)) {
      this.data.set(key, []);
      return this.rpush(key, ...values);
    }
    list.push(...values.map(v => this.encodeValue(v)));
    return list.length;
  }

  lpop(key) {
    const list = this.data.get(key);
    if (!Array.isArray(list)) return null;
    return this.decodeValue(list.shift()) || null;
  }

  rpop(key) {
    const list = this.data.get(key);
    if (!Array.isArray(list)) return null;
    return this.decodeValue(list.pop()) || null;
  }

  sadd(key, ...members) {
    if (!this.data.has(key) || !(this.data.get(key) instanceof Set)) {
      this.data.set(key, new Set());
    }
    const set = this.data.get(key);
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    return added;
  }

  srem(key, ...members) {
    const set = this.data.get(key);
    if (!(set instanceof Set)) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed++;
    }
    return removed;
  }

  smembers(key) {
    const set = this.data.get(key);
    if (!(set instanceof Set)) return [];
    return Array.from(set);
  }


  hset(key, field, value) {
    if (!this.data.has(key) || !(this.data.get(key) instanceof Map)) {
      this.data.set(key, new Map());
    }
    const hash = this.data.get(key);
    const isNew = !hash.has(field);
    hash.set(field, this.encodeValue(value));
    return isNew ? 1 : 0;
  }

  hget(key, field) {
    const hash = this.data.get(key);
    if (!(hash instanceof Map)) return null;
    const value = hash.get(field);
    return value !== undefined ? this.decodeValue(value) : null;
  }

  hgetall(key) {
    const hash = this.data.get(key);
    if (!(hash instanceof Map)) return {};
    return Object.fromEntries(Array.from(hash.entries()).map(([k, v]) => [k, this.decodeValue(v)]));
  }

  publish(channel, message) {
    const subscribers = this.pubsub.get(channel) || [];
    subscribers.forEach(callback => callback(message));
    return subscribers.length;
  }

  subscribe(channel, callback) {
    if (!this.pubsub.has(channel)) this.pubsub.set(channel, new Set());
    this.pubsub.get(channel).add(callback);
    return 'OK';
  }

  unsubscribe(channel, callback) {
    if (this.pubsub.has(channel)) {
      const subscribers = this.pubsub.get(channel);
      subscribers.delete(callback);
      if (subscribers.size === 0) this.pubsub.delete(channel);
    }
    return 'OK';
  }

  strlen(key) {
    const value = this.get(key);
    return typeof value === 'string' ? value.length : 0;
  }

  setbit(key, offset, value) {
    let byteArray = this.get(key);
    if (!(byteArray instanceof Buffer)) {
      byteArray = Buffer.alloc(Math.ceil((offset + 1) / 8), 0);
    }
    const byteIndex = Math.floor(offset / 8);
    const bitOffset = offset % 8;
    const oldByte = byteArray[byteIndex] || 0;
    const newByte = value ? (oldByte | (1 << bitOffset)) : (oldByte & ~(1 << bitOffset));
    byteArray[byteIndex] = newByte;
    this.set(key, byteArray);
    return (oldByte & (1 << bitOffset)) !== 0 ? 1 : 0;
  }

  getbit(key, offset) {
    const byteArray = this.get(key);
    if (!(byteArray instanceof Buffer)) return 0;
    const byteIndex = Math.floor(offset / 8);
    const bitOffset = offset % 8;
    return (byteArray[byteIndex] & (1 << bitOffset)) !== 0 ? 1 : 0;
  }

  ltrim(key, start, stop) {
    const list = this.get(key);
    if (!Array.isArray(list)) return 'OK';
    const newList = list.slice(start, stop + 1);
    this.set(key, newList);
    return 'OK';
  }

  zadd(key, score, member) {
    if (!this.data.has(key) || !(this.data.get(key) instanceof Map)) {
      this.data.set(key, new Map());
    }
    const sortedSet = this.data.get(key);
    const encodedMember = this.encodeValue(member);
    const encodedScore = this.encodeValue(score);
    const isNew = !sortedSet.has(encodedMember);
    sortedSet.set(encodedMember, encodedScore);
    return isNew ? 1 : 0;
  }

  zrange(key, start, stop, withScores = false) {
    const sortedSet = this.data.get(key);
    if (!(sortedSet instanceof Map)) return [];
    const entries = Array.from(sortedSet.entries())
      .sort((a, b) => this.decodeValue(a[1]) - this.decodeValue(b[1]));
    const result = entries.slice(start, stop + 1).map(([member, score]) => {
      const decodedMember = this.decodeValue(member);
      return withScores ? [decodedMember, this.decodeValue(score)] : decodedMember;
    });
    return withScores ? result.flat() : result;
  }

  multi() {
    return new RedosTransaction(this);
  }

  watch(...keys) {
    return new RedosTransaction(this).watch(...keys);
  }

  setTimeSeries(key, timestamp, value) {
    if (!this.data.has(key) || !Array.isArray(this.data.get(key))) {
      this.data.set(key, []);
    }
    const series = this.data.get(key);
    series.push([timestamp, value]);
    series.sort((a, b) => a[0] - b[0]); // Keep the series sorted by timestamp
    return 'OK';
  }

  getTimeSeries(key, startTimestamp, endTimestamp) {
    if (!this.data.has(key) || !Array.isArray(this.data.get(key))) return [];
    const series = this.data.get(key);
    return series.filter(([timestamp, _]) => 
      timestamp >= startTimestamp && timestamp <= endTimestamp
    );
  }

}

class RedosTransaction {
  constructor(redos) {
    this.redos = redos;
    this.commands = [];
    this.watchedKeys = new Set();
    this.initialValues = new Map();
  }

  watch(...keys) {
    keys.forEach(key => {
      this.watchedKeys.add(key);
      this.initialValues.set(key, this.redos.get(key));
    });
    return this;
  }

  exec(command, ...args) {
    this.commands.push({ command, args });
    return this;
  }

  discard() {
    this.commands = [];
    this.watchedKeys.clear();
    this.initialValues.clear();
    return 'OK';
  }

  execute() {
    for (const key of this.watchedKeys) {
      if (this.redos.get(key) !== this.initialValues.get(key)) {
        return null; // Transaction failed due to changed keys
      }
    }

    const results = [];
    for (const { command, args } of this.commands) {
      if (typeof this.redos[command] === 'function') {
        results.push(this.redos[command](...args));
      } else {
        throw new Error(`Invalid command: ${command}`);
      }
    }
    return results;
  }
}

module.exports = { Redos };