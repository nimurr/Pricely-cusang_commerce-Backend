// notifications controller 

const httpStatus = require("http-status");
const response = require("../config/response");
const { notificationsService } = require("../services");
const catchAsync = require("../utils/catchAsync");

const createNotification = catchAsync(async (req, res) => {

    const fcmToken = req.user.fcmToken;

    if (!fcmToken) {
        return res.status(400).json(
            response({
                message: "FCM token is required",
                status: "BAD_REQUEST",
                statusCode: httpStatus.BAD_REQUEST,
            })
        );
    }

    try {

        const notification = await notificationsService.createNotification(fcmToken);
        if (!notification) {
            return res.status(404).json(
                response({
                    message: "Notification not created",
                    status: "NOT_FOUND",
                    statusCode: httpStatus.NOT_FOUND,
                })
            );

        }
        res.status(200).json(
            response({
                message: "Notification created successfully",
                status: "OK",
                statusCode: httpStatus.OK,
                data: notification,
            })
        );
    } catch (error) {
        console.log(error);
    }
})

const getNotification = catchAsync(async (req, res) => {
    const { _id } = req.user;

    const notifications = await notificationsService.getNotification({ userId: _id });
    res.status(200).json(
        response({
            message: "Notifications retrieved successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            data: notifications,
        })
    );
})
const readAllNotification = catchAsync(async (req, res) => {
    const { _id } = req.user;

    const notifications = await notificationsService.readAllNotification({ userId: _id });
    res.status(200).json(
        response({
            message: "Notifications retrieved successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            data: notifications,
        })
    );
})

const updatePushNotification = catchAsync(async (req, res) => {
    const { _id } = req.user;
    const data = req.body;


    await notificationsService.updatePushNotification({
        id: _id,
        data,
    });

    res.status(200).json(
        response({
            message: "Notification preference updated successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            data: {},
        })
    );
});

const getPushNotification = catchAsync(async (req, res) => {
    const { _id } = req.user;
    const notifications = await notificationsService.getPushNotification({ userId: _id });
    res.status(200).json(
        response({
            message: "Notifications retrieved successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            data: notifications,
        })
    );
});


module.exports = {
    createNotification,
    getNotification,
    readAllNotification,
    updatePushNotification,
    getPushNotification
}