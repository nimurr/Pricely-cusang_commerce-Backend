const Joi = require("joi");

const createProduct = {
    body: Joi.object().keys({
        productUrl: Joi.string().uri().required(),
    }),
};

module.exports = {
    createProduct,
};