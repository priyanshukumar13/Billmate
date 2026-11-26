const mongoose = require('mongoose');

const AutomationHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  automationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true, index: true },
  action: { type: String, required: true, maxlength: 120 },
  executionStatus: { type: String, enum: ['success', 'failed'], required: true },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  error: { type: String, default: '' },
  executionKey: { type: String, required: true },
  executedAt: { type: Date, default: Date.now }
}, { timestamps: true });

AutomationHistorySchema.index({ executionKey: 1 }, { unique: true });
AutomationHistorySchema.index({ userId: 1, executedAt: -1 });

module.exports = mongoose.model('AutomationHistory', AutomationHistorySchema);
