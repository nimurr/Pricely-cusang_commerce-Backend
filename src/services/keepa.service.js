// const axios = require("axios");
// const config = require("../config/config"); // Make sure config.KEEPA_API_KEY exists


// class KeepaService {
//     constructor() {
//         this.apiKey = config.KEEPA_API_KEY;
//         this.baseUrl = "https://api.keepa.com/product";
//     }

//     async fetchProductData(asin) {
//         const params = {
//             key: this.apiKey,
//             domain: 1,      // Amazon.com
//             asin: asin,
//             stats: 90,      // optional stats
//             rating: 1,       // ✅ include rating & review count history
//         };

//         const response = await axios.get(this.baseUrl, { params });
//         return response.data;
//     }
// }

// module.exports = new KeepaService();


// ============================================================================================ 11111111

// const axios = require("axios");
// const config = require("../config/config");

// class KeepaService {
//   constructor() {
//     this.apiKey = config.KEEPA_API_KEY;
//     this.baseUrl = "https://api.keepa.com/product";
//   }

//   // Convert cents to price
//   toPrice(value) {
//     return value && value > 0 ? value / 100 : null;
//   }

//   // Extract price stats by Keepa index (4=BuyBox, 1=New price)
//   extractStats(stats, index) {
//     return {
//       avg: this.toPrice(stats?.avg?.[index]),
//       avg30: this.toPrice(stats?.avg30?.[index]),
//       avg90: this.toPrice(stats?.avg90?.[index]),
//       avg180: this.toPrice(stats?.avg180?.[index]),
//       avg365: this.toPrice(stats?.avg365?.[index])
//     };
//   }

//   // Fetch & parse Keepa product
//   async fetchProductData(asin) {
//     const response = await axios.get(this.baseUrl, {
//       params: {
//         key: this.apiKey,
//         domain: 1, // Amazon US
//         asin,
//         stats: 365
//       }
//     });

//     const kp = response.data?.products?.[0];
//     if (!kp) throw new Error("No product returned from Keepa");

//     return {
//       asin: kp.asin,
//       title: kp.title,
//       brand: kp.brand,
//       features: kp.features,
//       images: kp.images,
//       price: {
//         buyBox: this.extractStats(kp.stats, 4),
//         new: this.extractStats(kp.stats, 1)
//       },
//       lastUpdate: new Date()
//     };
//   }
// }

// module.exports = new KeepaService();

// ============================================================================================= 2222222222

// ============================================
// keepaService.js - UPDATED
// ============================================


const axios = require("axios");
const config = require("../config/config");

class KeepaService {
    constructor() {
        this.apiKey = config.KEEPA_API_KEY;
        this.baseUrl = "https://api.keepa.com/product";
    }

    async fetchProductData(asin) {
        const params = {
            key: this.apiKey,
            domain: 3,      //       
            asin: asin,
            stats: 90,      // Include statistics
            rating: 1,      // Include rating & review history
        };

        const response = await axios.get(this.baseUrl, { params });
        return response.data;
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
