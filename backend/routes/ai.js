const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const aiController = require('../controllers/aiController');

// All routes require JWT authentication
router.post('/chat', auth, aiController.handleChat);
router.get('/chat/history', auth, aiController.getChatHistory);
router.delete('/chat/history', auth, aiController.clearChatHistory);

module.exports = router;
