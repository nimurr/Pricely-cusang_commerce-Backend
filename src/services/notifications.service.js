const { Notification, User } = require("../models");
const { getRedis, setRedis, delRedis } = require("../utils/redisClient");
const { sendPushNotification } = require("../utils/pushNotification");

/* -------------------------------------------------------------------------- */
/*                            CREATE NOTIFICATION                             */
/* -------------------------------------------------------------------------- */

const createNotification = async (fcmToken) => {

    const title = "Product 1 price has dropped!";
    const price = 10.99;
    await sendPushNotification({ fcmToken, title, price, });

    return fcmToken;
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

const updatePushNotification = async ({ id, data }) => {
    console.log("USER ID:", id);

    // User declined push notification
    if (!data.isPushNotification) {
        return await User.updateOne(
            { _id: id },
            {
                $set: {
                    oneTimePushAcceptedorReject: true,
                    isPushNotification: false,
                },
                $inc: {
                    declineCount: 1,
                },
            }
        );
    }

    // User accepted push notification
    return await User.updateOne(
        { _id: id },
        {
            $set: {
                oneTimePushAcceptedorReject: true,
                isPushNotification: true,
            },
            $inc: {
                declineCount: 3,
            },
        }
    );
};

const getPushNotification = async ({ userId }) => {

    return await User.findById({ _id: userId }, 'isPushNotification oneTimePushAcceptedorReject declineCount ');
}


module.exports = {
    createNotification,
    getNotification,
    readAllNotification,
    updatePushNotification,
    getPushNotification
};
