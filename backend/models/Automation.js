const mongoose = require('mongoose');

const AutomationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  type: { type: String, enum: ['budget_threshold', 'recurring_reminder', 'weekly_report'], required: true },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  trigger: { type: mongoose.Schema.Types.Mixed, default: {} },
  schedule: {
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    intervalDays: { type: Number, min: 1, max: 365, default: 7 },
    timezone: { type: String, default: 'Asia/Kolkata', maxlength: 64 }
  },
  enabled: { type: Boolean, default: true, index: true },
  nextRunAt: { type: Date, required: true, index: true },
  lastRunAt: { type: Date, default: null },
  lastStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  idempotencyKey: { type: String, required: true },
  lockExpiresAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 }
}, { timestamps: true });

AutomationSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
AutomationSchema.index({ enabled: 1, nextRunAt: 1, lockExpiresAt: 1 });

module.exports = mongoose.model('Automation', AutomationSchema);
