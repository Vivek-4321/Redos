# 🚀 Redos Database Documentation

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Usage](#usage)
  - [Basic Operations](#basic-operations)
  - [List Operations](#list-operations)
  - [Set Operations](#set-operations)
  - [Hash Operations](#hash-operations)
  - [Pub/Sub Operations](#pubsub-operations)
  - [Transactions](#transactions)
  - [Pipelining](#pipelining)
- [Concurrency and Atomicity](#concurrency-and-atomicity)
- [Performance Optimization](#performance-optimization)
- [Error Handling and Reliability](#error-handling-and-reliability)
- [Contributing](#contributing)
- [License](#license)

## Introduction

Welcome to Redos! 👋 A powerful, Redis-like database implemented in Node.js. Redos offers a comprehensive set of features including key-value storage, list and set operations, hashes, pub/sub functionality, transactions, and more. With its asynchronous design and connection pooling, Redos is built for high performance and concurrency.

## Features

- ✨ Key-value storage
- 📊 Lists, Sets, and Hashes
- 📡 Pub/Sub messaging
- 🔒 Transactions with optimistic locking (WATCH)
- 🚇 Pipelining for bulk operations
- 🔄 Asynchronous operations
- 🏊‍♂️ Connection pooling
- 💾 Data persistence
- 🛡️ Error handling and automatic reconnection

## Installation

To get started with Redos, follow these steps:

1. Clone the repository:

   ```
   git clone https://github.com/your-username/redos.git
   ```

2. Navigate to the project directory:

   ```
   cd redos
   ```

3. Install dependencies:
   ```
   npm install
   ```

## Getting Started

To start the Redos server:

```javascript
const RedosServer = require("./server");

const server = new RedosServer({ port: 6379 });
server.start();
```

To connect a client:

```javascript
const RedosClientPool = require("./redos-client-pool");

const clientPool = new RedosClientPool({
  port: 6379,
  poolSize: 5,
});

await clientPool.init();
```

## Usage

### Basic Operations

```javascript
await clientPool.set("mykey", "Hello, Redos!");
const value = await clientPool.get("mykey");
await clientPool.del("mykey");
```

### List Operations

```javascript
await clientPool.lpush("mylist", "world", "hello");
await clientPool.rpush("mylist", "redos");
const leftValue = await clientPool.lpop("mylist");
const rightValue = await clientPool.rpop("mylist");
```

### Set Operations

```javascript
await clientPool.sadd("myset", "member1", "member2", "member3");
const members = await clientPool.smembers("myset");
await clientPool.srem("myset", "member2");
```

### Hash Operations

```javascript
await clientPool.hset("myhash", "field1", "value1");
const fieldValue = await clientPool.hget("myhash", "field1");
const allFields = await clientPool.hgetall("myhash");
```

### Pub/Sub Operations

```javascript
await clientPool.subscribe("mychannel", (message) => {
  console.log("Received:", message);
});

await clientPool.publish("mychannel", "Hello, subscribers!");

await clientPool.unsubscribe("mychannel");
```

### Transactions

```javascript
const transaction = await clientPool.multi();
transaction.set("key1", "value1");
transaction.set("key2", "value2");
transaction.get("key1");
const results = await transaction.execute();
```

### Pipelining

```javascript
const pipeline = clientPool.pipeline();
pipeline.set("key1", "value1");
pipeline.set("key2", "value2");
pipeline.get("key1");
const results = await pipeline.execute();
```

## Concurrency and Atomicity

Redos supports high concurrency through its asynchronous design and connection pooling. Multiple clients can perform operations simultaneously.

Individual operations in Redos are atomic. For operations that require atomicity across multiple commands, use transactions (MULTI/EXEC) or the WATCH command for optimistic locking.

## Performance Optimization

- 🏊‍♂️ Connection pooling: Reuse connections to reduce overhead.
- 🚇 Pipelining: Send multiple commands in a single request to reduce network round trips.
- 🔄 Asynchronous operations: Non-blocking I/O for efficient resource utilization.

## Error Handling and Reliability

Redos includes robust error handling and automatic reconnection:

- Automatic retry on connection failure
- Event emission for error monitoring
- Graceful handling of client disconnections

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for more details.

## License

Redos is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

📚 For more detailed information about specific features or advanced usage, please refer to our [Wiki](https://github.com/your-username/redos/wiki).

🐛 Found a bug or have a feature request? Please open an [issue](https://github.com/your-username/redos/issues).

💖 Happy coding with Redos!
