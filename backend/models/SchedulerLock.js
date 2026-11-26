const mongoose = require('mongoose');

const SchedulerLockSchema = new mongoose.Schema({
  _id: { type: String },
  leaseExpiresAt: { type: Date, required: true },
  ownerToken: { type: String, default: null }
}, { versionKey: false });

module.exports = mongoose.model('SchedulerLock', SchedulerLockSchema);
