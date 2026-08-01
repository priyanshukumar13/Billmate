const mongoose = require('mongoose');

const ReceiptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  merchant: { type: String },
  amount: { type: Number },
  dueDate: { type: Date },
  billNumber: { type: String },
  category: { type: String },
  fileKey: { type: String },
  fileLocation: { type: String },
  extractedData: { type: Object },
  status: { type: String, enum: ['pending', 'saved'], default: 'pending' },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Receipt', ReceiptSchema);
