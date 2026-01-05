const { default: axios } = require("axios");
const { Product } = require("../models");
const { sendEmail } = require("./email.service");
const keepaService = require("./keepa.service");
const cron = require('node-cron');
const sendPushNotification = require("../middlewares/sendPushNotification");

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
            price: product?.stats.current[0] / 100,
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
// cron.schedule('0 0 0,12 * * *',
//     async () => {
//         const time = new Date();
//         console.log('Running cron job at:', time.toLocaleString());

//         try {
//             const products = await Product.find({ isDelete: false }).populate('userId', 'email');

//             for (const product of products) {
//                 const user = product.userId;

//                 // Skip if no user or email
//                 if (!user || !user.email) {
//                     console.warn(`Skipping product ${product._id}: no user email`);
//                     continue;
//                 }

//                 console.log('Processing product for:', user.email);

//                 // Keepa API call with rate-limit handling
//                 try {
//                     const keepaResponse = await keepaService.fetchProductData(product.product.asin);

//                     if (!keepaResponse.products || !keepaResponse.products.length) {
//                         console.warn(`No Keepa data for ASIN: ${product.product.asin}`);
//                         continue;
//                     }

//                     const latest = keepaResponse.products[0];

//                     // Update product stats in DB
//                     product.product.price = latest?.stats.current[0] / 100 || product.product.price;
//                     product.product.lastFivePrices.day5 = latest?.stats.day5[0] / 100 || product.product.lastFivePrices.day5;
//                     product.product.lastFivePrices.day4 = latest?.stats.day4[0] / 100 || product.product.lastFivePrices.day4;
//                     product.product.lastFivePrices.day3 = latest?.stats.day3[0] / 100 || product.product.lastFivePrices.day3;
//                     product.product.lastFivePrices.day2 = latest?.stats.day2[0] / 100 || product.product.lastFivePrices.day2;
//                     product.product.lastFivePrices.day1 = latest?.stats.day1[0] / 100 || product.product.lastFivePrices.day1;

//                     await product.save();

//                     // Build email content
//                     const emailText = `
//                         Hello,

//                         Here is the latest update for your product:
//                           <br />
//                         <br />

//                         Title: ${product.product.title}
//                         ASIN: ${product.product.asin}
//                           <br />
//                           <br />
//                         Current Price: $${product.product.price.toFixed(2)}

//                         <br />
//                         <br />

//                         Average prices:
//                           <br />
//                         $${product.product.lastFivePrices.day5.toFixed(2)}  <br />
//                       $${product.product.lastFivePrices.day4.toFixed(2)}  <br />
//                         $${product.product.lastFivePrices.day3.toFixed(2)}  <br />
//                          $${product.product.lastFivePrices.day2.toFixed(2)}  <br />
//                          $${product.product.lastFivePrices.day1.toFixed(2)}  <br />

//                         <br />
//                         <br />

//                         Product URL: ${product.url}
//                           <br />
//                         <br />

//                         Regards,<br />
//                         Your Product Tracker
//                     `;

//                     const emailSubject = `Product Update: ${product.product.title}`;
//                     const to = user.email;
//                     const text = emailText;
//                     // Send email
//                     await sendEmail(
//                         to,
//                         emailSubject,
//                         text
//                     );

//                     await new Promise(resolve => setTimeout(resolve, 1500));

//                 } catch (err) {
//                     if (err.response?.status === 429) {
//                         console.warn(`Keepa rate limit reached for ASIN: ${product.product.asin}, skipping this product`);
//                         continue; // skip this product
//                     }
//                     console.error(`Error fetching Keepa data for ASIN: ${product.product.asin}`, err);
//                 }
//             }

//             console.log('Cron job finished successfully.');
//         } catch (err) {
//             console.error('Cron job failed:', err);
//         }
//     }, {
//     timezone: 'Asia/Bangkok' // adjust to your timezone
// });


// for push notification with cron firebase 

// cron.schedule('0 0 0,12 * * *', async () => {
//     const products = await Product.find({ isDelete: false }).populate('userId', 'email fcmTokens');

//     for (const product of products) {
//         if (!product.userId) continue;

//         // Fetch latest Keepa data
//         const keepaResponse = await keepaService.fetchProductData(product.product.asin);
//         if (!keepaResponse.products || !keepaResponse.products.length) continue;

//         const latest = keepaResponse.products[0];
//         product.product.price = latest?.stats.current[0] / 100 || product.product.price;

//         product.product.price = latest?.stats.current[0] / 100 || product.product.price;
//         product.product.lastFivePrices.day5 = latest?.stats.avg[0] / 100 || product.product.lastFivePrices.day5;
//         product.product.lastFivePrices.day4 = latest?.stats.avg30[0] / 100 || product.product.lastFivePrices.day4;
//         product.product.lastFivePrices.day3 = latest?.stats.avg90[0] / 100 || product.product.lastFivePrices.day3;
//         product.product.lastFivePrices.day2 = latest?.stats.avg180[0] / 100 || product.product.lastFivePrices.day2;
//         product.product.lastFivePrices.day1 = latest?.stats.avg365[0] / 100 || product.product.lastFivePrices.day1;

//         await product.save();
//         // Send push notification
//         const title = `Price Update: ${product.product.title}`;
//         const body = `Current price: $${product.product.price.toFixed(2)}`;

//         await sendPushNotification(product.userId.fcmToken, title, body, { product: product.product.title, price: product.product.price.toFixed(2), image: product.product.images[0] });
//     }
// }, { timezone: 'Asia/Bangkok' });


module.exports = {
    createProduct,
    getProducts,
    getHistory,
    getProductById,
    deleteProductById,
    deleteHistoryById
};
