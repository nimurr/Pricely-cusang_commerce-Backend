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
    const product = await productService.createProduct(productUrl);
    res.status(201).json(
        response({
            message: "Product Added successfully",
            status: "OK",
            statusCode: httpStatus.CREATED,
            data: product,
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

module.exports = {
    createProduct,
    getProducts,
};  