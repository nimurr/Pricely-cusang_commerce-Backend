const redis = require("redis");
const config = require("../config/config"); // or use process.env.REDIS_URL

// Create Redis client
const redisClient = redis.createClient({
    url: config.redisUrl || "redis://127.0.0.1:6379",
});

redisClient.on("connect", () => console.log("Redis connected"));
redisClient.on("error", (err) => console.error("Redis error:", err));

(async () => {
    await redisClient.connect();
})();

// Set value in Redis with optional expiration (in seconds)
const setRedis = async (key, value, expireInSec = 3600) => {
    try {
        // Redis only stores strings, so stringify objects
        const val = typeof value === "string" ? value : JSON.stringify(value);
        await redisClient.set(key, val, { EX: expireInSec });
    } catch (err) {
        console.error("Redis SET error:", err);
    }
};

// Get value from Redis
const getRedis = async (key) => {
    try {
        const value = await redisClient.get(key);
        if (!value) return null;

        // Try to parse JSON (if value is an object)
        try {
            return JSON.parse(value);
        } catch {
            return value; // return string if not JSON
        }
    } catch (err) {
        console.error("Redis GET error:", err);
        return null;
    }
};

module.exports = {
    redisClient,
    setRedis,
    getRedis,
};
