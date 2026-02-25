const mongoose = require('mongoose');

const alternativeSchema = new mongoose.Schema({
    asin: { type: String, required: true },
    title: { type: String, required: true },
    brand: { type: String, required: false },
    price: { type: Number, required: true },
    producturl: { type: String, required: true },
    imageBaseURL: { type: String, default: "https://images-na.ssl-images-amazon.com/images/I/" },
    image: [{ type: String, required: true }],
    avgRating: { type: Number, required: true },
    reviewCount: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Alternative', alternativeSchema);