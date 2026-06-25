const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All admin routes should require admin role
router.use(authenticate);
router.use(isAdmin);

// Agent approval routes
router.get('/agents/pending', adminController.getPendingAgents);
router.post('/agents/:id/approve', adminController.approveAgent);
router.post('/agents/:id/reject', adminController.rejectAgent);

// Sensitive Words routes
router.get('/sensitive-words', adminController.getSensitiveWords);
router.post('/sensitive-words', adminController.updateSensitiveWords);

// KYC Rate Limit routes
router.get('/kyc-rate-limit', adminController.getKycRateLimit);
router.post('/kyc-rate-limit', adminController.updateKycRateLimit);

module.exports = router;
