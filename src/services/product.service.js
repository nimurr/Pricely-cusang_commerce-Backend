const { Product } = require("../models");
const keepaService = require("./keepa.service");

const createProduct = async ({ productUrl, userId }) => {
    if (!productUrl) throw new Error("Product URL is required");

    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) throw new Error("Invalid Amazon product URL");

    const existingProduct = await Product.findOne({ url: productUrl, userId: userId, isDelete: false });
    if (existingProduct) {
        throw new Error("Product already exists");
    }

    const count = await Product.countDocuments({ userId: userId, isDelete: false });
    if (count > 2) {
        throw new Error(" Product limit reached. You can only add up to 3 products.");
    }


    const asin = asinMatch[1];
    // Fetch from Keepa
    const keepaResponse = await keepaService.fetchProductData(asin);


    if (!keepaResponse.products || !keepaResponse.products.length) {
        throw new Error("Keepa returned no product data");
    }




    const product = keepaResponse.products[0];
    const productData = {
        userId: userId,
        url: productUrl,
        product: {
            asin: product.asin,
            title: product.title,
            brand: product.brand,
            description: product.description,
            images: product.images,
            imageBaseURL: "https://m.media-amazon.com/images/I/",
            features: product.features,
            price: product?.stats.current[1] / 100,
            lastFiveDays: {
                avg: product?.stats.current[4] / 100,
                avg30: product?.stats.current[4] / 100,
                avg90: product?.stats.current[4] / 100,
                avg180: product?.stats.current[4] / 100,
                avg365: product?.stats.current[4] / 100,
            },
        }
    }
    // Save to DB

    const savedProduct = await Product.create(productData);

    return savedProduct;
};

const getProducts = async () => {
    return await Product.find({ isDelete: false }).sort({ createdAt: -1 });
};

const getHistory = async (userId) => {
    // Placeholder for future implementation
    const data = await Product.find({ userId: userId, isDelete: true }).sort({ createdAt: -1 });
    return data;
};
const getProductById = async (id) => {
    return await Product.findById(id);
};

module.exports = {
    createProduct,
    getProducts,
    getHistory,
    getProductById
};


// const { Product } = require("../models");
// const keepaService = require("./keepa.service");

// /**
//  * Create a product from Amazon URL using Keepa
//  */
// const createProduct = async (productUrl) => {
//   if (!productUrl) throw new Error("Product URL is required");

//   const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/);
//   if (!asinMatch) throw new Error("Invalid Amazon product URL");

//   const asin = asinMatch[1];

//   // Fetch product from Keepa
//   const keepaProduct = await keepaService.fetchProductData(asin);

//   const productData = {
//     url: productUrl,
//     product: {
//       asin: keepaProduct.asin,
//       title: keepaProduct.title,
//       brand: keepaProduct.brand,
//       features: keepaProduct.features,
//       images: keepaProduct.images,
//       imageBaseURL: "https://m.media-amazon.com/images/I/",
//       price: keepaProduct.price,
//       lastUpdate: keepaProduct.lastUpdate
//     }
//   };

//   // Save to MongoDB
//   const savedProduct = await Product.create(productData);

//   return savedProduct;
// };

// /**
//  * Get all products
//  */
// const getProducts = async () => {
//   return await Product.find().sort({ createdAt: -1 });
// };

// module.exports = {
//   createProduct,
//   getProducts
// };
