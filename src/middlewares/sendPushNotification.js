const admin = require("../utils/FirebasePush");

const sendPushNotification = async (fcmToken, title, body, data = {}) => {
    if (!fcmToken || fcmToken.length === 0) return;

    const message = {
        notification: {
            title: title,
            body: body,
        },
        data: data, // optional, for navigation in app
        tokens: fcmToken,
    };

    try {
        const response = await admin.messaging().sendMulticast(message);
        console.log(`Successfully sent: ${response.successCount}, failed: ${response.failureCount}`);
    } catch (err) {
        console.error("Error sending push notification:", err);
    }
};


module.exports = sendPushNotification;