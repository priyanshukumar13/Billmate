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
      return res.status(400).json({ msg: 'Please upload a receipt file.' });
    }

    // 1. Upload file to S3 (or local storage fallback)
    const uploadResult = await s3Service.uploadFile(file.buffer, file.originalname, 'receipts');

    // 2. Perform OCR on the buffer
    const ocrText = await ocrService.extractText(file.buffer, file.mimetype);
    if (!ocrText.trim()) {
      return res.status(422).json({ msg: 'Could not extract any readable text from the receipt.' });
    }

    // 3. Structure text using Gemini
    const structuredData = await geminiService.parseReceiptText(ocrText);

    // 4. Save to scanned receipts history
    const newReceipt = new Receipt({
      userId,
      merchant: structuredData.merchant,
      amount: structuredData.amount,
      dueDate: structuredData.due_date ? new Date(structuredData.due_date) : null,
      billNumber: structuredData.bill_number,
      category: structuredData.category || 'Other',
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
    const { receiptId, name, amount, date, category } = req.body;

    if (!receiptId || !name || !amount || !date) {
      return res.status(400).json({ msg: 'Missing required bill fields.' });
    }

    const receipt = await Receipt.findOne({ _id: receiptId, userId });
    if (!receipt) {
      return res.status(404).json({ msg: 'Receipt transaction not found.' });
    }

    // Create the Bill in the database
    const newBill = new Bill({
      userId,
      name,
      amount,
      date,
      category,
      status: 'Unpaid' // Starts unpaid by default
    });
    await newBill.save();

    // Mark receipt as saved
    receipt.status = 'saved';
    await receipt.save();

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
