const axios = require("axios");
const cron = require("node-cron");
const { Product } = require("../models");
const keepaService = require("./keepa.service");
const { setRedis, getRedis, delRedis } = require("../utils/redisClient");
const { sendPushNotification } = require("../utils/pushNotification");
const savenDayKeepa = require("./savenDayKeepa.service");
const ApiError = require("../utils/ApiError");
const httpStatus = require("http-status");

// ============================================
// productController.js or wherever createProduct is - UPDATED
// ============================================
const createProduct = async ({ productUrl, userId }) => {
    if (!productUrl) throw new Error("Product URL is required");

    // 1️⃣ Extract clean https URL
    const urlMatch = productUrl.match(/https:\/\/[^\s]+/);
    if (!urlMatch) throw new Error("No valid https URL found");
    productUrl = urlMatch[0].trim();

    // 2️⃣ Limit per user
    const count = await Product.countDocuments({ userId, isDelete: false });
    if (count > 2) throw new Error("You can only track 3 products simultaneously. Remove one first.");

    // 3️⃣ Expand short Amazon URL safely
    const expandShortAmazonUrl = async (shortUrl) => {
        try {
            const response = await axios.get(shortUrl, {
                maxRedirects: 5,
                timeout: 8000,
                headers: { "User-Agent": "Mozilla/5.0" },
                validateStatus: (status) => status >= 200 && status < 400
            });
            return response.request?.res?.responseUrl || shortUrl;
        } catch (err) {
            console.error("Short URL expand failed:", err.message);
            return shortUrl;
        }
    };

    if (/amzn\.eu|c\.co/.test(productUrl)) {
        productUrl = await expandShortAmazonUrl(productUrl);
    }

    // 4️⃣ Extract ASIN
    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/);
    if (!asinMatch) throw new Error("Invalid Amazon product URL");
    const asin = asinMatch[1] || asinMatch[2];

    // 5️⃣ Prevent duplicate
    const exists = await Product.findOne({ "product.asin": asin, userId, isDelete: false });
    if (exists) throw new Error("Product already exists");

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 6️⃣ Fetch Keepa data
    const keepaResponse = await keepaService.fetchProductData(asin);
    if (!keepaResponse.products?.length) throw new Error("Keepa returned no product data");
    const kp = keepaResponse.products[0];
    const { avgRating, reviewCount } = keepaService.extractLatestReviewData(kp);

    // 7️⃣ Helpers
    const getPrice = (v) => (v != null && v !== -1 ? v / 100 : 0);

    const keepaTimeToDate = (keepaMinutes) => {
        const keepaStart = new Date("2011-01-01T00:00:00Z").getTime();
        return new Date(keepaStart + keepaMinutes * 60 * 1000);
    };

    const extractLastFivePriceChanges = (kp) => {
        const amazonHistory = kp.csv?.[0];
        if (!amazonHistory || amazonHistory.length < 2) return [];

        const changes = [];
        let lastPrice = null;

        for (let i = 0; i < amazonHistory.length; i += 2) {
            const keepaTime = amazonHistory[i];
            const rawPrice = amazonHistory[i + 1];
            if (rawPrice === -1 || rawPrice == null) continue;

            const price = rawPrice / 100;
            if (lastPrice === null || price !== lastPrice) {
                changes.push({
                    date: keepaTimeToDate(keepaTime),
                    price
                });
                lastPrice = price;
            }
        }

        return changes.slice(-5).reverse();
    };



    const currentPrice = getPrice(kp.stats?.current?.[0]);



    // 9️⃣ Extract price history
    const priceHistory = extractLastFivePriceChanges(kp);


    const lowestPrice = priceHistory.length
        ? Math.min(...priceHistory.map(p => p.price))
        : currentPrice || 0;

    // Get previous price (most recent before current)
    const previousPrice = priceHistory.length ? priceHistory[0].price : currentPrice || 0;

    // 10️⃣ Prepare product data
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
            price: currentPrice,
            avgRating,
            reviewCount,
            priceHistory,
            lowestPrice,
            previousPrice: priceHistory[1]?.price || 0,
            type: kp.type,
        }
    };

    if (productData.product.price === 0) {
        throw new Error("This product is currently unavailable for tracking (price is 0). Please try another product.");
    }


    let currentStatusText = "No data available";
    let title = "Product Price Update Alert!";


    if (productData?.product?.price && productData?.product?.priceHistory[1]?.price) {
        if (productData?.product?.price === productData?.product?.priceHistory[1]?.price) {
            currentStatusText = "The price is stable.";
        } else if (productData?.product?.price < productData?.product?.priceHistory[1]?.price) {
            currentStatusText = "The price dropped slightly.";
            title = "Price Dropped! 🔻";
        } else if (productData?.product?.price > productData?.product?.priceHistory[1]?.price) {
            currentStatusText = "The price increased slightly.";
            title = "Price Increased 🔺";
        }
    }
    productData.product.currentStatusText = currentStatusText;

    await Product.create(productData);

    return productData;
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

    return product;
};

/* -------------------------------------------------------------------------- */
/*                                 GET PRODUCTS                                */
/* -------------------------------------------------------------------------- */

const getProducts = async (userId) => {


    const products = await Product.find({
        userId,
        isDelete: false,
        isPurchased: false
    }).lean();

    if (!products.length) {
        new ApiError(httpStatus.NOT_FOUND, "No products found");
    };

    const response = products.map(p => {

        const current = p.product?.price || 0;
        let basePrice = p.product.priceHistory[0]?.price || current;


        // pick the oldest price from priceHistory
        // if (p.product?.priceHistory?.length) {
        //     const oldest = p.product.priceHistory.reduce((a, b) =>
        //         new Date(a.date) < new Date(b.date) ? a : b
        //     );
        //     basePrice = oldest?.price || current;
        // }

        const percent = basePrice ? ((current - basePrice) / basePrice) * 100 : 0;

        p.product.percentageChange = percent.toFixed(2);

        // 🔥 Format priceHistory with readable dates
        p.product.priceHistory = (p.product.priceHistory || []).map(item => ({
            price: item.price,
            date: item.date
                ? new Date(item.date).toISOString()   // ISO format
                : null
        }));

        return p;
    });

    return products;
};


/* -------------------------------------------------------------------------- */
/*                                 GET HISTORY                                */
/* -------------------------------------------------------------------------- */

const getHistory = async (userId) => {




    const products = await Product.find({
        userId,
        isDelete: true
    })
        .sort({ createdAt: -1 })
        .lean();

    let totalDifference = 0;

    const response = products.map(p => {

        if (p.isPurchased && p.product?.priceHistory?.length) {

            // 🔥 Get oldest price from history
            const oldestEntry = p.product.priceHistory[0];

            const oldPrice = oldestEntry?.price || 0;
            const currentPrice = p.product.price || 0;

            const diff = currentPrice - oldPrice;

            p.product.saveAmount = Number(diff.toFixed(2));

            totalDifference += diff;
        }
        else {
            p.product.saveAmount = 0;
        }

        return p;
    });

    const data = {
        totalDifference: Number(totalDifference.toFixed(2)),
        products: response
    };


    return data;
};


/* -------------------------------------------------------------------------- */
/*                              GET PRODUCT BY ID                              */
/* -------------------------------------------------------------------------- */

const getProductById = async (id) => {
    const product = await Product.findById(id).lean();
    if (!product) throw new Error("Product not found");

    const current = product.product.price || 0;
    const previusPrice = product.product.previousPrice || 0;


    const percentageChange = current ? ((previusPrice - current) / current * 100) : 0;
    product.product.percentageChange = percentageChange.toFixed(2);

    // Trend indicator based on percentage
    product.product.trend =
        percentageChange < 0 ? "down" :
            percentageChange > 0 ? "up" :
                "stable";

    return product;
};



/* -------------------------------------------------------------------------- */
/*                                  DELETE                                     */
/* -------------------------------------------------------------------------- */

const deleteProductById = async (id) => {
    const product = await Product.findByIdAndUpdate(id, { isDelete: true });
    return product;
};

const deleteHistoryById = async (id) => {
    const product = await Product.findByIdAndDelete(id)

    return product;
};

const pushNotification = async (id) => {
    const product = await Product.findById(id);
    if (!product) throw new Error("Product not found");

    product.isPushNotification = !product.isPushNotification;
    await product.save();


    return product;
};

const ifNotChange7Day = async (id) => {
    const product = await Product.findById(id);
    if (!product) throw new Error("Product not found");

    product.ifNotChange7Day = !product.ifNotChange7Day;
    await product.save();


    return product;
}


const removeItemAfter30Day = async (id) => {
    const product = await Product.findById(id);
    if (!product) throw new Error("Product not found");

    product.removeItemAfter30Day = !product.removeItemAfter30Day;
    await product.save();



    return product;
};

const testLast7Day = async (id) => {
    // ─── 1. Fetch Product ───────────────────────────────────────────
    const product = await Product.findById(id).lean();
    if (!product) throw new Error(`Product not found for ID: ${id}`);

    const { asin, title } = product.product || {};
    if (!asin) throw new Error(`Missing ASIN for product ID: ${id}`);
    if (!title) throw new Error(`Missing title for ASIN: ${asin}`);

    // ─── 2. Check if already has 3 alternates ──────────────────────
    const existingAlternates = product.alternativeProducts || [];

    if (existingAlternates.length >= 3) {
        console.log(`ASIN ${asin} already has ${existingAlternates.length} alternates, no need to fetch`);
        return product;
    }

    // ─── 3. Only fetch how many we still need ──────────────────────
    const stillNeeded = 3 - existingAlternates.length;
    const searchTerm = title.slice(0, 35); // Keepa search term from title

    console.log(`ASIN ${asin} has ${existingAlternates.length} alternates, fetching ${stillNeeded} more...`);
    console.log(`Search term: "${searchTerm}"`);

    const alternates = await savenDayKeepa.getAlternateProductsByCategory(asin, searchTerm, stillNeeded);

    console.log(alternates);

    if (!alternates.length) {
        console.warn(`No alternate products found for ASIN: ${asin}`);
        return product;
    }

    // ─── 4. Filter duplicates ───────────────────────────────────────
    const existingAsinSet = new Set(existingAlternates.map(a => a.asin));
    const newAlternates = alternates
        .filter(alt => !existingAsinSet.has(alt.asin))
        .slice(0, stillNeeded); // hard cap — never exceed what we need

    if (!newAlternates.length) {
        console.log(`No new alternates to add — all already exist for ASIN: ${asin}`);
        return product;
    }

    // ─── 5. Save to DB ─────────────────────────────────────────────
    const updatedProduct = await Product.findByIdAndUpdate(
        product._id,
        { $push: { alternativeProducts: { $each: newAlternates } } },
        { new: true }
    );

    console.log(`✅ Added ${newAlternates.length} alternates | Total now: ${updatedProduct.alternativeProducts.length}`);

    return updatedProduct;
};


/* -------------------------------------------------------------------------- */
/*                        CRON For Push Notification                          */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


function convertKeepaMinutesToDate(keepaMinutes) {
    if (!keepaMinutes) return null;

    const KEEP_EPOCH = new Date('2011-01-01T00:00:00Z').getTime();
    const realDate = new Date(KEEP_EPOCH + keepaMinutes * 60 * 1000);

    return realDate;
}

cron.schedule('0 0 0,12 * * *', async () => {
    console.log("Cron job started...");

    try {
        const products = await Product
            .find({ isDelete: false })
            .populate('userId', 'fcmToken isPushNotification oneTimePushAcceptedorReject');

        for (const product of products) {

            // 🔹 Skip users/products where push not allowed
            if (!product?.userId?.fcmToken) continue;
            if (!product?.userId?.isPushNotification) continue;
            if (!product?.userId?.oneTimePushAcceptedorReject) continue;
            if (!product?.isPushNotification) continue;

            await sleep(3000); // small delay before DB update and notification


            const keepaResponse = await keepaService.fetchProductData(product.product.asin);
            if (!keepaResponse?.products?.length) continue;

            const kp = keepaResponse.products[0];
            if (!kp?.stats?.current?.[0]) continue;

            const newPrice = kp.stats.current[0] / 100;
            const oldPrice = product.product.price;

            // ✅ Only continue if price changed
            if (newPrice !== oldPrice) {

                console.log(`Price changed for ASIN: ${product.product.asin}`);

                const current = kp.stats?.current?.[0];
                const avg = kp.stats?.avg?.[0];

                let currentStatusText = "No data available";
                let title = "Product Price Update Alert!";

                if (current && avg) {
                    if (current === avg) {
                        currentStatusText = "The price is stable.";
                    } else if (current < avg) {
                        currentStatusText = "The price dropped slightly.";
                        title = "Price Dropped! 🔻";
                    } else {
                        currentStatusText = "The price increased slightly.";
                        title = "Price Increased 🔺";
                    }
                }


                // 🔹 Convert Keepa timestamp
                const keepaLastUpdate = kp.stats?.current?.[1];
                const realDate = convertKeepaMinutesToDate(keepaLastUpdate);

                // 🔹 Ensure priceHistory exists
                if (!Array.isArray(product.product.priceHistory)) {
                    product.product.priceHistory = [];
                }

                // 🔹 Add new price entry
                product.product.priceHistory.unshift({
                    price: newPrice,
                    date: realDate
                });

                // 🔹 Keep only last 50 entries
                if (product.product.priceHistory.length > 5) {
                    product.product.priceHistory =
                        product.product.priceHistory.slice(0, 5);
                }

                const priceHistory = product.product.priceHistory;
                const currentPrice = newPrice;

                // ✅ Calculate lowest price (your method)
                const lowestPrice = priceHistory.length
                    ? Math.min(...priceHistory.map(p => p.price))
                    : currentPrice || 0;

                // ✅ Calculate previous price (your method)
                const previousPrice = priceHistory.length > 1
                    ? priceHistory[1].price   // because index 0 is current (we used unshift)
                    : currentPrice || 0;

                // 🔹 Update product fields
                product.product.price = newPrice;
                product.product.lowestPrice = lowestPrice;
                product.product.previousPrice = previousPrice;
                product.product.currentStatusText = currentStatusText;

                await product.save();

                // 🔹 Send push notification
                await sendPushNotification({
                    fcmToken: product.userId.fcmToken,
                    title,
                    price: newPrice,
                    previousPrice,
                    lowestPrice,
                    date: realDate
                });
            }
        }

        console.log("Cron job completed.");

    } catch (error) {
        console.error("Cron error:", error);
    }

}, { timezone: 'Asia/Dhaka' });


/* -------------------------------------------------------------------------- */
/*         Last 7 day if price not changed then add more alternate 3 products       */
/* -------------------------------------------------------------------------- */

// ─── Helper: wait N milliseconds ───────────────────────────────


function priceChangedInLast7Days(priceHistory) {
    if (!Array.isArray(priceHistory) || priceHistory.length < 2) return false;

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const recentHistory = priceHistory.filter(h => new Date(h.date) >= sevenDaysAgo);
    if (recentHistory.length < 2) return false;

    const prices = recentHistory.map(h => h.price);
    const firstPrice = prices[0];
    return prices.some(price => price !== firstPrice);
}

cron.schedule('0 0 0,12 * * *',
    // cron.schedule('*/20 * * * * *',

    async () => {
        console.log("Checking products for 7-day price inactivity...");

        try {
            const products = await Product.find({ isDelete: false, isPurchased: false });

            for (const product of products) {
                try {
                    const priceHistory = product.product?.priceHistory || [];
                    const existingAlternates = product.alternativeProducts || [];
                    product.alternativeProducts = existingAlternates;
                    if (product.alternativeProducts.length >= 0) {
                        console.log(`ASIN ${product.product?.asin} — already has ${product.alternativeProducts.length} alternates, skipping`);
                        continue;
                    }

                    // ─── Condition 1: Skip if price changed in last 7 days ──────
                    if (priceChangedInLast7Days(priceHistory)) {
                        console.log(`ASIN ${product.product?.asin} — price changed recently, skipping`);
                        continue;
                    }

                    // ─── Condition 2: Skip if already has 3 or more alternates ──
                    if (existingAlternates.length >= 3) {
                        console.log(`ASIN ${product.product?.asin} — already has ${existingAlternates.length} alternates, skipping`);
                        continue;
                    }

                    const { asin, title: brand } = product.product || {};

                    // ─── Condition 3: Skip if missing ASIN or brand ─────────────
                    if (!asin) {
                        console.warn(`Skipping product ID ${product._id} — missing ASIN`);
                        continue;
                    }

                    if (!brand) {
                        console.warn(`Skipping ASIN ${asin} — missing brand`);
                        continue;
                    }

                    // ─── Wait before each Keepa API call ───────────────────────
                    // refillRate: 1 token per ~200ms — 20s gap is safe
                    console.log(`Waiting 10s before Keepa API call for ASIN: ${asin}...`);
                    await sleep(10000);

                    // ─── Fetch alternates by brand ──────────────────────────────
                    const stillNeeded = 3 - existingAlternates.length;
                    const searchTerm = brand.slice(0, 35);
                    const alternates = await savenDayKeepa.getAlternateProductsByCategory(asin, searchTerm, stillNeeded);

                    // console.log("all products:", alternates);

                    if (!alternates.length) {
                        console.warn(`No alternates found for ASIN: ${asin}`);
                        continue;
                    }

                    console.log(`Fetched ${alternates.length} alternates:`, alternates.map(a => a.asin));

                    // ─── Condition 4: Skip already existing ASINs ───────────────
                    const existingAsinSet = new Set(existingAlternates.map(a => a.asin));
                    const newAlternates = alternates.filter(alt => !existingAsinSet.has(alt.asin));

                    if (!newAlternates.length) {
                        console.log(`No new alternates to add for ASIN: ${asin} — all already exist`);
                        continue;
                    }

                    // ─── Save only new alternates to DB ────────────────────────
                    await Product.findByIdAndUpdate(
                        product._id,
                        { $push: { alternativeProducts: { $each: newAlternates } } }
                    );

                    console.log(`✅ Added ${newAlternates.length} new alternates for ASIN: ${asin}`);

                } catch (productErr) {
                    console.error(`Error processing product ID ${product._id}:`, productErr.message);
                }
            }

            console.log("✅ 7-day alternate check completed.");

        } catch (err) {
            console.error("Cron job failed:", err);
        }
    }, { timezone: 'Asia/Dhaka' });

/* -------------------------------------------------------------------------- */
/*        Remove product after 30 days if price not changed (auto clean)     */
/* -------------------------------------------------------------------------- */

cron.schedule('0 0 0,12 * * *',

    async () => {

        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            await sleep(3000); // small delay before DB update and notification

            const products = await Product.find({
                removeItemAfter30Day: true,
                createdAt: { $lte: thirtyDaysAgo } // older than 30 days
            });
            console.log("==================== Product delete if 30-day true ====================");

            for (const product of products) {
                await product.deleteOne();
            }

        } catch (err) {
            console.error("Error in 30-day cron:", err);
        }

    }, { timezone: 'Asia/Dhaka' });



/* -------------------------------------------------------------------------- */
/*                                   EXPORTS                                  */
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
    removeItemAfter30Day,
    testLast7Day
};



