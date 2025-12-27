const { Product } = require("../models");

const createProduct = async (productUrl) => {
    // const product = { id: Date.now(), url: productUrl };
    const product = { url: productUrl, product: { name: "Sample Product", price: 99.99 } };

    const savedProduct = await Product.create(product);

    return savedProduct;
}

const getProducts = async () => {
    // Logic to get all products
    return [];
}

module.exports = {
    createProduct,
    getProducts,
};