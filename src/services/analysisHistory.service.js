const httpStatus = require("http-status");
const { AnalysisHistory } = require("../models");
const ApiError = require("../utils/ApiError");


const createHistory = async (data) => {
    try {
        const history = await AnalysisHistory.create(data);
        return history
    } catch (error) {
        console.log(error);
    }
}

const getHistory = async (id) => {
    try {
        const history = await AnalysisHistory.find({ userId: id });
        return history
    } catch (error) {
        console.log(error);
    }
}

const getHistoryById = async (id) => {
    try {
        const history = await AnalysisHistory.findById(id);

        if (!history) {
            throw new ApiError(httpStatus.NOT_FOUND, "History not found");
        }

        return history
    } catch (error) {
        console.log(error);
    }
}


module.exports = {
    createHistory,
    getHistory,
    getHistoryById
}