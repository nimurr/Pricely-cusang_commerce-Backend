const admin = require("../config/firebaseConfig");
const { Notification } = require("../models");

const sendPushNotification = async (fcmToken) => {
    if (!fcmToken) return;

    const message = {
        token: fcmToken, // ✅ single device token
        notification: {
            title: "Price Alert",
            body: `Your product 1 price has dropped! now is 10$`,
        },
        data: {
            productId: '6df4541sdf101445sdff415454sdf'
        }
    };

    try {
        const response = await admin.messaging().send(message);
        console.log("Push notification sent:", response);

    } catch (error) {
        console.error("Push notification error:", error);
    }
};

module.exports = { sendPushNotification };
