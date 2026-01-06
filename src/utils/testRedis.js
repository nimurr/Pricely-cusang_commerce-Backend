const { setRedis, getRedis } = require("./redisClient");

const products = {
    "1": {
        name: "Product 1",
        price: 10.99,
    },
    "2": {
        name: "Product 2",
        price: 19.99,
    },
    "3": {
        name: "Product 3",
        price: 29.99,
    },
};

(async () => {
    // Set a test key

    await setRedis("testKey", products, 60);

    // Get the test key
    const value = await getRedis("testKey");
    console.log("Redis test value:", value);
})();
