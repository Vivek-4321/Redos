const RedosClient = require("./redos-client");
const EventEmitter = require("events");

class RedosClientPool extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || "localhost";
    this.port = options.port || 6379;
    this.poolSize = options.poolSize || 5;
    this.retryInterval = options.retryInterval || 5000;
    this.maxRetries = options.maxRetries || Infinity;

    this.pool = [];
    this.waitingClients = [];
    this.retryCount = 0;
    this.subscriptions = new Map();
  }
  

  async init() {
    for (let i = 0; i < this.poolSize; i++) {
      await this.addClient();
    }
  }

  async addClient() {
    const client = new RedosClient({ host: this.host, port: this.port });
    client.on("error", (error) => this.handleClientError(client, error));
    client.on("close", () => this.handleClientClose(client));

    try {
      await client.connect();
      this.pool.push(client);
      this.emit("clientAdded", client);
      this.retryCount = 0;
    } catch (error) {
      this.handleClientError(client, error);
    }
  }

  async handleClientError(client, error) {
    console.error("Client error:", error);
    this.removeClient(client);

    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      console.log(
        `Retrying connection in ${this.retryInterval}ms (Attempt ${this.retryCount})`
      );
      setTimeout(() => this.addClient(), this.retryInterval);
    } else {
      console.error("Max retries reached. Stopping reconnection attempts.");
      this.emit("maxRetriesReached");
    }
  }

  handleClientClose(client) {
    console.log("Client closed connection");
    this.removeClient(client);
  }

  removeClient(client) {
    const index = this.pool.indexOf(client);
    if (index !== -1) {
      this.pool.splice(index, 1);
      this.handleClientRemoval(client);
      client.close();
      this.emit("clientRemoved", client);
    }
  }

  handleClientRemoval(client) {
    for (const [channel, subscribers] of this.subscriptions.entries()) {
      const index = subscribers.findIndex((sub) => sub.client === client);
      if (index !== -1) {
        const { callback } = subscribers[index];
        subscribers.splice(index, 1);
        this.subscribe(channel, callback);
      }
    }
  }

  async getClient() {
    if (this.pool.length > 0) {
      return this.pool.shift();
    }

    return new Promise((resolve) => {
      this.waitingClients.push(resolve);
    });
  }

  releaseClient(client) {
    if (this.waitingClients.length > 0) {
      const resolve = this.waitingClients.shift();
      resolve(client);
    } else {
      this.pool.push(client);
    }
  }

  async executeCommand(method, ...args) {
    const client = await this.getClient();
    try {
      const result = await client[method](...args);
      this.releaseClient(client);
      return result;
    } catch (error) {
      this.handleClientError(client, error);
      throw error;
    }
  }

  // Implement RedosSDK methods using the pool
  set(key, value) {
    return this.executeCommand("set", key, value);
  }

  get(key) {
    return this.executeCommand("get", key);
  }

  del(key) {
    return this.executeCommand("del", key);
  }

  expire(key, seconds) {
    return this.executeCommand("expire", key, seconds);
  }

  lpush(key, ...values) {
    return this.executeCommand("lpush", key, ...values);
  }

  rpush(key, ...values) {
    return this.executeCommand("rpush", key, ...values);
  }

  lpop(key) {
    return this.executeCommand("lpop", key);
  }

  rpop(key) {
    return this.executeCommand("rpop", key);
  }

  sadd(key, ...members) {
    return this.executeCommand("sadd", key, ...members);
  }

  srem(key, ...members) {
    return this.executeCommand("srem", key, ...members);
  }

  smembers(key) {
    return this.executeCommand("smembers", key);
  }

  hset(key, field, value) {
    return this.executeCommand("hset", key, field, value);
  }

  hget(key, field) {
    return this.executeCommand("hget", key, field);
  }

  hgetall(key) {
    return this.executeCommand("hgetall", key);
  }

  publish(channel, message) {
    return this.executeCommand("publish", channel, message);
  }

  async subscribe(channel, callback) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
    }

    const client = await this.getClient();
    await client.subscribe(channel);

    const messageHandler = (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    };

    client.on("message", messageHandler);

    this.subscriptions.get(channel).push({ client, callback, messageHandler });
  }

  async unsubscribe(channel, callback) {
    if (!this.subscriptions.has(channel)) {
      return;
    }

    const subscribers = this.subscriptions.get(channel);
    const index = callback
      ? subscribers.findIndex((sub) => sub.callback === callback)
      : 0;

    if (index !== -1) {
      const { client, messageHandler } = subscribers[index];
      await client.unsubscribe(channel);
      client.removeListener("message", messageHandler);
      subscribers.splice(index, 1);

      if (subscribers.length === 0) {
        this.subscriptions.delete(channel);
      }

      this.releaseClient(client);
    }
  }

  async multi() {
    const client = await this.getClient();
    const transaction = await client.multi();
    return new RedosPoolTransaction(transaction, client, this);
  }

  async watch(...keys) {
    const client = await this.getClient();
    try {
      await client.watch(...keys);
      const transaction = await client.multi();
      return new RedosPoolTransaction(transaction, client, this);
    } catch (error) {
      this.releaseClient(client);
      throw error;
    }
  }

  async unsubscribeAll(channel) {
    if (!this.subscriptions.has(channel)) {
      return;
    }

    const subscribers = this.subscriptions.get(channel);
    for (const { client, messageHandler } of subscribers) {
      await client.unsubscribe(channel);
      client.removeListener("message", messageHandler);
      this.releaseClient(client);
    }

    this.subscriptions.delete(channel);
  }

  async close() {
    for (const [channel, subscribers] of this.subscriptions.entries()) {
      for (const { client } of subscribers) {
        await client.unsubscribe(channel);
        client.close();
      }
    }
    this.subscriptions.clear();

    for (const client of this.pool) {
      client.close();
    }
    this.pool = [];
    this.waitingClients = [];
  }
}

class RedosPoolTransaction {
  constructor(transaction, client, pool) {
    this.transaction = transaction;
    this.client = client;
    this.pool = pool;
  }

  exec(command, ...args) {
    this.transaction.exec(command, ...args);
    return this;
  }

  async execute() {
    try {
      const result = await this.transaction.execute();
      this.pool.releaseClient(this.client);
      return result;
    } catch (error) {
      this.pool.releaseClient(this.client);
      throw error;
    }
  }

  async discard() {
    try {
      await this.transaction.discard();
      this.pool.releaseClient(this.client);
      return 'OK';
    } catch (error) {
      this.pool.releaseClient(this.client);
      throw error;
    }
  }
}

module.exports = RedosClientPool;