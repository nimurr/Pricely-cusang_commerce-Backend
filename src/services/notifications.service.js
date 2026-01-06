
const { Notification } = require("../models");
const { getRedis, setRedis, delRedis } = require("../utils/redisClient");

/* -------------------------------------------------------------------------- */
/*                            CREATE NOTIFICATION                             */
/* -------------------------------------------------------------------------- */

const createNotification = async (data) => {
    const notification = await Notification.create(data);

    // 🔥 Invalidate user's notification cache
    const cacheKey = `notifications:unread:${data.userId}`;
    await delRedis(cacheKey);

    return notification;
};

/* -------------------------------------------------------------------------- */
/*                             GET NOTIFICATIONS                              */
/* -------------------------------------------------------------------------- */


const getNotification = async ({ userId }) => {
    const cacheKey = `notifications:unread:${userId}`;


    // ✅ 1. Try Redis first
    const cached = await getRedis(cacheKey);
    if (cached) {
        return cached;
    }

    // ✅ 2. Fetch from DB
    const notifications = await Notification.find({
        userId
    })
        .sort({ createdAt: -1 })
        .populate("products")
        .lean();

    // ✅ 3. Store in Redis (5 min cache)
    await setRedis(cacheKey, notifications, 300);

    return notifications;
};

/* -------------------------------------------------------------------------- */
/*                            READ ALL NOTIFICATIONS                          */
/* -------------------------------------------------------------------------- */

const readAllNotification = async ({ userId }) => {

    const notifications = await Notification.updateMany(
        { userId },
        { status: "read" }
    );

    const cacheKey = `notifications:unread:${userId}`;
    await delRedis(cacheKey);

    return notifications
}

module.exports = {
    createNotification,
    getNotification,
    readAllNotification
};
