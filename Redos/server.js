// const net = require('net');
// const { Redos } = require('./redos');

// class RedosServer {
//   constructor(options = {}) {
//     this.redos = new Redos(options);
//     this.server = net.createServer((socket) => this.handleConnection(socket));
//     this.port = options.port || 6379;
//     this.subscribers = new Map();
//     this.transactions = new Map();
//   }

//   start() {
//     this.server.listen(this.port, () => {
//       console.log(`RedosServer listening on port ${this.port}`);
//     });
//   }

//   handleConnection(socket) {
//     console.log('New client connected');
//     let buffer = '';
//     socket.on('data', (data) => {
//       buffer += data.toString();
//       let endIndex;
//       while ((endIndex = buffer.indexOf('}')) !== -1) {
//         const command = buffer.substring(0, endIndex + 1);
//         buffer = buffer.substring(endIndex + 1);
//         this.handleCommand(socket, command);
//       }
//     });
//     socket.on('end', () => {
//       console.log('Client disconnected');
//       this.removeSubscriber(socket);
//       this.transactions.delete(socket);
//     });
//   }

//   handleCommand(socket, data) {
//     try {
//       const command = JSON.parse(data);
//       const { method, args } = command;

//       if (method === 'multi') {
//         this.handleMulti(socket);
//       } else if (method === 'exec') {
//         this.handleExec(socket);
//       } else if (method === 'discard') {
//         this.handleDiscard(socket);
//       } else if (method === 'watch') {
//         this.handleWatch(socket, args);
//       } else if (method === 'subscribe') {
//         this.handleSubscribe(socket, args[0]);
//       } else if (method === 'unsubscribe') {
//         this.handleUnsubscribe(socket, args[0]);
//       } else if (this.transactions.has(socket)) {
//         this.queueTransaction(socket, method, args);
//       } else if (typeof this.redos[method] === 'function') {
//         this.executeCommand(socket, method, args);
//       } else {
//         socket.write(JSON.stringify({ success: false, error: 'Invalid command' }) + '\n');
//       }
//     } catch (error) {
//       console.error('Error parsing command:', error);
//       socket.write(JSON.stringify({ success: false, error: 'Invalid command format' }) + '\n');
//     }
//   }

//   executeCommand(socket, method, args) {
//     try {
//       const result = this.redos[method](...args);
//       if (method === 'publish') {
//         this.notifySubscribers(args[0], args[1]);
//       }
//       socket.write(JSON.stringify({ success: true, result }) + '\n');
//     } catch (error) {
//       socket.write(JSON.stringify({ success: false, error: error.message }) + '\n');
//     }
//   }

//   handleMulti(socket) {
//     this.transactions.set(socket, this.redos.multi());
//     socket.write(JSON.stringify({ success: true, result: 'OK' }) + '\n');
//   }

//   queueTransaction(socket, method, args) {
//     const transaction = this.transactions.get(socket);
//     transaction.exec(method, ...args);
//     socket.write(JSON.stringify({ success: true, result: 'QUEUED' }) + '\n');
//   }

//   handleExec(socket) {
//     if (!this.transactions.has(socket)) {
//       socket.write(JSON.stringify({ success: false, error: 'EXEC without MULTI' }) + '\n');
//       return;
//     }

//     const transaction = this.transactions.get(socket);
//     const results = transaction.execute();
//     this.transactions.delete(socket);
//     socket.write(JSON.stringify({ success: true, result: results }) + '\n');
//   }

//   handleDiscard(socket) {
//     if (this.transactions.has(socket)) {
//       const transaction = this.transactions.get(socket);
//       transaction.discard();
//       this.transactions.delete(socket);
//       socket.write(JSON.stringify({ success: true, result: 'OK' }) + '\n');
//     } else {
//       socket.write(JSON.stringify({ success: false, error: 'DISCARD without MULTI' }) + '\n');
//     }
//   }

//   handleWatch(socket, keys) {
//     const transaction = this.redos.watch(...keys);
//     this.transactions.set(socket, transaction);
//     socket.write(JSON.stringify({ success: true, result: 'OK' }) + '\n');
//   }

//   handleSubscribe(socket, channel) {
//     const callback = (message) => {
//       socket.write(JSON.stringify({ type: 'message', channel, message }) + '\n');
//     };
//     this.redos.subscribe(channel, callback);
//     if (!this.subscribers.has(socket)) {
//       this.subscribers.set(socket, new Map());
//     }
//     this.subscribers.get(socket).set(channel, callback);
//     socket.write(JSON.stringify({ success: true, result: 'subscribed' }) + '\n');
//   }

//   handleUnsubscribe(socket, channel) {
//     if (this.subscribers.has(socket) && this.subscribers.get(socket).has(channel)) {
//       const callback = this.subscribers.get(socket).get(channel);
//       this.redos.unsubscribe(channel, callback);
//       this.subscribers.get(socket).delete(channel);
//       if (this.subscribers.get(socket).size === 0) {
//         this.subscribers.delete(socket);
//       }
//     }
//     socket.write(JSON.stringify({ success: true, result: 'unsubscribed' }) + '\n');
//   }

//   removeSubscriber(socket) {
//     if (this.subscribers.has(socket)) {
//       for (const [channel, callback] of this.subscribers.get(socket).entries()) {
//         this.redos.unsubscribe(channel, callback);
//       }
//       this.subscribers.delete(socket);
//     }
//   }

//   notifySubscribers(channel, message) {
//     this.redos.publish(channel, message);
//   }
// }

// const server = new RedosServer({ port: 6379, persistencePath: './redos-data.json' });
// server.start();

//======================================= woring below with event loop ==============================
//server.js
const net = require('net');
const { EventEmitter } = require('events');
const { Redos } = require('./redos');

class RedosServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redos = new Redos(options);
    this.port = options.port || 6379;
    this.subscribers = new Map();
    this.transactions = new Map();
    this.clients = new Set();
    this.eventQueue = [];
    this.isProcessing = false;
  }

  start() {
    this.server = net.createServer((socket) => this.handleConnection(socket));
    this.server.listen(this.port, () => {
      console.log(`RedosServer listening on port ${this.port}`);
    });
    this.startEventLoop();
  }

  startEventLoop() {
    setImmediate(() => this.processEventQueue());
  }

  async processEventQueue() {
    if (this.isProcessing) {
      setImmediate(() => this.processEventQueue());
      return;
    }

    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      await this.processEvent(event);
    }

    this.isProcessing = false;
    setImmediate(() => this.processEventQueue());
  }

  async processEvent(event) {
    const { socket, method, args } = event;
    try {
      const result = await this.executeCommand(socket, method, args);
      this.sendResponse(socket, { success: true, result });
    } catch (error) {
      this.sendResponse(socket, { success: false, error: error.message });
    }
  }

  handleConnection(socket) {
    console.log('New client connected');
    this.clients.add(socket);
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      let endIndex;
      while ((endIndex = buffer.indexOf('}')) !== -1) {
        const command = buffer.substring(0, endIndex + 1);
        buffer = buffer.substring(endIndex + 1);
        this.handleCommand(socket, command);
      }
    });

    socket.on('end', () => {
      console.log('Client disconnected');
      this.removeSubscriber(socket);
      this.transactions.delete(socket);
      this.clients.delete(socket);
    });
  }

  handleCommand(socket, data) {
    try {
      const command = JSON.parse(data);
      const { method, args } = command;

      if (method === 'multi') {
        this.handleMulti(socket);
      } else if (method === 'exec') {
        this.handleExec(socket);
      } else if (method === 'discard') {
        this.handleDiscard(socket);
      } else if (method === 'watch') {
        this.handleWatch(socket, args);
      } else if (method === 'subscribe') {
        this.handleSubscribe(socket, args[0]);
      } else if (method === 'unsubscribe') {
        this.handleUnsubscribe(socket, args[0]);
      } else if (this.transactions.has(socket)) {
        this.queueTransaction(socket, method, args);
      } else {
        this.eventQueue.push({ socket, method, args });
      }
    } catch (error) {
      console.error('Error parsing command:', error);
      this.sendResponse(socket, { success: false, error: 'Invalid command format' });
    }
  }

  async executeCommand(socket, method, args) {
    if (typeof this.redos[method] !== 'function') {
      throw new Error('Invalid command');
    }

    const result = await this.redos[method](...args);
    if (method === 'publish') {
      this.notifySubscribers(args[0], args[1]);
    }
    return result;
  }

  handleMulti(socket) {
    this.transactions.set(socket, this.redos.multi());
    this.sendResponse(socket, { success: true, result: 'OK' });
  }

  queueTransaction(socket, method, args) {
    const transaction = this.transactions.get(socket);
    transaction.exec(method, ...args);
    this.sendResponse(socket, { success: true, result: 'QUEUED' });
  }

  async handleExec(socket) {
    if (!this.transactions.has(socket)) {
      this.sendResponse(socket, { success: false, error: 'EXEC without MULTI' });
      return;
    }

    const transaction = this.transactions.get(socket);
    try {
      const results = await transaction.execute();
      this.transactions.delete(socket);
      this.sendResponse(socket, { success: true, result: results });
    } catch (error) {
      this.sendResponse(socket, { success: false, error: error.message });
    }
  }

  handleDiscard(socket) {
    if (this.transactions.has(socket)) {
      const transaction = this.transactions.get(socket);
      transaction.discard();
      this.transactions.delete(socket);
      this.sendResponse(socket, { success: true, result: 'OK' });
    } else {
      this.sendResponse(socket, { success: false, error: 'DISCARD without MULTI' });
    }
  }

  handleWatch(socket, keys) {
    const transaction = this.redos.watch(...keys);
    this.transactions.set(socket, transaction);
    this.sendResponse(socket, { success: true, result: 'OK' });
  }

  handleSubscribe(socket, channel) {
    const callback = (message) => {
      this.sendResponse(socket, { type: 'message', channel, message });
    };
    this.redos.subscribe(channel, callback);
    if (!this.subscribers.has(socket)) {
      this.subscribers.set(socket, new Map());
    }
    this.subscribers.get(socket).set(channel, callback);
    this.sendResponse(socket, { success: true, result: 'subscribed' });
  }

  handleUnsubscribe(socket, channel) {
    if (this.subscribers.has(socket) && this.subscribers.get(socket).has(channel)) {
      const callback = this.subscribers.get(socket).get(channel);
      this.redos.unsubscribe(channel, callback);
      this.subscribers.get(socket).delete(channel);
      if (this.subscribers.get(socket).size === 0) {
        this.subscribers.delete(socket);
      }
    }
    this.sendResponse(socket, { success: true, result: 'unsubscribed' });
  }

  removeSubscriber(socket) {
    if (this.subscribers.has(socket)) {
      for (const [channel, callback] of this.subscribers.get(socket).entries()) {
        this.redos.unsubscribe(channel, callback);
      }
      this.subscribers.delete(socket);
    }
  }

  notifySubscribers(channel, message) {
    this.redos.publish(channel, message);
  }

  sendResponse(socket, response) {
    socket.write(JSON.stringify(response) + '\n');
  }

  async close() {
    for (const socket of this.clients) {
      socket.end();
    }
    this.server.close();
    await this.redos.persist();
    console.log('RedosServer closed');
  }
}

const server = new RedosServer({ port: 6379, persistencePath: './redos-data.json' });
server.start();

// To gracefully shut down the server
process.on('SIGINT', async () => {
  console.log('Shutting down RedosServer...');
  await server.close();
  process.exit(0);
});