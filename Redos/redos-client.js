//redos-client.js
const net = require('net');
const EventEmitter = require('events');

class RedosClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || 'localhost';
    this.port = options.port || 6379;
    this.socket = new net.Socket();
    this.connected = false;
    this.responseCallbacks = [];
    this.subscriptions = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket.connect(this.port, this.host, () => {
        this.connected = true;
        this.socket.on('data', (data) => this.handleResponse(data));
        resolve();
      });

      this.socket.on('error', (error) => {
        console.error('Connection error:', error);
        this.connected = false;
        this.emit('error', error);
        reject(error);
      });

      this.socket.on('close', () => {
        console.log('Connection closed');
        this.connected = false;
        this.emit('close');
      });
    });
  }

  handleResponse(data) {
    const responses = data.toString().split('\n').filter(Boolean);
    for (const responseStr of responses) {
      try {
        const response = JSON.parse(responseStr);
        if (response.type === 'message') {
          this.emit('message', response.channel, response.message);
        } else {
          const callback = this.responseCallbacks.shift();
          if (callback) {
            if (response.success) {
              callback(null, response.result);
            } else {
              callback(new Error(response.error));
            }
          }
        }
      } catch (error) {
        console.error('Error parsing response:', error);
      }
    }
  }

  async sendCommand(method, ...args) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected to RedosServer'));
        return;
      }

      const command = JSON.stringify({ method, args });
      this.socket.write(command);

      this.responseCallbacks.push((error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  // Implement RedosSDK methods
  async set(key, value) {
    return this.sendCommand('set', key, value);
  }

  async get(key) {
    return this.sendCommand('get', key);
  }

  async del(key) {
    return this.sendCommand('del', key);
  }

  async expire(key, seconds) {
    return this.sendCommand('expire', key, seconds);
  }

  async lpush(key, ...values) {
    return this.sendCommand('lpush', key, ...values);
  }

  async rpush(key, ...values) {
    return this.sendCommand('rpush', key, ...values);
  }

  async lpop(key) {
    return this.sendCommand('lpop', key);
  }

  async rpop(key) {
    return this.sendCommand('rpop', key);
  }

  async sadd(key, ...members) {
    return this.sendCommand('sadd', key, ...members);
  }

  async srem(key, ...members) {
    return this.sendCommand('srem', key, ...members);
  }

  async smembers(key) {
    return this.sendCommand('smembers', key);
  }

  async hset(key, field, value) {
    return this.sendCommand('hset', key, field, value);
  }

  async hget(key, field) {
    return this.sendCommand('hget', key, field);
  }

  async hgetall(key) {
    return this.sendCommand('hgetall', key);
  }

  async publish(channel, message) {
    return this.sendCommand('publish', channel, message);
  }

  async subscribe(channel) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    await this.sendCommand('subscribe', channel);
    return 'subscribed';
  }

  async unsubscribe(channel) {
    if (this.subscriptions.has(channel)) {
      this.subscriptions.delete(channel);
      await this.sendCommand('unsubscribe', channel);
    }
    return 'unsubscribed';
  }

  async multi() {
    await this.sendCommand('multi');
    return new RedosTransaction(this);
  }

  async watch(...keys) {
    return this.sendCommand('watch', ...keys);
  }

  close() {
    this.socket.end();
    this.connected = false;
    this.subscriptions.clear();
  }

  async setTimeSeries(key, timestamp, value) {
    return this.sendCommand('setTimeSeries', key, timestamp, value);
  }
  
  async getTimeSeries(key, startTimestamp, endTimestamp) {
    return this.sendCommand('getTimeSeries', key, startTimestamp, endTimestamp);
  }
  
}

class RedosTransaction {
  constructor(client) {
    this.client = client;
    this.commands = [];
  }

  exec(command, ...args) {
    this.commands.push({ command, args });
    return this;
  }

  async execute() {
    for (const { command, args } of this.commands) {
      await this.client.sendCommand(command, ...args);
    }
    return this.client.sendCommand('exec');
  }

  async discard() {
    return this.client.sendCommand('discard');
  }
}

module.exports = RedosClient;