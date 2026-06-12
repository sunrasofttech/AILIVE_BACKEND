const express = require('express');
const ReportController = require('../controllers/reportController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, isMerchant);

// Fetch reports
router.get('/', ReportController.getAllReports);
router.get('/session/:sessionId', ReportController.getReportBySession);

module.exports = router;
