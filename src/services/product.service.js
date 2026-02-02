const axios = require("axios");
const cron = require("node-cron");
const { Product } = require("../models");
const keepaService = require("./keepa.service");
const { setRedis, getRedis, delRedis } = require("../utils/redisClient");
const { sendPushNotification } = require("../utils/pushNotification");

// ============================================
// productController.js or wherever createProduct is - UPDATED
// ============================================
const createProduct = async ({ productUrl, userId }) => {
    if (!productUrl) throw new Error("Product URL is required");

    // 1️⃣ Extract clean https URL from messy string
    const urlMatch = productUrl.match(/https:\/\/[^\s]+/);
    if (!urlMatch) throw new Error("No valid https URL found");
    productUrl = urlMatch[0].trim();

    // 2️⃣ Limit per user
    const count = await Product.countDocuments({ userId, isDelete: false });
    if (count > 2) throw new Error("Maximum number (3 item) of products reached");

    // 3️⃣ Expand short Amazon URL safely
    const expandShortAmazonUrl = async (shortUrl) => {
        try {
            const response = await axios.get(shortUrl, {
                maxRedirects: 5,
                timeout: 8000,
                headers: {
                    "User-Agent": "Mozilla/5.0"
                },
                validateStatus: (status) => status >= 200 && status < 400
            });

            return response.request?.res?.responseUrl || shortUrl;
        } catch (err) {
            console.error("Short URL expand failed:", err.message);
            return shortUrl; // fail silently
        }
    };

    if (/amzn\.eu|c\.co/.test(productUrl)) {
        productUrl = await expandShortAmazonUrl(productUrl);
    }

    // 4️⃣ Extract ASIN (dp OR gp/product)
    const asinMatch = productUrl.match(
        /\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/
    );

    if (!asinMatch) throw new Error("Invalid Amazon product URL");

    const asin = asinMatch[1] || asinMatch[2];

    // 5️⃣ Prevent duplicate
    const exists = await Product.findOne({ "product.asin": asin, userId, isDelete: false });
    if (exists) throw new Error("Product already exists");

    // 6️⃣ Fetch Keepa
    const keepaResponse = await keepaService.fetchProductData(asin);
    if (!keepaResponse.products?.length) {
        throw new Error("Keepa returned no product data");
    }

    const kp = keepaResponse.products[0];
    const { avgRating, reviewCount } = keepaService.extractLatestReviewData(kp);

    const getPrice = (v) => (v != null && v !== -1 ? v / 100 : null);

    const productData = {
        userId,
        url: productUrl,
        product: {
            asin: kp.asin,
            title: kp.title || "N/A",
            brand: kp.brand || "N/A",
            description: kp.description || "",
            images: kp.imagesCSV ? kp.imagesCSV.split(",") : [],
            imageBaseURL: "https://images-na.ssl-images-amazon.com/images/I/",
            features: kp.features || [],
            price: getPrice(kp.stats?.current?.[0]),
            avgRating,
            reviewCount,
            lastFivePrices: {
                five: getPrice(kp.stats?.current?.[0]),
                four: getPrice(kp.stats?.avg?.[0]),
                three: getPrice(kp.stats?.avg30?.[0]),
                two: getPrice(kp.stats?.avg90?.[0]),
                one: getPrice(kp.stats?.avg180?.[0]),
            }
        }
    };

    const saved = await Product.create(productData);

    await delRedis("products:all");
    await delRedis(`history:${userId}`);

    return saved;
};



const isMyProduct = async (userId) => {
    const product = await Product.findOne({ userId, isDelete: false });
    const data2 = {
        isProductIs: false,
    };
    if (!product) return data2;
    const data = {
        isProductIs: true,
    }
    return data;
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

const getProducts = async (userId) => {
    const cacheKey = "products:all";
    const cached = await getRedis(cacheKey);
    if (cached) {
        return cached
    };
    const products = await Product.find({ userId, isDelete: false })
        // .sort({ createdAt: -1 })
        .lean();
    if (!products.length) throw new Error("No products found");
    const response = products.map(p => {
        const five = p.product.lastFivePrices.five;
        const current = p.product.price;
        p.product.percentageChange = five
            ? (((current - five) / five) * 100).toFixed(2)
            : "0.00";

        return p;
    });
    await setRedis(cacheKey, response, 300);
    return response;
};

/* -------------------------------------------------------------------------- */
/*                                 GET HISTORY                                */
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
            const diff = p.product.price - (p.product.lastFivePrices.five || 0);
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
    // const cacheKey = `product:${id}`;
    // const cached = await getRedis(cacheKey);
    // if (cached) return cached;
    const product = await Product.findById(id).lean();
    if (!product) throw new Error("Product not found");

    const prices = Object.values(product.product.lastFivePrices)
        .filter(p => p != null);
    product.product.lowestPrice =
        prices.length ? Math.min(...prices) : null;

    const five = product.product.lastFivePrices.five;
    const current = product.product.price;

    const percentageChange =
        five && five !== 0
            ? (((current - five) / five) * 100).toFixed(2)
            : "0.00";

    product.product.percentageChange = percentageChange;

    // await setRedis(cacheKey, product, 300);
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
    const product = await Product.findByIdAndDelete(id)
    await delRedis("products:all");
    await delRedis(`product:${id}`);
    await delRedis(`history:${product.userId}`);
    return product;
};

const pushNotification = async (id) => {
    const product = await Product.findById(id);
    if (!product) throw new Error("Product not found");

    product.isPushNotification = !product.isPushNotification;
    await product.save();

    // 🔥 clear related caches
    await delRedis("products:all");
    await delRedis(`product:${id}`);
    await delRedis(`history:${product.userId}`);

    return product;
};

const ifNotChange7Day = async (id) => {
    const product = await Product.findById(id);
    if (!product) throw new Error("Product not found");

    product.ifNotChange7Day = !product.ifNotChange7Day;
    await product.save();

    // 🔥 clear related caches
    await delRedis("products:all");
    await delRedis(`product:${id}`);
    await delRedis(`history:${product.userId}`);

    return product;
}


const removeItemAfter30Day = async (id) => {
    const product = await Product.findById(id);
    if (!product) throw new Error("Product not found");

    product.removeItemAfter30Day = !product.removeItemAfter30Day;
    await product.save();

    // 🔥 clear related caches
    await delRedis("products:all");
    await delRedis(`product:${id}`);
    await delRedis(`history:${product.userId}`);

    return product;
};


/* -------------------------------------------------------------------------- */
/*                        CRON For Push Notification                          */
/* -------------------------------------------------------------------------- */

cron.schedule('0 0 0,12 * * *',
// cron.schedule('*/05 * * * * *',

    async () => {

        // return
        const products = await Product
            .find({ isDelete: false })
            .populate('userId', 'fcmToken isPushNotification oneTimePushAcceptedorReject');

        // console.log(products)


        for (const product of products) {
            if (!product.userId || !product.userId.fcmToken?.length) continue;
            if (!product?.userId.isPushNotification || !product?.userId?.oneTimePushAcceptedorReject) continue;
            if (!product?.isPushNotification) continue;

            // Fetch latest Keepa data
            // const keepaResponse = await keepaService.fetchProductData(product.product.asin);
            // if (!keepaResponse.products?.length) continue;
            // const latest = keepaResponse.products[0];
            // Update prices
            // product.product.price = latest.stats.current[0] / 100;
            // product.product.lastFivePrices.five = latest.stats.avg[0] / 100;
            // product.product.lastFivePrices.four = latest.stats.avg30[0] / 100;
            // product.product.lastFivePrices.three = latest.stats.avg90[0] / 100;
            // product.product.lastFivePrices.two = latest.stats.avg180[0] / 100;
            // product.product.lastFivePrices.one = latest.stats.avg365[0] / 100;
            // await product.save();

            // ✅ Pick ONE device token
            const singleToken = product.userId.fcmToken;
            const title = "Product Price Update Alert!";
            const price = product.product.price;

            await sendPushNotification({ fcmToken: singleToken, title, price, });
        }

    }, { timezone: 'Asia/Dhaka' });

/* -------------------------------------------------------------------------- */
/*                                   EXPORTS                                   */
/* -------------------------------------------------------------------------- */

module.exports = {
    createProduct,
    isMyProduct,
    addNote,
    markAsPurchased,
    getProducts,
    getHistory,
    getProductById,
    deleteProductById,
    deleteHistoryById,

    pushNotification,
    ifNotChange7Day,
    removeItemAfter30Day
};



