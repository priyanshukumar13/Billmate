const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const aiController = require('../controllers/aiController');
const aiToolsController = require('../controllers/aiToolsController');
const difyToolAuth = require('../middleware/difyToolAuth');
const rateLimit = require('express-rate-limit');

const toolLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many AI tool requests. Please try again later.' }
});
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, error: 'Too many assistant requests. Please try again later.' }
});

// All routes require JWT authentication
router.post('/chat', auth, chatLimiter, aiController.handleChat);
router.get('/chat/history', auth, aiController.getChatHistory);
router.delete('/chat/history', auth, aiController.clearChatHistory);
router.get('/actions/pending', auth, aiController.getPendingActions);

// Dify tools require both the static service secret and a short-lived,
// user-bound context token issued by the authenticated chat endpoint.
router.get('/tools/bills', toolLimiter, difyToolAuth, aiToolsController.getBills);
router.get('/tools/expenses', toolLimiter, difyToolAuth, aiToolsController.getExpenses);
router.get('/tools/budget', toolLimiter, difyToolAuth, aiToolsController.getBudget);
router.post('/tools/expenses', toolLimiter, difyToolAuth, aiToolsController.addExpense);
router.post('/tools/bills', toolLimiter, difyToolAuth, aiToolsController.createBill);
router.post('/tools/reminders', toolLimiter, difyToolAuth, aiToolsController.createReminder);
router.post('/tools/automations', toolLimiter, difyToolAuth, aiToolsController.createAutomation);
router.post('/tools/bills/mark-paid', toolLimiter, difyToolAuth, aiToolsController.markBillPaid);

// User confirmation is deliberately separate from Dify tool authorization.
router.post('/actions/:token/confirm', auth, aiToolsController.confirmAction);
router.post('/actions/:token/cancel', auth, aiToolsController.cancelAction);
router.get('/automations', auth, aiToolsController.getAutomations);
router.patch('/automations/:id', auth, aiToolsController.setAutomationEnabled);

module.exports = router;
