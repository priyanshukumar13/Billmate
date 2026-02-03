const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
    // required: true <-- Remove this for now to test
  },
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: String, required: true },
  category: { type: String },
  status: { type: String, default: 'Unpaid' },
  // Track which reminder notifications have been sent to avoid duplicates
  reminders: {
    threeDays: { type: Boolean, default: false },
    dayBeforeMorning: { type: Boolean, default: false },
    dayBeforeEvening: { type: Boolean, default: false }
  }
});

module.exports = mongoose.model('Bill', BillSchema);