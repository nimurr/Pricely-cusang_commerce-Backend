// notifications controller 

const httpStatus = require("http-status");
const response = require("../config/response");
const { notificationsService } = require("../services");
const catchAsync = require("../utils/catchAsync");

const createNotification = catchAsync(async (req, res) => {
    try {

        const notification = await notificationsService.createNotification(req.body);
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

module.exports = {
    createNotification,
    getNotification,
    readAllNotification
}