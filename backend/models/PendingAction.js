const mongoose = require('mongoose');

const PendingActionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  operation: {
    type: String,
    enum: ['add_expense', 'create_bill', 'create_reminder', 'create_automation', 'mark_bill_paid'],
    required: true
  },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  preview: { type: String, required: true, maxlength: 500 },
  confirmationHash: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'failed'],
    default: 'pending',
    index: true
  },
  expiresAt: { type: Date, required: true },
  resultId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { timestamps: true });

PendingActionSchema.index({ userId: 1, operation: 1, idempotencyKey: 1 }, { unique: true });
PendingActionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PendingAction', PendingActionSchema);
