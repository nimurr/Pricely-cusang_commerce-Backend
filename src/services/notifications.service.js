// notifications service 

const { Notification } = require("../models");

const createNotification = async (data) => {
    const notification = await Notification.create(data);
    return notification
}

module.exports = { createNotification }