const admin = require("../config/firebaseConfig");
const { Notification } = require("../models");

const sendPushNotification = async (fcmToken, title, product, userId) => {
    if (!fcmToken) return;

    const message = {
        token: fcmToken, // ✅ single device token
        notification: {
            title: title,
            body: `Current price: $${product.price.toFixed(2)}`,
        },
        data: {
            productId: product._id.toString(),
            asin: product.asin,
            price: product.price.toString(),
        }
    };

    try {
        const response = await admin.messaging().send(message);
        console.log("Push notification sent:", response);

        // Save notification in DB
        await Notification.create({
            userId,
            products: product,
        });

    } catch (error) {
        console.error("Push notification error:", error);
    }
};

module.exports = { sendPushNotification };
