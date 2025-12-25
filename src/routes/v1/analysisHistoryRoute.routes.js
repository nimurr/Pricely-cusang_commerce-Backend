const express = require("express");
const { analysisHistoryController } = require("../../controllers");
const auth = require("../../middlewares/auth");
const router = express.Router();

router.post("/", auth("user"), analysisHistoryController.createHistory);
router.get("/", auth("user"), analysisHistoryController.getHistory);
router.get('/:id', auth('user'), analysisHistoryController.getHistoryById);


module.exports = router;