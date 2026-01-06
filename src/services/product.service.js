const axios = require("axios");
const cron = require("node-cron");
const { Product } = require("../models");
const keepaService = require("./keepa.service");
const { setRedis, getRedis, delRedis } = require("../utils/redisClient");
const { sendPushNotification } = require("../utils/pushNotification");

/* -------------------------------------------------------------------------- */
/*                                CREATE PRODUCT                               */
/* -------------------------------------------------------------------------- */

const createProduct = async ({ productUrl, userId }) => {
    if (!productUrl) throw new Error("Product URL is required");

    // Expand Amazon short URL
    const expandShortAmazonUrl = async (shortUrl) => {
        const response = await axios.get(shortUrl, {
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400
        });
        return response.request.res.responseUrl || shortUrl;
    };

    if (productUrl.includes("a.co/") || productUrl.includes("c.co/")) {
        productUrl = await expandShortAmazonUrl(productUrl);
    }

    // Extract ASIN
    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/);
    if (!asinMatch) throw new Error("Invalid Amazon product URL");

    const asin = asinMatch[1];

    // Check duplicate
    const exists = await Product.findOne({ url: productUrl, userId, isDelete: false });
    if (exists) throw new Error("Product already exists");

    // Limit per user
    const count = await Product.countDocuments({ userId, isDelete: false });
    if (count >= 3) throw new Error("Product limit reached");

    // Keepa API
    const keepaResponse = await keepaService.fetchProductData(asin);
    if (!keepaResponse.products?.length) {
        throw new Error("Keepa returned no product data");
    }

    const kp = keepaResponse.products[0];

    const productData = {
        userId,
        url: productUrl,
        product: {
            asin: kp.asin,
            title: kp.title,
            brand: kp.brand,
            description: kp.description,
            images: kp.images,
            imageBaseURL: "https://m.media-amazon.com/images/I/",
            features: kp.features,
            price: kp?.stats?.current?.[0] / 100,
            lastFivePrices: {
                day5: kp?.stats?.avg?.[0] / 100,
                day4: kp?.stats?.avg30?.[0] / 100,
                day3: kp?.stats?.avg90?.[0] / 100,
                day2: kp?.stats?.avg180?.[0] / 100,
                day1: kp?.stats?.avg365?.[0] / 100,
            }
        }
    };

    const saved = await Product.create(productData);

    // 🔥 Invalidate cache
    await delRedis("products:all");
    await delRedis(`history:${userId}`);

    return saved;
};

/* -------------------------------------------------------------------------- */
/*                                  ADD NOTE                                   */
/* -------------------------------------------------------------------------- */

const addNote = async (id, note) => {
    const product = await Product.findByIdAndUpdate(id, { note }, { new: true });
    if (!product) throw new Error("Product not found");

    await delRedis(`product:${id}`);
    await delRedis("products:all");

    return product;
};

/* -------------------------------------------------------------------------- */
/*                              MARK AS PURCHASED                              */
/* -------------------------------------------------------------------------- */

const markAsPurchased = async (id) => {
    const product = await Product.findByIdAndUpdate(
        id,
        { isPurchased: true, isDelete: true },
        { new: true }
    );

    if (!product) throw new Error("Product not found");

    await delRedis("products:all");
    await delRedis(`product:${id}`);
    await delRedis(`history:${product.userId}`);

    return product;
};

/* -------------------------------------------------------------------------- */
/*                                 GET PRODUCTS                                */
/* -------------------------------------------------------------------------- */

const getProducts = async () => {
    const cacheKey = "products:all";

    const cached = await getRedis(cacheKey);
    if (cached) {
        return cached
    };

    const products = await Product.find({ isDelete: false })
        .sort({ createdAt: -1 })
        .lean();

    console.log(products)

    const response = products.map(p => {
        const day5 = p.product.lastFivePrices.day5;
        const current = p.product.price;

        p.product.percentageChange = day5
            ? (((current - day5) / day5) * 100).toFixed(2)
            : "0.00";

        return p;
    });

    await setRedis(cacheKey, response, 300);

    return response;
};

/* -------------------------------------------------------------------------- */
/*                                 GET HISTORY                                 */
/* -------------------------------------------------------------------------- */

const getHistory = async (userId) => {
    const cacheKey = `history:${userId}`;

    const cached = await getRedis(cacheKey);
    if (cached) return cached;

    const products = await Product.find({
        userId,
        isDelete: true
    }).sort({ createdAt: -1 }).lean();

    let totalDifference = 0;

    const response = products.map(p => {
        if (p.isPurchased) {
            const diff = p.product.price - (p.product.lastFivePrices.day5 || 0);
            p.product.saveAmount = Number(diff.toFixed(2));
            totalDifference += diff;
        } else {
            p.product.saveAmount = 0;
        }
        return p;
    });

    const data = {
        totalDifference: Number(totalDifference.toFixed(2)),
        products: response
    };

    await setRedis(cacheKey, data, 300);

    return data;
};

/* -------------------------------------------------------------------------- */
/*                              GET PRODUCT BY ID                              */
/* -------------------------------------------------------------------------- */

const getProductById = async (id) => {
    const cacheKey = `product:${id}`;

    const cached = await getRedis(cacheKey);
    if (cached) return cached;

    const product = await Product.findById(id).lean();
    if (!product) throw new Error("Product not found");

    const prices = Object.values(product.product.lastFivePrices)
        .filter(p => p != null);

    product.product.lowestPrice =
        prices.length ? Math.min(...prices) : null;

    await setRedis(cacheKey, product, 300);

    return product;
};

/* -------------------------------------------------------------------------- */
/*                                  DELETE                                     */
/* -------------------------------------------------------------------------- */

const deleteProductById = async (id) => {
    const product = await Product.findByIdAndUpdate(id, { isDelete: true });
    if (product) {
        await delRedis("products:all");
        await delRedis(`product:${id}`);
        await delRedis(`history:${product.userId}`);
    }
    return product;
};

const deleteHistoryById = async (id) => {
    return await Product.findByIdAndDelete(id);
};

/* -------------------------------------------------------------------------- */
/*                        CRON For Push Notification                          */
/* -------------------------------------------------------------------------- */

cron.schedule('0 0 0,12 * * *', async () => {
    const products = await Product
        .find({ isDelete: false })
        .populate('userId', 'fcmTokens');

    for (const product of products) {
        if (!product.userId || !product.userId.fcmTokens?.length) continue;

        // Fetch latest Keepa data
        const keepaResponse = await keepaService.fetchProductData(product.product.asin);
        if (!keepaResponse.products?.length) continue;

        const latest = keepaResponse.products[0];

        // Update prices
        product.product.price = latest.stats.current[0] / 100;
        product.product.lastFivePrices.day5 = latest.stats.avg[0] / 100;
        product.product.lastFivePrices.day4 = latest.stats.avg30[0] / 100;
        product.product.lastFivePrices.day3 = latest.stats.avg90[0] / 100;
        product.product.lastFivePrices.day2 = latest.stats.avg180[0] / 100;
        product.product.lastFivePrices.day1 = latest.stats.avg365[0] / 100;

        await product.save();

        // ✅ Pick ONE device token
        const singleToken = product.userId.fcmTokens.at(-1);

        await sendPushNotification(
            singleToken,
            product.product.title,
            product.product,
            product.userId._id
        );
    }
}, { timezone: 'Asia/Bangkok' });

/* -------------------------------------------------------------------------- */
/*                                   EXPORTS                                   */
/* -------------------------------------------------------------------------- */

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


