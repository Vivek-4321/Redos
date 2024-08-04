class RedosPipeline {
  constructor(clientPool) {
    this.clientPool = clientPool;
    this.commands = [];
  }

  exec(method, ...args) {
    this.commands.push({ method, args });
    return this;
  }

  async execute() {
    const client = await this.clientPool.getClient();
    try {
      const results = await client.sendCommand("pipeline", this.commands);
      this.clientPool.releaseClient(client);
      return results;
    } catch (error) {
      this.clientPool.handleClientError(client, error);
      throw error;
    }
  }

  // Redos command methods
  set(key, value) {
    return this.exec("set", key, value);
  }

  get(key) {
    return this.exec("get", key);
  }

  del(key) {
    return this.exec("del", key);
  }

  // Additional Redos command methods
  lpush(key, ...values) {
    return this.exec("lpush", key, ...values);
  }

  rpush(key, ...values) {
    return this.exec("rpush", key, ...values);
  }

  lpop(key) {
    return this.exec("lpop", key);
  }

  rpop(key) {
    return this.exec("rpop", key);
  }

  sadd(key, ...members) {
    return this.exec("sadd", key, ...members);
  }

  srem(key, ...members) {
    return this.exec("srem", key, ...members);
  }

  smembers(key) {
    return this.exec("smembers", key);
  }

  hset(key, field, value) {
    return this.exec("hset", key, field, value);
  }

  hget(key, field) {
    return this.exec("hget", key, field);
  }

  hgetall(key) {
    return this.exec("hgetall", key);
  }

  expire(key, seconds) {
    return this.exec("expire", key, seconds);
  }
}
