const Receipt = require('../models/Receipt');
const Bill = require('../models/Bill');
const s3Service = require('../services/s3Service');
const ocrService = require('../services/ocrService');
const geminiService = require('../services/geminiService');

async function uploadAndProcessReceipt(req, res) {
  try {
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ msg: 'Please select a receipt file to upload.' });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({ msg: 'Invalid file type. Supported formats: JPG, PNG, WEBP, PDF.' });
    }

    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ msg: 'File size exceeds maximum allowed limit of 10MB.' });
    }

    // 1. Upload file to S3 (or local storage fallback)
    const uploadResult = await s3Service.uploadFile(file.buffer, file.originalname, 'receipts');

    // 2. Perform OCR on the buffer
    const ocrText = await ocrService.extractText(file.buffer, file.mimetype);
    if (!ocrText || !ocrText.trim()) {
      return res.status(422).json({ msg: 'Could not extract readable text from the receipt. You can still enter details manually.' });
    }

    // 3. Structure text using Gemini
    const structuredData = await geminiService.parseReceiptText(ocrText);

    // 4. Save to scanned receipts history
    const newReceipt = new Receipt({
      userId,
      merchant: structuredData.merchant || 'Receipt Merchant',
      amount: Number(structuredData.amount) || 0,
      dueDate: structuredData.due_date ? new Date(structuredData.due_date) : new Date(),
      billNumber: structuredData.bill_number || null,
      category: structuredData.category || 'Bills',
      fileKey: uploadResult.key,
      fileLocation: uploadResult.location,
      extractedData: structuredData,
      status: 'pending'
    });
    await newReceipt.save();

    return res.json({
      receiptId: newReceipt._id,
      preview: structuredData,
      fileLocation: uploadResult.location
    });
  } catch (err) {
    console.error('Receipt upload controller error:', err);
    return res.status(500).json({ msg: err.message || 'Internal server error during receipt parsing.' });
  }
}

async function confirmReceiptSave(req, res) {
  try {
    const userId = req.user.id;
    const { receiptId, name, amount, date, category } = req.body || {};

    const trimmedName = (name || '').trim();
    const numAmount = Number(amount);
    const trimmedDate = (date || '').trim();

    if (!trimmedName) {
      return res.status(400).json({ msg: 'Bill name / merchant is required.' });
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ msg: 'Bill amount must be greater than ₹0.' });
    }
    if (!trimmedDate) {
      return res.status(400).json({ msg: 'Due date is required.' });
    }

    if (receiptId) {
      const receipt = await Receipt.findOne({ _id: receiptId, userId });
      if (receipt) {
        receipt.status = 'saved';
        await receipt.save();
      }
    }

    const validCategories = ['Rent', 'Food', 'Bills', 'Utilities', 'Subscription', 'Insurance', 'Other'];
    const assignedCategory = validCategories.includes(category) ? category : 'Bills';

    // Create the Bill linked with user
    const newBill = new Bill({
      user: userId,
      name: trimmedName,
      amount: numAmount,
      date: trimmedDate.split('T')[0],
      category: assignedCategory,
      status: 'Unpaid'
    });
    await newBill.save();

    return res.json({ msg: 'Bill saved successfully from receipt!', bill: newBill });
  } catch (err) {
    console.error('Receipt confirm save error:', err);
    return res.status(500).json({ msg: 'Internal server error confirming bill.' });
  }
}

async function getReceiptHistory(req, res) {
  try {
    const userId = req.user.id;
    const history = await Receipt.find({ userId }).sort({ createdAt: -1 });
    return res.json(history);
  } catch (err) {
    console.error('Receipt history error:', err);
    return res.status(500).json({ msg: 'Internal server error fetching receipt history.' });
  }
}

module.exports = {
  uploadAndProcessReceipt,
  confirmReceiptSave,
  getReceiptHistory
};
