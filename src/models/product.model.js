// product schema definition
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    url: { type: String, required: true },
    product: { type: Object, required: true },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;