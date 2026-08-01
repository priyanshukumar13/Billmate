const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const receiptController = require('../controllers/receiptController');

// Multer memory storage setup (file is stored in buffer rather than local folder)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // limit 10MB
});

router.post('/upload', auth, upload.single('receipt'), receiptController.uploadAndProcessReceipt);
router.post('/save', auth, receiptController.confirmReceiptSave);
router.get('/history', auth, receiptController.getReceiptHistory);

module.exports = router;
