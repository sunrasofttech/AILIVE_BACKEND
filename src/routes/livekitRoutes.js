const express = require('express');
const LivekitController = require('../controllers/livekitController');

const router = express.Router();

// LiveKit calls this webhook with raw request signature validation
router.post('/webhook', express.raw({ type: () => true }), LivekitController.handleWebhook);

module.exports = router;
