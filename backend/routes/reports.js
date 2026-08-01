const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const reportController = require('../controllers/reportController');

router.post('/generate', auth, reportController.generateMonthlyReport);
router.get('/history', auth, reportController.getSavedReports);

module.exports = router;
