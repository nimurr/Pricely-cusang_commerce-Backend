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

module.exports = router;