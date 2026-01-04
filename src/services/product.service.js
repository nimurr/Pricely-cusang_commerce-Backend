const { default: axios } = require("axios");
const { Product } = require("../models");
const { sendEmail } = require("./email.service");
const keepaService = require("./keepa.service");
const cron = require('node-cron');

// --- Product functions ---
const createProduct = async ({ productUrl, userId }) => {
    if (!productUrl) throw new Error("Product URL is required");

    // Function to expand Amazon short URLs (a.co or c.co)
    async function expandShortAmazonUrl(shortUrl) {
        try {
            // Follow redirects automatically to get final URL
            const response = await axios.get(shortUrl, {
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 400
            });

            // Final URL after redirects
            return response.request.res.responseUrl || shortUrl;

        } catch (err) {
            throw new Error("Failed to expand short URL: " + err.message);
        }
    }

    // Detect short Amazon URL
    if (productUrl.includes("a.co/") || productUrl.includes("c.co/")) {
        console.log("Short Amazon URL detected, expanding...");
        productUrl = await expandShortAmazonUrl(productUrl);
        console.log("Expanded URL:", productUrl);
    }

    // Extract ASIN from full URL
    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) throw new Error("Invalid Amazon product URL");

    const asin = asinMatch[1];

    // Check if product already exists
    const existingProduct = await Product.findOne({ url: productUrl, userId, isDelete: false });
    if (existingProduct) {
        throw new Error("Product already exists");
    }

    // Limit products per user
    const count = await Product.countDocuments({ userId, isDelete: false });
    if (count > 2) {
        throw new Error("Product limit reached. You can only add up to 3 products.");
    }

    // Fetch product data from Keepa
    const keepaResponse = await keepaService.fetchProductData(asin);
    if (!keepaResponse.products || !keepaResponse.products.length) {
        throw new Error("Keepa returned no product data");
    }

    const product = keepaResponse.products[0];

    const productData = {
        userId,
        url: productUrl,
        product: {
            asin: product.asin,
            title: product.title,
            brand: product.brand,
            description: product.description,
            images: product.images,
            imageBaseURL: "https://m.media-amazon.com/images/I/",
            features: product.features,
            price: product?.stats.current[4] / 100,
            lastFivePrices: {
                day5: product?.stats.avg[0] / 100,
                day4: product?.stats.avg30[0] / 100,
                day3: product?.stats.avg90[0] / 100,
                day2: product?.stats.avg180[0] / 100,
                day1: product?.stats.avg365[0] / 100,
            }
        }
    };

    const savedProduct = await Product.create(productData);
    return savedProduct;
};

const getProducts = async () => {
    const products = await Product.find({ isDelete: false }).sort({ createdAt: -1 })
    // product persentage depent on last 5 days price 
    products.forEach(product => {
        const currentPrice = product.product.price;
        const lastFivePrices = product.product.lastFivePrices;
        const percentageChange = ((currentPrice - lastFivePrices.day5) / lastFivePrices.day5) * 100;
        product.product.percentageChange = percentageChange.toFixed(2);
        product.save();
    })

    return products;
};

const getHistory = async (userId) => {
    const data = await Product.find({ userId: userId, isDelete: true }).sort({ createdAt: -1 });
    data.forEach(product => {
        const currentPrice = product.product.price;
        const lastFivePrices = product.product.lastFivePrices;
        const percentageChange = ((currentPrice - lastFivePrices.day5) / lastFivePrices.day5) * 100;
        product.product.percentageChange = percentageChange.toFixed(2);
        product.save();
    })
    return data;
};

const getProductById = async (id) => {
    const product = await Product.findById(id);
    if (!product) {
        throw new Error("Product not found");
    }

    const currentPrice = product.product.price;
    const lastFivePrices = product.product.lastFivePrices;
    const percentageChange = ((currentPrice - lastFivePrices.day5) / lastFivePrices.day5) * 100;
    product.product.percentageChange = percentageChange.toFixed(2);
    product.save();

    return product;
};

const deleteProductById = async (id) => {
    return await Product.findByIdAndUpdate(id, { isDelete: true });
};

const deleteHistoryById = async (id) => {
    return await Product.findByIdAndDelete(id);
};

// --- Cron job: Run every 12 hours (12 AM & 12 PM) ---
// cron.schedule('*/10 * * * * *',
cron.schedule('0 0 0,12 * * *',
    async () => {
        const time = new Date();
        console.log('Running cron job at:', time.toLocaleString());

        try {
            const products = await Product.find({ isDelete: false }).populate('userId', 'email');

            for (const product of products) {
                const user = product.userId;

                // Skip if no user or email
                if (!user || !user.email) {
                    console.warn(`Skipping product ${product._id}: no user email`);
                    continue;
                }

                console.log('Processing product for:', user.email);

                // Keepa API call with rate-limit handling
                try {
                    const keepaResponse = await keepaService.fetchProductData(product.product.asin);

                    if (!keepaResponse.products || !keepaResponse.products.length) {
                        console.warn(`No Keepa data for ASIN: ${product.product.asin}`);
                        continue;
                    }

                    const latest = keepaResponse.products[0];

                    // Update product stats in DB
                    product.product.price = latest?.stats.current[0] / 100 || product.product.price;
                    product.product.lastFivePrices.avg = latest?.stats.avg[0] / 100 || product.product.lastFivePrices.avg;
                    product.product.lastFivePrices.avg30 = latest?.stats.avg30[0] / 100 || product.product.lastFivePrices.avg30;
                    product.product.lastFivePrices.avg90 = latest?.stats.avg90[0] / 100 || product.product.lastFivePrices.avg90;
                    product.product.lastFivePrices.avg180 = latest?.stats.avg180[0] / 100 || product.product.lastFivePrices.avg180;
                    product.product.lastFivePrices.avg365 = latest?.stats.avg365[0] / 100 || product.product.lastFivePrices.avg365;

                    await product.save();

                    // Build email content
                    const emailText = `
                        Hello,

                        Here is the latest update for your product:
                          <br />
                        <br />

                        Title: ${product.product.title}
                        ASIN: ${product.product.asin}
                          <br />
                          <br />
                        Current Price: $${product.product.price.toFixed(2)}

                        <br />
                        <br />

                        Average prices:
                          <br />
                        $${product.product.lastFivePrices.avg.toFixed(2)}  <br />
                      $${product.product.lastFivePrices.avg30.toFixed(2)}  <br />
                        $${product.product.lastFivePrices.avg90.toFixed(2)}  <br />
                         $${product.product.lastFivePrices.avg180.toFixed(2)}  <br />
                         $${product.product.lastFivePrices.avg365.toFixed(2)}  <br />

                        <br />
                        <br />

                        Product URL: ${product.url}
                          <br />
                        <br />

                        Regards,<br />
                        Your Product Tracker
                    `;

                    const emailSubject = `Product Update: ${product.product.title}`;
                    const to = user.email;
                    const text = emailText;
                    // Send email
                    await sendEmail(
                        to,
                        emailSubject,
                        text
                    );

                    await new Promise(resolve => setTimeout(resolve, 1500));

                } catch (err) {
                    if (err.response?.status === 429) {
                        console.warn(`Keepa rate limit reached for ASIN: ${product.product.asin}, skipping this product`);
                        continue; // skip this product
                    }
                    console.error(`Error fetching Keepa data for ASIN: ${product.product.asin}`, err);
                }
            }

            console.log('Cron job finished successfully.');
        } catch (err) {
            console.error('Cron job failed:', err);
        }
    }, {
    timezone: 'Asia/Bangkok' // adjust to your timezone
});

module.exports = {
    createProduct,
    getProducts,
    getHistory,
    getProductById,
    deleteProductById,
    deleteHistoryById
};
