const express = require("express");
const { productController } = require("../../controllers");
const auth = require("../../middlewares/auth");
const { productValidation } = require("../../validations");
const router = express.Router();

router.get("/",
    auth("user"),
    productController.getProducts);
router.post("/",
    auth("user"),
    // productValidation.createProduct,
    productController.createProduct);

router.get("/history",
    auth("user"),
    productController.getHistory);

router.get("/:id",
    auth("user"),
    productController.getProductById);

module.exports = router;