const axios = require("axios");
const config = require("../config/config");

class savenDayKeepa {
    constructor() {
        this.apiKey = config.KEEPA_API_KEY;
        this.productUrl = "https://api.keepa.com/search";
        this.domainId = 3; // Amazon DE
    }

    // Fetch single product by ASIN
    async fetchProductData(asin) {
        try {
            const response = await axios.get(this.productUrl, {
                params: {
                    key: this.apiKey,
                    domain: this.domainId,
                    asin,
                    stats: 90,
                    rating: 1,
                },
            });

            // Keepa returns HTTP 200 even on errors — check body
            if (response.data?.error) {
                console.error("Keepa fetchProductData error:", JSON.stringify(response.data.error));
                return null;
            }

            return response.data;
        } catch (error) {
            console.error("fetchProductData HTTP error:", error?.response?.data || error.message);
            return null;
        }
    }

    // Fetch multiple products in ONE API call (up to 100 ASINs)
    async fetchMultipleProducts(asins) {
        try {
            const response = await axios.get(this.productUrl, {
                params: {
                    key: this.apiKey,
                    domain: this.domainId,
                    asin: asins.join(","),
                    stats: 90,
                    rating: 1,
                },
            });

            if (response.data?.error) {
                console.error("Keepa fetchMultipleProducts error:", JSON.stringify(response.data.error));
                return [];
            }

            return response.data?.products || [];
        } catch (error) {
            console.error("fetchMultipleProducts HTTP error:", error?.response?.data || error.message);
            return [];
        }
    }

    // Fetch bestseller ASINs by category ID
    async fetchBestsellerAsins(categoryId) {
        try {
            const response = await axios.get(this.bestsellerUrl, {
                params: {
                    key: this.apiKey,
                    domain: this.domainId,
                    category: categoryId,
                },
            });

            if (response.data?.error) {
                console.error("Keepa bestsellers error:", JSON.stringify(response.data.error));
                return [];
            }

            return response.data?.bestSellersList?.asinList || [];
        } catch (error) {
            console.error("fetchBestsellerAsins HTTP error:", error?.response?.data || error.message);
            return [];
        }
    }

    // Extract latest review and rating
    extractLatestReviewData(product) {
        if (!product) return { avgRating: null, reviewCount: null };

        let avgRating = null;
        let reviewCount = null;

        if (product.stats) {
            if (product.stats.rating != null) avgRating = product.stats.rating / 10;
            if (product.stats.reviewCount != null) reviewCount = product.stats.reviewCount;
        }

        if ((avgRating === null || reviewCount === null) && product.csv) {
            if (avgRating === null && product.csv[16]?.length >= 2) {
                avgRating = product.csv[16][product.csv[16].length - 1] / 10;
            }
            if (reviewCount === null && product.csv[17]?.length >= 2) {
                reviewCount = product.csv[17][product.csv[17].length - 1];
            }
        }

        return {
            avgRating: avgRating !== null ? Number(avgRating.toFixed(1)) : null,
            reviewCount: reviewCount !== null ? Number(reviewCount) : null,
        };
    }

    // Format a raw Keepa product into our alternate shape
    formatProduct(kp) {
        const currentPrices = kp.stats?.current || [];
        const rawPrice = currentPrices[11] ?? currentPrices[0] ?? -1;
        const { avgRating, reviewCount } = this.extractLatestReviewData(kp);

        return {
            asin: kp.asin,
            title: kp.title || "N/A",
            price: rawPrice > 0 ? rawPrice / 100 : 0,
            avgRating,
            reviewCount,
            image: kp.imagesCSV ? kp.imagesCSV.split(",")[0] : null,
        };
    }

    // Main method: get alternate products
    async getAlternateProductsByCategory(asin, type, limit = 4) {
        try {
            // Step 1: Fetch the main product
            const keepaData = await this.fetchProductData(asin);
            if (!keepaData?.products?.length) {
                console.warn("No product data for ASIN:", asin);
                return [];
            }

            const product = keepaData.products[0];
            console.log("Main product:", product.title);

            // ─── Strategy 1: Use similarProducts already on the product ───
            // Keepa returns these directly — zero extra API calls needed
            const similarAsins = (product.similarProducts || [])
                .filter(a => a !== asin)
                .slice(0, 15);

            console.log(`Similar products from product data: ${similarAsins.length}`);

            if (similarAsins.length >= limit) {
                const similarProducts = await this.fetchMultipleProducts(similarAsins);
                const results = similarProducts
                    .filter(kp => kp.asin && kp.asin !== asin)
                    .slice(0, limit)
                    .map(kp => this.formatProduct(kp));

                if (results.length >= limit) {
                    console.log(`Returning ${results.length} alternates from similarProducts`);
                    return results;
                }
            }

            // ─── Strategy 2: Bestsellers from the product's own category ───
            // catId is already on the product — no search API call needed
            const categoryTree = product.categoryTree || [];
            if (!categoryTree.length) {
                console.warn("No categoryTree for ASIN:", asin);
                return [];
            }

            // Try from most specific to broadest category
            for (let i = categoryTree.length - 1; i >= 0; i--) {
                const catId = categoryTree[i]?.catId;
                if (!catId) continue;

                console.log(`Trying category [${catId}] ${categoryTree[i]?.name}`);

                const bestsellerAsins = await this.fetchBestsellerAsins(catId);
                if (!bestsellerAsins.length) continue;

                const filteredAsins = bestsellerAsins
                    .filter(a => a !== asin)
                    .slice(0, 15);

                console.log(`Found ${filteredAsins.length} bestseller candidates in category`);

                const products = await this.fetchMultipleProducts(filteredAsins);
                const results = products
                    .filter(kp => kp.asin && kp.asin !== asin)
                    .slice(0, limit)
                    .map(kp => this.formatProduct(kp));

                if (results.length > 0) {
                    console.log(`Returning ${results.length} alternates from bestsellers`);
                    return results;
                }
            }

            console.warn("All strategies exhausted, no alternates found for ASIN:", asin);
            return [];

        } catch (err) {
            console.error("getAlternateProductsByCategory error:", err?.response?.data || err.message);
            return [];
        }
    }
}

module.exports = new savenDayKeepa();
