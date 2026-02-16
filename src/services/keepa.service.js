


const axios = require("axios");
const config = require("../config/config");

class KeepaService {
    constructor() {
        this.apiKey = config.KEEPA_API_KEY;
        this.baseUrl = "https://api.keepa.com/product";
    }

    // async fetchProductData(asin) {
    //     const params = {
    //         key: this.apiKey,
    //         domain: 3,      //       
    //         asin: asin,
    //         stats: 90,      // Include statistics
    //         rating: 1,      // Include rating & review history
    //     };

    //     const response = await axios.get(this.baseUrl, { params });
    //     return response.data;
    // }

    async fetchProductData(asin) {
        const params = {
            key: this.apiKey,
            domain: 3,
            asin: asin,
            stats: 90,
            rating: 1,
        };

        try {
            const response = await axios.get(this.baseUrl, { params });
            return response.data;
        } catch (error) {  
            throw new Error("Keepa API unavailable. Try again later.");
        }
    }


    /**
     * Extract the latest review data from Keepa product object
     * Keepa stores time-series data as [timestamp, value, timestamp, value, ...]
     */
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
}

module.exports = new KeepaService();


// ======================
