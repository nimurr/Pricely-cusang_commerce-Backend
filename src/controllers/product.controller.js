const httpStatus = require("http-status");
const response = require("../config/response");
const catchAsync = require("../utils/catchAsync");
const { productService } = require("../services");


const createProduct = catchAsync(async (req, res) => {
    const { productUrl } = req.body;
    if (!productUrl) {
        return res.status(httpStatus.BAD_REQUEST).json(
            response({
                message: "Product URL is required",
                status: "BAD_REQUEST",
                statusCode: httpStatus.BAD_REQUEST,
            })
        );
    }
    const product = await productService.createProduct({ productUrl, userId: req.user.id });
    res.status(201).json(
        response({
            message: "Product Added successfully",
            status: "OK",
            statusCode: httpStatus.CREATED,
            data: product,
        })
    );
});

const addNote = catchAsync(async (req, res) => {
    const { note } = req.body;
    const id = req.params.id;
    const product = await productService.addNote(id, note);
    res.status(201).json(
        response({
            message: "Product Note Added successfully",
            status: "OK",
            statusCode: httpStatus.CREATED,
            data: {},
        })
    );
});

const markAsPurchased = catchAsync(async (req, res) => {
    const id = req.params.id;
    const product = await productService.markAsPurchased(id);
    res.status(201).json(
        response({
            message: "Product Marked as Purchased successfully",
            status: "OK",
            statusCode: httpStatus.CREATED,
            data: {},
        })
    );
});

const getProducts = catchAsync(async (req, res) => {
    const products = await productService.getProducts();

    res.status(200).json(
        response({
            message: "Products retrieved successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            data: products,
        })
    );
});

const getHistory = catchAsync(async (req, res) => {
    const history = await productService.getHistory(req.user.id);
    if (!history || history.length === 0) {
        return res.status(404).json(
            response({
                message: "Product history not found",
                status: "NOT_FOUND",
                statusCode: httpStatus.NOT_FOUND,
            })
        );
    }

    res.status(200).json(
        response({
            message: "Product history retrieved successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            data: history,
        })
    );
});

const getProductById = catchAsync(async (req, res) => {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
        return res.status(404).json(
            response({
                message: "Product not found",
                status: "NOT_FOUND",
                statusCode: httpStatus.NOT_FOUND,
            })
        );
    }
    res.status(200).json(
        response({
            message: "Product retrieved successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            data: product,
        })
    );
});

const deleteProductById = catchAsync(async (req, res) => {
    const product = await productService.deleteProductById(req.params.id);
    if (!product) {
        return res.status(404).json(
            response({
                message: "Product not found",
                status: "NOT_FOUND",
                statusCode: httpStatus.NOT_FOUND,
            })
        );
    }
    res.status(200).json(
        response({
            message: "Product deleted successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            // data: product,
        })
    );
});

const deleteHistoryById = catchAsync(async (req, res) => {
    const product = await productService.deleteHistoryById(req.params.id);
    if (!product) {
        return res.status(404).json(
            response({
                message: "Product not found",
                status: "NOT_FOUND",
                statusCode: httpStatus.NOT_FOUND,
            })
        );
    }
    res.status(200).json(
        response({
            message: "Product deleted successfully",
            status: "OK",
            statusCode: httpStatus.OK,
            // data: product,
        })
    );
});




module.exports = {
    createProduct,
    addNote,
    markAsPurchased,
    getProducts,
    getHistory,
    getProductById,
    deleteProductById,
    deleteHistoryById
};  