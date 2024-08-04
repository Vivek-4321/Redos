// const fs = require('fs').promises;

// class Redos {
//   constructor(options = {}) {
//     this.data = new Map();
//     this.pubsub = new Map();
//     this.expiration = new Map();
//     this.persistencePath = options.persistencePath || './redos-data.json';
//     this.persistenceInterval = options.persistenceInterval || 5000; // 5 seconds
//     this.setupPersistence();
//   }

//   async setupPersistence() {
//     try {
//       const data = await fs.readFile(this.persistencePath, 'utf-8');
//       const parsedData = JSON.parse(data);
//       this.data = new Map(parsedData.data);
//       this.expiration = new Map(parsedData.expiration);
//     } catch (error) {
//       console.log('No existing data found or error reading data. Starting fresh.');
//     }

//     setInterval(() => this.persist(), this.persistenceInterval);
//   }

//   async persist() {
//     const data = {
//       data: Array.from(this.data.entries()),
//       expiration: Array.from(this.expiration.entries())
//     };
//     await fs.writeFile(this.persistencePath, JSON.stringify(data));
//   }

//   set(key, value) {
//     this.data.set(key, value);
//     return 'OK';
//   }

//   get(key) {
//     return this.data.has(key) ? this.data.get(key) : null;
//   }

//   del(key) {
//     return this.data.delete(key) ? 1 : 0;
//   }

//   expire(key, seconds) {
//     if (!this.data.has(key)) return 0;
//     const expirationTime = Date.now() + seconds * 1000;
//     this.expiration.set(key, expirationTime);
//     setTimeout(() => {
//       if (this.expiration.get(key) === expirationTime) {
//         this.del(key);
//         this.expiration.delete(key);
//       }
//     }, seconds * 1000);
//     return 1;
//   }

//   lpush(key, ...values) {
//     if (!this.data.has(key)) this.data.set(key, []);
//     const list = this.data.get(key);
//     if (!Array.isArray(list)) throw new Error('Key contains a non-list value');
//     list.unshift(...values);
//     return list.length;
//   }

//   rpush(key, ...values) {
//     if (!this.data.has(key)) this.data.set(key, []);
//     const list = this.data.get(key);
//     if (!Array.isArray(list)) throw new Error('Key contains a non-list value');
//     list.push(...values);
//     return list.length;
//   }

//   lpop(key) {
//     const list = this.data.get(key);
//     if (!Array.isArray(list)) throw new Error('Key contains a non-list value');
//     return list.shift() || null;
//   }

//   rpop(key) {
//     const list = this.data.get(key);
//     if (!Array.isArray(list)) throw new Error('Key contains a non-list value');
//     return list.pop() || null;
//   }

//   sadd(key, ...members) {
//     if (!this.data.has(key)) {
//       this.data.set(key, new Set());
//     }
//     const set = this.data.get(key);
//     if (!(set instanceof Set)) {
//       throw new Error('Key contains a non-set value');
//     }
//     let added = 0;
//     for (const member of members) {
//       if (!set.has(member)) {
//         set.add(member);
//         added++;
//       }
//     }
//     return added;
//   }

//   srem(key, ...members) {
//     const set = this.data.get(key);
//     if (!(set instanceof Set)) throw new Error('Key contains a non-set value');
//     let removed = 0;
//     for (const member of members) {
//       if (set.delete(member)) removed++;
//     }
//     return removed;
//   }

//   smembers(key) {
//     const set = this.data.get(key);
//     if (!(set instanceof Set)) throw new Error('Key contains a non-set value');
//     return Array.from(set);
//   }

//   hset(key, field, value) {
//     if (!this.data.has(key)) this.data.set(key, new Map());
//     const hash = this.data.get(key);
//     if (!(hash instanceof Map)) throw new Error('Key contains a non-hash value');
//     const isNew = !hash.has(field);
//     hash.set(field, value);
//     return isNew ? 1 : 0;
//   }

//   hget(key, field) {
//     const hash = this.data.get(key);
//     if (!(hash instanceof Map)) throw new Error('Key contains a non-hash value');
//     return hash.get(field) || null;
//   }

//   hgetall(key) {
//     const hash = this.data.get(key);
//     if (!(hash instanceof Map)) throw new Error('Key contains a non-hash value');
//     return Object.fromEntries(hash);
//   }

//   publish(channel, message) {
//     const subscribers = this.pubsub.get(channel) || [];
//     subscribers.forEach(callback => callback(message));
//     return subscribers.length;
//   }

//   subscribe(channel, callback) {
//     if (!this.pubsub.has(channel)) this.pubsub.set(channel, new Set());
//     this.pubsub.get(channel).add(callback);
//     return 'OK';
//   }

//   unsubscribe(channel, callback) {
//     if (this.pubsub.has(channel)) {
//       const subscribers = this.pubsub.get(channel);
//       subscribers.delete(callback);
//       if (subscribers.size === 0) this.pubsub.delete(channel);
//     }
//     return 'OK';
//   }

//   multi() {
//     return new RedosTransaction(this);
//   }

//   watch(...keys) {
//     return new RedosTransaction(this).watch(...keys);
//   }
// }

// class RedosTransaction {
//   constructor(redos) {
//     this.redos = redos;
//     this.commands = [];
//     this.watchedKeys = new Set();
//     this.initialValues = new Map();
//   }

//   watch(...keys) {
//     keys.forEach(key => {
//       this.watchedKeys.add(key);
//       this.initialValues.set(key, this.redos.get(key));
//     });
//     return this;
//   }

//   exec(command, ...args) {
//     this.commands.push({ command, args });
//     return this;
//   }

//   discard() {
//     this.commands = [];
//     this.watchedKeys.clear();
//     this.initialValues.clear();
//     return 'OK';
//   }

//   execute() {
//     for (const key of this.watchedKeys) {
//       if (this.redos.get(key) !== this.initialValues.get(key)) {
//         return null; // Transaction failed due to changed keys
//       }
//     }

//     const results = [];
//     for (const { command, args } of this.commands) {
//       if (typeof this.redos[command] === 'function') {
//         results.push(this.redos[command](...args));
//       } else {
//         throw new Error(`Invalid command: ${command}`);
//       }
//     }
//     return results;
//   }
// }

// module.exports = { Redos };

//redos.js
const fs = require('fs').promises;

class Redos {
  constructor(options = {}) {
    this.data = new Map();
    this.pubsub = new Map();
    this.expiration = new Map();
    this.persistencePath = options.persistencePath || './redos-data.json';
    this.persistenceInterval = options.persistenceInterval || 5000; // 5 seconds
    this.setupPersistence();
  }

  async setupPersistence() {
    try {
      const data = await fs.readFile(this.persistencePath, 'utf-8');
      const parsedData = JSON.parse(data);
      this.data = new Map(parsedData.data);
      this.expiration = new Map(parsedData.expiration);
    } catch (error) {
      console.log('No existing data found or error reading data. Starting fresh.');
    }

    setInterval(() => this.persist(), this.persistenceInterval);
  }

  async persist() {
    const data = {
      data: Array.from(this.data.entries()),
      expiration: Array.from(this.expiration.entries())
    };
    await fs.writeFile(this.persistencePath, JSON.stringify(data));
  }

  set(key, value) {
    this.data.set(key, value);
    return 'OK';
  }

  get(key) {
    return this.data.has(key) ? this.data.get(key) : null;
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
    list.unshift(...values);
    return list.length;
  }

  rpush(key, ...values) {
    if (!this.data.has(key)) this.data.set(key, []);
    const list = this.data.get(key);
    if (!Array.isArray(list)) {
      this.data.set(key, []);
      return this.rpush(key, ...values);
    }
    list.push(...values);
    return list.length;
  }

  lpop(key) {
    const list = this.data.get(key);
    if (!Array.isArray(list)) return null;
    return list.shift() || null;
  }

  rpop(key) {
    const list = this.data.get(key);
    if (!Array.isArray(list)) return null;
    return list.pop() || null;
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
    hash.set(field, value);
    return isNew ? 1 : 0;
  }

  hget(key, field) {
    const hash = this.data.get(key);
    if (!(hash instanceof Map)) return null;
    return hash.get(field) || null;
  }

  hgetall(key) {
    const hash = this.data.get(key);
    if (!(hash instanceof Map)) return {};
    return Object.fromEntries(hash);
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

  multi() {
    return new RedosTransaction(this);
  }

  watch(...keys) {
    return new RedosTransaction(this).watch(...keys);
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

