const express = require('express');
const auth = require('../../middlewares/auth');
const { feedbackController } = require('../../controllers');
const router = express.Router();

// Define your feedback routes here
router.post('/', auth('user'), feedbackController.createFeedback);

module.exports = router;