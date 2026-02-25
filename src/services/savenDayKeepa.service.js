const axios = require("axios");
const config = require("../config/config");

class savenDayKeepa {
    constructor() {
        this.apiKey = config.KEEPA_API_KEY;
        this.searchUrl = "https://api.keepa.com/search";
        this.domainId = 3; // Amazon DE
    }

    // ─── Search products by brand name ─────────────────────────────
    async searchProductsByBrand(brand, page = 0) {
        try {
            const response = await axios.get(this.searchUrl, {
                params: {
                    key: this.apiKey,
                    domain: this.domainId,
                    type: "product",
                    term: brand,
                    page,
                },
            });

            if (response.data?.error) {
                console.error("Keepa search error:", JSON.stringify(response.data.error));
                return [];
            }

            const products = response.data?.products || [];
            console.log(`Brand search "${brand}" returned ${products.length} products`);
            return products;

        } catch (error) {
            console.error("searchProductsByBrand HTTP error:", error?.response?.data || error.message);
            return [];
        }
    }

    extractLatestReviewData(keepaProduct) {
        if (!keepaProduct) {
            return { avgRating: null, reviewCount: null };
        }

        let avgRating = null;
        let reviewCount = null;

        // METHOD 1: Try stats object first (most reliable for current data)
        if (keepaProduct.stats) {
            // Rating is usually out of 50 (divide by 10 to get 0-5 scale)
            if (keepaProduct.stats.rating != null) {
                avgRating = keepaProduct.stats.rating / 10;
            }

            if (keepaProduct.stats.reviewCount != null) {
                reviewCount = keepaProduct.stats.reviewCount;
            }
        }

        // METHOD 2: Try csv object (contains historical arrays)
        if ((avgRating === null || reviewCount === null) && keepaProduct.csv) {
            // csv[16] = RATING array (paired: [time, rating, time, rating, ...])
            // csv[17] = REVIEW_COUNT array (paired: [time, count, time, count, ...])

            if (avgRating === null && keepaProduct.csv[16]?.length >= 2) {
                const ratingArray = keepaProduct.csv[16];
                // Get last rating value (second-to-last element, as array is [time, value, time, value...])
                avgRating = ratingArray[ratingArray.length - 1] / 10;
            }

            if (reviewCount === null && keepaProduct.csv[17]?.length >= 2) {
                const reviewArray = keepaProduct.csv[17];
                // Get last review count (second-to-last element)
                reviewCount = reviewArray[reviewArray.length - 1];
            }
        }

        // METHOD 3: Fallback to reviews object (older Keepa API structure)
        if ((avgRating === null || reviewCount === null) && keepaProduct.reviews) {
            if (avgRating === null && keepaProduct.reviews.ratingCount?.length >= 2) {
                const ratingArr = keepaProduct.reviews.ratingCount;
                avgRating = ratingArr[ratingArr.length - 1] / 10;
            }

            if (reviewCount === null && keepaProduct.reviews.reviewCount?.length >= 2) {
                const revArr = keepaProduct.reviews.reviewCount;
                reviewCount = revArr[revArr.length - 1];
            }
        }

        return {
            avgRating: avgRating !== null ? Number(avgRating.toFixed(1)) : null,
            reviewCount: reviewCount !== null ? Number(reviewCount) : null
        };
    }

    // ─── Format a raw Keepa product into our shape ─────────────────
    formatProduct(kp) {
        // const currentPrices = kp.csv?.[1] || [];
        // const rawPrice = currentPrices[0] ?? -1;
        const { avgRating, reviewCount } = this.extractLatestReviewData(kp);

        return {
            asin: kp.asin,
            title: kp.title || "N/A",
            brand: kp.brand || null,
            // price: rawPrice > 0 ? rawPrice / 100 : 0,
            avgRating,
            reviewCount,
            images: kp.images[0]?.m,
            imageBaseURL: "https://images-na.ssl-images-amazon.com/images/I/",
            producturl: `https://www.amazon.de/dp/${kp.asin}`,
            image: kp.imagesCSV ? kp.imagesCSV.split(",")[0] : null,
        };
    }

    async getAlternateProductsByCategory(asin, searchTerm, limit = 4) {
        try {
            if (!searchTerm) {
                console.warn("No search term provided, cannot search alternates for ASIN:", asin);
                return [];
            }

            console.log(`Searching alternates for ASIN: ${asin} | Term: "${searchTerm}"`);

            const products = await this.searchProductsByBrand(searchTerm); // reuses same method

            if (!products.length) {
                console.warn(`No products found for term: "${searchTerm}"`);
                return [];
            }

            const results = products
                .filter(kp => kp.asin && kp.asin !== asin)
                .slice(0, limit)
                .map(kp => this.formatProduct(kp));

            console.log(`✅ Found ${results.length} alternates for term: "${searchTerm}"`);
            return results;

        } catch (err) {
            console.error("getAlternateProductsByCategory error:", err?.response?.data || err.message);
            return [];
        }
    }
}

module.exports = new savenDayKeepa();