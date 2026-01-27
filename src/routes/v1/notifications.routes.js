const express = require("express");
const { notificationController } = require("../../controllers");
const auth = require("../../middlewares/auth");
const router = express.Router();

router.post("/", auth("user"), notificationController.createNotification);
router.get("/all", auth("user"), notificationController.getNotification);
router.patch('/read-all', auth('user'), notificationController.readAllNotification);

router.patch("/onetime", auth("user"), notificationController.updatePushNotification);
router.get("/mypush-notify", auth("user"), notificationController.getPushNotification);


module.exports = router;