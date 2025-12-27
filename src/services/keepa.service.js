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
