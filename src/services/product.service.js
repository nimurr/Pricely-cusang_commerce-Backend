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

    const urlMatch = productUrl.match(/https:\/\/[^\s]+/);
    if (!urlMatch) throw new Error("No valid https URL found");
    productUrl = urlMatch[0].trim();

    const count = await Product.countDocuments({ userId, isDelete: false });
    if (count > 2) throw new Error("You can only track 3 products simultaneously. Remove one first.");

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

    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/);
    if (!asinMatch) throw new Error("Invalid Amazon product URL");
    const asin = asinMatch[1] || asinMatch[2];

    const exists = await Product.findOne({ "product.asin": asin, userId, isDelete: false });
    if (exists) throw new Error("Product already exists");

    await new Promise(resolve => setTimeout(resolve, 2000));

    const keepaResponse = await keepaService.fetchProductData(asin);
    if (!keepaResponse.products?.length) throw new Error("Keepa returned no product data");
    const kp = keepaResponse.products[0];
    const { avgRating, reviewCount } = keepaService.extractLatestReviewData(kp);

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
                changes.push({ date: keepaTimeToDate(keepaTime), price });
                lastPrice = price;
            }
        }

        return changes.slice(-5).reverse();
    };

    const currentPrice = getPrice(kp.stats?.current?.[0]);
    const priceHistory = extractLastFivePriceChanges(kp);

    const lowestPrice = priceHistory.length
        ? Math.min(...priceHistory.map(p => p.price))
        : currentPrice || 0;

    // ✅ previousPrice = the most recent historical price point (priceHistory[1])
    // priceHistory[0] is the latest change, priceHistory[1] is the one before it
    const previousPrice = priceHistory[1]?.price || 0;

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
            previousPrice,
            type: kp.type,
        }
    };

    if (productData.product.price === 0) {
        throw new Error("This product is currently unavailable for tracking (price is 0). Please try another product.");
    }

    // ─────────────────────────────────────────────────────────────
    // ✅ PERCENTAGE CALCULATION & CATEGORY (your spec, section 1-4)
    // ─────────────────────────────────────────────────────────────

    // Helper: classify a % change into a named category
    const getPriceChangeCategory = (percent) => {
        if (percent >= 10) return "STRONG_UP";    // ≥ +10%
        if (percent > 2 && percent < 10) return "LIGHT_UP";     // > +2% to < +10%
        if (percent >= -2 && percent <= 2) return "STABLE";       // -2% to +2%
        if (percent < -2 && percent > -10) return "LIGHT_DOWN";   // < -2% to > -10%
        if (percent <= -10) return "STRONG_DOWN";  // ≤ -10%
    };

    // Helper: human-readable text + alert title per category
    const getCategoryMeta = (category) => {
        switch (category) {
            case "STRONG_UP": return { text: "The price increased Strongly.", title: "Price Surged! 🔺" };
            case "LIGHT_UP": return { text: "The price increased Significantly.", title: "Price Increased 🔺" };
            case "STABLE": return { text: "The price is stable.", title: "Product Price Update Alert!" };
            case "LIGHT_DOWN": return { text: "The price dropped Significantly.", title: "Price Dropped! 🔻" };
            case "STRONG_DOWN": return { text: "The price dropped Strongly.", title: "Price Dropped Significantly! 🔻" };
            default: return { text: "No data available.", title: "Product Price Update Alert!" };
        }
    };


    let priceChangePercent = null;
    let priceChangeCategory = null;
    let currentStatusText = "No data available";
    let title = "Product Price Update Alert!";

    if (currentPrice && previousPrice) {
        // ✅ Correct formula: ((currentPrice - previousPrice) / previousPrice) * 100
        priceChangePercent = ((currentPrice - previousPrice) / previousPrice) * 100;

        priceChangeCategory = getPriceChangeCategory(priceChangePercent);

        const meta = getCategoryMeta(priceChangeCategory);
        currentStatusText = meta.text;
        title = meta.title;
    }

    // ─────────────────────────────────────────────────────────────
    // ✅ TREND — based on broader price history, NOT just one point
    // (section 4B of spec: trend is separate from the % comparison)
    // ─────────────────────────────────────────────────────────────
    const getTrend = (priceHistory) => {
        if (!priceHistory || priceHistory.length < 2) return "stable";

        // Compare oldest vs newest available point in history
        const oldest = priceHistory[priceHistory.length - 1].price;
        const newest = priceHistory[0].price;
        const overallPercent = ((newest - oldest) / oldest) * 100;

        if (overallPercent > 2) return "rising";
        if (overallPercent < -2) return "falling";
        return "stable";
    };

    const trend = getTrend(priceHistory);

    productData.product.currentStatusText = currentStatusText;
    productData.product.priceChangePercent = priceChangePercent
        ? parseFloat(priceChangePercent.toFixed(2))   // e.g. -73.08
        : null;
    productData.product.priceChangeCategory = priceChangeCategory; // e.g. "STRONG_DOWN"
    productData.product.trend = trend;               // e.g. "falling"
    productData.product.alertTitle = title;

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
        const previusPrice = p.product?.previousPrice || 0;

        const percentageChange = current ? ((current - previusPrice) / previusPrice * 100) : 0;
        p.product.percentageChange = percentageChange.toFixed(2);

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
            const oldestEntry = p.product.priceHistory[1];

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


    const percentageChange = current ? ((current - previusPrice) / previusPrice * 100) : 0;
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

            if (!product?.userId?.fcmToken) continue;
            if (!product?.userId?.isPushNotification) continue;
            if (!product?.userId?.oneTimePushAcceptedorReject) continue;
            if (!product?.isPushNotification) continue;

            await sleep(3000);

            const keepaResponse = await keepaService.fetchProductData(product.product.asin);
            if (!keepaResponse?.products?.length) continue;

            const kp = keepaResponse.products[0];
            if (!kp?.stats?.current?.[0]) continue;

            const newPrice = kp.stats.current[0] / 100;
            const oldPrice = product.product.price;

            if (newPrice !== oldPrice) {

                console.log(`Price changed for ASIN: ${product.product.asin}`);

                // 🔹 Convert Keepa timestamp
                const keepaLastUpdate = kp.stats?.current?.[1];
                const realDate = convertKeepaMinutesToDate(keepaLastUpdate);

                // 🔹 Ensure priceHistory exists
                if (!Array.isArray(product.product.priceHistory)) {
                    product.product.priceHistory = [];
                }

                // 🔹 Add new price entry at the front
                product.product.priceHistory.unshift({
                    price: newPrice,
                    date: realDate
                });

                // 🔹 Keep only last 5 entries
                if (product.product.priceHistory.length > 5) {
                    product.product.priceHistory =
                        product.product.priceHistory.slice(0, 5);
                }

                const priceHistory = product.product.priceHistory;
                const currentPrice = newPrice;

                // ✅ Lowest price across history
                const lowestPrice = priceHistory.length
                    ? Math.min(...priceHistory.map(p => p.price))
                    : currentPrice;

                // ✅ previousPrice = index 1 (index 0 is the new price we just unshifted)
                const previousPrice = priceHistory.length > 1
                    ? priceHistory[1].price
                    : currentPrice;

                // ─────────────────────────────────────────────────────────────
                // ✅ PERCENTAGE CALCULATION
                // Formula: ((currentPrice - previousPrice) / previousPrice) * 100
                // ─────────────────────────────────────────────────────────────
                const getPriceChangeCategory = (percent) => {
                    if (percent >= 10) return "STRONG_UP";    // ≥ +10%
                    if (percent > 2 && percent < 10) return "LIGHT_UP";     // > +2% to < +10%
                    if (percent >= -2 && percent <= 2) return "STABLE";       // -2% to +2%
                    if (percent < -2 && percent > -10) return "LIGHT_DOWN";   // < -2% to > -10%
                    if (percent <= -10) return "STRONG_DOWN";  // ≤ -10%
                };

                const getCategoryMeta = (category) => {
                    switch (category) {
                        case "STRONG_UP": return { text: "The price increased  Strongly.", title: "Price Surged! 🔺" };
                        case "LIGHT_UP": return { text: "The price increased Significantly.", title: "Price Increased 🔺" };
                        case "STABLE": return { text: "The price is stable.", title: "Product Price Update Alert!" };
                        case "LIGHT_DOWN": return { text: "The price dropped Significantly.", title: "Price Dropped! 🔻" };
                        case "STRONG_DOWN": return { text: "The price dropped Strongly.", title: "Price Dropped Significantly! 🔻" };
                        default: return { text: "No data available.", title: "Product Price Update Alert!" };
                    }
                };


                // ✅ TREND — based on full price history span, not a single point
                const getTrend = (priceHistory) => {
                    if (!priceHistory || priceHistory.length < 2) return "stable";
                    const oldest = priceHistory[priceHistory.length - 1].price;
                    const newest = priceHistory[0].price;
                    const overallPercent = ((newest - oldest) / oldest) * 100;
                    if (overallPercent > 2) return "rising";
                    if (overallPercent < -2) return "falling";
                    return "stable";
                };

                let currentStatusText = "No data available";
                let currentStatusTextDe = "Keine Daten verfügbar";
                let title = "Product Price Update Alert!";
                let priceChangePercent = null;
                let priceChangeCategory = null;

                if (currentPrice && previousPrice) {
                    priceChangePercent = ((currentPrice - previousPrice) / previousPrice) * 100;
                    priceChangeCategory = getPriceChangeCategory(priceChangePercent);

                    const meta = getCategoryMeta(priceChangeCategory);
                    currentStatusText = meta.text_en;
                    currentStatusTextDe = meta.text_de;
                    title = meta.title;
                }

                const trend = getTrend(priceHistory);

                // 🔹 Always save updated product fields to DB
                product.product.price = newPrice;
                product.product.lowestPrice = lowestPrice;
                product.product.previousPrice = previousPrice;
                product.product.currentStatusText = currentStatusText;
                product.product.currentStatusTextDe = currentStatusTextDe;
                product.product.priceChangePercent = priceChangePercent
                    ? parseFloat(priceChangePercent.toFixed(2))
                    : null;
                product.product.priceChangeCategory = priceChangeCategory;
                product.product.trend = trend;

                await product.save();

                // ─────────────────────────────────────────────────────────────
                // ✅ NOTIFICATION GATE
                // Only notify if BOTH conditions are true:
                //   1. Price change is outside the ±2% stable range
                //   2. Absolute price difference is more than €1
                // ─────────────────────────────────────────────────────────────
                const priceDiffEuro = Math.abs(currentPrice - previousPrice);
                const isNotStable = priceChangeCategory !== "STABLE";  // outside ±2%
                const isOver1Euro = priceDiffEuro > 1;                 // more than €1

                if (isNotStable && isOver1Euro) {
                    console.log(`📢 Sending notification — ASIN: ${product.product.asin} | ${priceChangeCategory} | Δ€${priceDiffEuro.toFixed(2)} | ${priceChangePercent?.toFixed(2)}%`);

                    await sendPushNotification({
                        fcmToken: product.userId.fcmToken,
                        title,
                        price: newPrice,
                        previousPrice,
                        lowestPrice,
                        priceChangePercent: product.product.priceChangePercent,
                        priceChangeCategory,
                        trend,
                        date: realDate
                    });
                } else {
                    console.log(`🔕 Skipping notification — ASIN: ${product.product.asin} | ${priceChangeCategory} | Δ€${priceDiffEuro.toFixed(2)} (below threshold)`);
                }
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

cron.schedule('0 0 0,12 * * *', async () => {
    console.log("Checking products for 7-day price inactivity...");

    try {
        const products = await Product.find({ isDelete: false, isPurchased: false });

        for (const product of products) {
            try {
                const priceHistory = product.product?.priceHistory || [];
                const existingAlternates = product.alternativeProducts || [];
                const asin = product.product?.asin;
                const brand = product.product?.brand;  // ✅ was using 'title' as brand — fixed

                // ─── Condition 1: Skip if missing ASIN ─────────────────────
                if (!asin) {
                    console.warn(`Skipping product ID ${product._id} — missing ASIN`);
                    continue;
                }

                // ─── Condition 2: Skip if already has 3 or more alternates ─
                // ✅ Was: >= 0 (ALWAYS true, skipped everything — critical bug)
                if (existingAlternates.length >= 3) {
                    console.log(`ASIN ${asin} — already has ${existingAlternates.length} alternates, skipping`);
                    continue;
                }

                // ─── Condition 3: Skip if price changed in last 7 days ─────
                if (priceChangedInLast7Days(priceHistory)) {
                    console.log(`ASIN ${asin} — price changed recently, skipping`);
                    continue;
                }

                // ─── Condition 4: Skip if missing brand ────────────────────
                if (!brand) {
                    console.warn(`Skipping ASIN ${asin} — missing brand`);
                    continue;
                }

                // ─── Wait before each Keepa API call ───────────────────────
                console.log(`Waiting 10s before Keepa API call for ASIN: ${asin}...`);
                await sleep(10000);

                // ─── Fetch alternates ───────────────────────────────────────
                const stillNeeded = 3 - existingAlternates.length;
                const searchTerm = brand.slice(0, 35);
                const alternates = await savenDayKeepa.getAlternateProductsByCategory(asin, searchTerm, stillNeeded);

                if (!alternates.length) {
                    console.warn(`No alternates found for ASIN: ${asin}`);
                    continue;
                }

                console.log(`Fetched ${alternates.length} alternates:`, alternates.map(a => a.asin));

                // ─── Condition 5: Filter out already existing ASINs ─────────
                const existingAsinSet = new Set(existingAlternates.map(a => a.asin));
                const newAlternates = alternates.filter(alt => !existingAsinSet.has(alt.asin));

                if (!newAlternates.length) {
                    console.log(`No new alternates to add for ASIN: ${asin} — all already exist`);
                    continue;
                }

                // ─── Save new alternates to DB ──────────────────────────────
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



