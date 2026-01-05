// notifications controller 

const response = require("../config/response");
const { notificationsService } = require("../services");

const createNotification = async (req, res) => {
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
}

module.exports = {
    createNotification
}