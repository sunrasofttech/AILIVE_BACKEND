const express = require('express');
const AgentController = require('../controllers/agentController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, isMerchant);

router.get('/', AgentController.getAll);
router.get('/:id', AgentController.getById);
router.post('/', AgentController.create);
router.put('/:id', AgentController.update);
router.delete('/:id', AgentController.delete);

module.exports = router;
