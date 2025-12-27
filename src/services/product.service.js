const { Product } = require("../models");
const keepaService = require("./keepa.service");

const createProduct = async (productUrl) => {
    if (!productUrl) throw new Error("Product URL is required");

    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) throw new Error("Invalid Amazon product URL");

    const asin = asinMatch[1];

    // Fetch from Keepa
    const keepaResponse = await keepaService.fetchProductData(asin);


    if (!keepaResponse.products || !keepaResponse.products.length) {
        throw new Error("Keepa returned no product data");
    }

    const product = keepaResponse.products[0];
    const productData = {
        url: productUrl,
        product: {
            asin: product.asin,
            title: product.title,
            brand: product.brand,
            currentPrice: product.currentPrice,
            buyBoxPrice: product.buyBoxPrice,
        }
    }
    console.log(product)
    // Save to DB

    const savedProduct = await Product.create(productData);

    return product;
};

const getProducts = async () => {
    return await Product.find().sort({ createdAt: -1 });
};

module.exports = {
    createProduct,
    getProducts,
};
