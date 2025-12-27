const httpStatus = require("http-status");
const { feedbackService } = require("../services");
const response = require("../config/response");
const catchAsync = require("../utils/catchAsync");

const createFeedback = catchAsync(async (req, res) => {
    const feedbackData = req.body;
    if (!feedbackData.title || !feedbackData.message) {
        return res.status(httpStatus.BAD_REQUEST).json(
            response({
                message: "Title and message are required",
                status: "BAD_REQUEST",
                statusCode: httpStatus.BAD_REQUEST,
            })
        );
    }
    // Here you would typically call a service to handle the feedback creation logic
    const createdFeedback = feedbackService.createFeedback(feedbackData);

    res.status(httpStatus.CREATED).json(
        response({
            message: "Feedback Submitted successfully",
            status: "OK",
            statusCode: httpStatus.CREATED,
            data: createdFeedback,
        })
    );
})
module.exports = {
    createFeedback,
};