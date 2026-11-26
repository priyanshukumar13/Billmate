const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  scheduledAt: { type: Date, required: true, index: true },
  timezone: { type: String, default: 'Asia/Kolkata', maxlength: 64 },
  status: { type: String, enum: ['pending', 'processing', 'sent', 'failed', 'cancelled'], default: 'pending', index: true },
  notifiedAt: { type: Date, default: null },
  idempotencyKey: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockExpiresAt: { type: Date, default: null },
  lastError: { type: String, default: '' }
}, { timestamps: true });

ReminderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
ReminderSchema.index({ status: 1, scheduledAt: 1, nextAttemptAt: 1 });

module.exports = mongoose.model('Reminder', ReminderSchema);
