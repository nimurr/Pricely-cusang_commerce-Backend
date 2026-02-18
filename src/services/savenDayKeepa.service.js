


const axios = require("axios");
const config = require("../config/config");

class savenDayKeepa {
    constructor() {
        this.apiKey = config.KEEPA_API_KEY;
        this.productUrl = "https://api.keepa.com/product";
        this.searchUrl = "https://api.keepa.com/search";
        this.domainId = 3; // Amazon DE
    }

    // Fetch product data by ASIN
    async fetchProductData(asin) {
        const params = {
            key: this.apiKey,
            domain: this.domainId,
            asin,
            stats: 90,
            rating: 1,
        };

        try {
            const response = await axios.get(this.productUrl, { params });
            return response.data;
        } catch (error) {
            throw new Error("Keepa API unavailable. Try again later.");
        }
    }

    // Extract latest review and rating
    extractLatestReviewData(product) {
        if (!product) return { avgRating: null, reviewCount: null };

        let avgRating = null;
        let reviewCount = null;

        // Use stats first
        if (product.stats) {
            if (product.stats.rating != null) avgRating = product.stats.rating / 10;
            if (product.stats.reviewCount != null) reviewCount = product.stats.reviewCount;
        }

        // Fallback to CSV
        if ((avgRating === null || reviewCount === null) && product.csv) {
            if (avgRating === null && product.csv[16]?.length >= 2) {
                const ratingArray = product.csv[16];
                avgRating = ratingArray[ratingArray.length - 1] / 10;
            }
            if (reviewCount === null && product.csv[17]?.length >= 2) {
                const reviewArray = product.csv[17];
                reviewCount = reviewArray[reviewArray.length - 1];
            }
        }

        return {
            avgRating: avgRating !== null ? Number(avgRating.toFixed(1)) : null,
            reviewCount: reviewCount !== null ? Number(reviewCount) : null,
        };
    }

    // Fetch alternate products by category
    async getAlternateProductsByCategory(asin, type, limit = 3) {
        try {
            // Step 1: Get product data
            const keepaData = await this.fetchProductData(asin);
            if (!keepaData?.products?.length) return [];

            console.log(keepaData)

            const product = keepaData.products[0];

            // Step 2: Get main category name
            const mainCategoryName = product.categoryTree?.[product.categoryTree.length - 1]?.name;
            if (!mainCategoryName) return [];

            // Step 3: Query Keepa search API for category
            const searchResponse = await axios.get(this.searchUrl, {
                params: {
                    key: this.apiKey,
                    domain: this.domainId,
                    type: type,
                    term: mainCategoryName,
                },
            });

            console.log(searchResponse)
            return searchResponse


            const categoriesData = searchResponse.data.categories;
            if (!categoriesData) return [];

            // Step 4: Get ASINs from first matching category
            const categoryIds = Object.keys(categoriesData);
            const firstCategory = categoriesData[categoryIds[0]];
            // Use topSellers instead of products
            const categoryAsins = firstCategory.topSellers || [];

            console.log(categoryIds)

            const alternates = [];

            // Step 5: Fetch product details for each ASIN
            for (let i = 0; i < categoryAsins.length && alternates.length < limit; i++) {
                try {
                    const altData = await this.fetchProductData(categoryAsins[i]);

                    console.log(altData)
                    if (!altData?.products?.length) continue;

                    const kp = altData.products[0];

                    alternates.push({
                        asin: kp.asin,
                        title: kp.title || "N/A",
                        price: kp.stats?.current?.[0] ? kp.stats.current[0] / 100 : 0,
                        avgRating: this.extractLatestReviewData(kp).avgRating,
                        reviewCount: this.extractLatestReviewData(kp).reviewCount,
                        image: kp.imagesCSV ? kp.imagesCSV.split(",")[0] : null,
                    });
                } catch (e) {
                    // Skip only invalid ASIN errors
                    if (e.message.includes("Invalid product identifier")) {
                        console.warn("Skipping invalid ASIN:", categoryAsins[i]);
                    } else {
                        console.error("Failed to fetch ASIN:", categoryAsins[i], e.message);
                    }
                    continue;
                }
            }


            return alternates;
        } catch (err) {
            console.error("getAlternateProductsByCategory error:", err.message);
            return [];
        }
    }

}

module.exports = new savenDayKeepa();