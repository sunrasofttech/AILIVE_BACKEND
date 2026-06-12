const express = require('express');
const CampaignController = require('../controllers/campaignController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, isMerchant);

// Campaign settings
router.get('/', CampaignController.getAll);
router.get('/:id', CampaignController.getById);
router.post('/', CampaignController.create);
router.put('/:id', CampaignController.update);
router.delete('/:id', CampaignController.delete);

// Execution controls
router.post('/:id/start', CampaignController.start);
router.post('/:id/pause', CampaignController.pause);
router.post('/:id/resume', CampaignController.resume);
router.post('/:id/stop', CampaignController.stop);
router.post('/:id/retry', CampaignController.retryFailedCalls);

module.exports = router;
