const axios = require("axios");
const config = require("../config/config"); // Make sure config.KEEPA_API_KEY exists

class KeepaService {
    constructor() {
        this.apiKey = config.KEEPA_API_KEY;
        this.baseUrl = "https://api.keepa.com/product";
    }

    async fetchProductData(asin) {
        const params = {
            key: this.apiKey,
            domain: 1,      // 1 = Amazon.com
            asin: asin,
            stats: 90       // optional: fetch stats history (e.g., 90 days)
        };

        const response = await axios.get(this.baseUrl, { params });
        return response.data;
    }
}

module.exports = new KeepaService();



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
