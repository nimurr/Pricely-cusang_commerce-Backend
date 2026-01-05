const express = require("express");
const { productController } = require("../../controllers");
const auth = require("../../middlewares/auth");
const router = express.Router();

// Get all products
router.get("/",
    auth("user"),
    productController.getProducts);

// Create a new product
router.post("/",
    auth("user"),
    productController.createProduct);
// Add note in product
router.post('/add-note/:id', auth("user"), productController.addNote);

// Mark as Purchased
router.post("/mark-as-purchased/:id",
    auth("user"),
    productController.markAsPurchased);

// Get history
router.get("/history",
    auth("user"),
    productController.getHistory);
// Get product by id
router.get("/:id",
    auth("user"),
    productController.getProductById);

// Delete product by id form Dahsboard
router.delete("/:id",
    auth("user"),
    productController.deleteProductById);

// Delete product from history by id
router.delete("/history/:id",
    auth("user"),
    productController.deleteHistoryById);

module.exports = router;