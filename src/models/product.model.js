// product schema definition
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    url: { type: String, required: true },
    product: { type: Object, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDelete: { type: Boolean, default: false },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;