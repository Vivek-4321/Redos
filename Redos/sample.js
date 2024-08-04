//sample.js
const RedosClientPool = require("./redos-client-pool");

async function main() {
  const clientPool = new RedosClientPool({
    port: 6379,
    poolSize: 5,
    retryInterval: 5000,
    maxRetries: 10,
  });

  try {
    await clientPool.init();
    console.log("Connected to Redos server");

    // Basic operations
    console.log("\n--- Basic Operations ---");
    await clientPool.set("mykey", "Hello, Redos!");
    console.log("Set 'mykey':", await clientPool.get("mykey"));
    console.log("Delete 'mykey':", await clientPool.del("mykey"));
    console.log("Get 'mykey' after delete:", await clientPool.get("mykey"));

    // List operations
    console.log("\n--- List Operations ---");
    await clientPool.lpush("mylist", "world", "hello");
    await clientPool.rpush("mylist", "redos");
    console.log("Left pop 'mylist':", await clientPool.lpop("mylist"));
    console.log("Right pop 'mylist':", await clientPool.rpop("mylist"));

    // Set operations
    console.log("\n--- Set Operations ---");
    await clientPool.del("myset"); // Ensure the key is cleared before use
    await clientPool.sadd("myset", "member1", "member2", "member3");
    console.log("Members of 'myset':", await clientPool.smembers("myset"));
    console.log("Remove 'member2' from 'myset':", await clientPool.srem("myset", "member2"));
    console.log("Members of 'myset' after removal:", await clientPool.smembers("myset"));

    // Hash operations
    console.log("\n--- Hash Operations ---");
    await clientPool.hset("myhash", "field1", "value1");
    await clientPool.hset("myhash", "field2", "value2");
    console.log("Get 'field1' from 'myhash':", await clientPool.hget("myhash", "field1"));
    console.log("Get all from 'myhash':", await clientPool.hgetall("myhash"));

    // Pub/Sub operations
    console.log("\n--- Pub/Sub Operations ---");
    const messageHandler = (message) => {
      console.log("Received message:", message);
    };
    await clientPool.subscribe("mychannel", messageHandler);
    console.log("Subscribed to 'mychannel'");
    await clientPool.publish("mychannel", "Hello, subscribers!");
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for message to be received
    await clientPool.unsubscribe("mychannel", messageHandler);
    console.log("Unsubscribed from 'mychannel'");

    // Expiration
    console.log("\n--- Expiration ---");
    await clientPool.set("expiring_key", "This will expire");
    await clientPool.expire("expiring_key", 5);
    console.log("Value of 'expiring_key':", await clientPool.get("expiring_key"));
    console.log("Waiting for key to expire...");
    await new Promise((resolve) => setTimeout(resolve, 6000));
    console.log("Value of 'expiring_key' after expiration:", await clientPool.get("expiring_key"));

    // Transactions
    console.log("\n--- Transactions ---");
    const transaction = await clientPool.multi();
    transaction.exec("set", "tx_key1", "value1");
    transaction.exec("set", "tx_key2", "value2");
    transaction.exec("get", "tx_key1");
    transaction.exec("get", "tx_key2");
    const txResults = await transaction.execute();
    console.log("Transaction results:", txResults);

    // Watch and conditional transaction
    console.log("\n--- Watch and Conditional Transaction ---");
    await clientPool.set("watched_key", "initial_value");
    const watchTransaction = await clientPool.watch("watched_key");
    watchTransaction.exec("set", "watched_key", "new_value");
    const currentValue = await clientPool.get("watched_key");
    if (currentValue === "initial_value") {
      const watchResults = await watchTransaction.execute();
      console.log("Watch transaction results:", watchResults);
    } else {
      await watchTransaction.discard();
      console.log("Watch transaction discarded due to changed key");
    }

    // Error handling
    console.log("\n--- Error Handling ---");
    try {
      await clientPool.sadd("not_a_set", "member");
    } catch (error) {
      console.error("Expected error:", error.message);
    }

  } catch (error) {
    console.error("Unexpected error:", error);
  } finally {
    // Clean up and close connections
    await clientPool.close();
    console.log("\nClient pool closed");
  }
}

main().catch((error) => {
  console.error("Error in main:", error);
  process.exit(1);
});