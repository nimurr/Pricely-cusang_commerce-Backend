const httpStatus = require("http-status");
const { analysisHistoryService } = require("../services");
const ApiError = require("../utils/ApiError");
const response = require("../config/response");

const createHistory = async (req, res) => {
    const { _id } = req.user
    const body = req.body
    const data = { userId: _id, analysisData: body }
    try {
        const history = await analysisHistoryService.createHistory(data);
        res.status(200).send({
            message: "History Created",
            status: "OK",
            statusCode: 201,
            data: history
        });
    } catch (error) {
        console.log(error);
    }
}

const getHistory = async (req, res) => {
    const { _id } = req.user
    try {
        const history = await analysisHistoryService.getHistory(_id);
        res.status(200).send({
            message: "History Fetched",
            status: "OK",
            statusCode: 200,
            data: history
        });
    } catch (error) {
        console.log(error);
    }
}

const getHistoryById = async (req, res) => {
    const { id } = req.params
    try {
        const history = await analysisHistoryService.getHistoryById(id);

        res.status(httpStatus.OK).json(
            response({
                message: "History Fetched",
                status: "OK",
                statusCode: httpStatus.OK,
                data: history,
            })
        );

    } catch (error) {
        console.log(error);
    }
}

module.exports = {
    createHistory,
    getHistory,
    getHistoryById
}