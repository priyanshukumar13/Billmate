const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: { 
    type: String, 
    required: [true, 'Bill name is required'],
    trim: true,
    maxlength: [100, 'Bill name cannot exceed 100 characters']
  },
  amount: { 
    type: Number, 
    required: [true, 'Bill amount is required'],
    min: [0.01, 'Bill amount must be greater than 0']
  },
  date: { 
    type: String, 
    required: [true, 'Due date is required'] 
  },
  category: { 
    type: String, 
    default: 'Bills',
    enum: ['Rent', 'Food', 'Bills', 'Utilities', 'Subscription', 'Insurance', 'Shopping', 'Travel', 'Entertainment', 'Health', 'Other']
  },
  status: { 
    type: String, 
    default: 'Unpaid',
    enum: ['Unpaid', 'Paid', 'Upcoming', 'Due Soon', 'Overdue']
  },
  paidDate: {
    type: Date,
    default: null
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  // Backward-compatible expense tracking fields
  type: {
    type: String,
    enum: ['bill', 'expense'],
    default: 'bill',
    index: true
  },
  paymentMethod: {
    type: String,
    default: 'Other'
  },
  sourceApp: {
    type: String,
    default: null
  },
  transactionFingerprint: {
    type: String,
    default: null,
    index: true
  },
  transactionDate: {
    type: Date,
    default: null
  },
  // Track reminder notifications to prevent duplicate emails
  reminders: {
    sevenDays: { type: Boolean, default: false },
    threeDays: { type: Boolean, default: false },
    oneDay: { type: Boolean, default: false },
    dueToday: { type: Boolean, default: false },
    overdue: { type: Boolean, default: false },
    // Backward compatibility fields
    dayBeforeMorning: { type: Boolean, default: false },
    dayBeforeEvening: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Alias userId -> user
BillSchema.virtual('userId').get(function () {
  return this.user;
});

module.exports = mongoose.model('Bill', BillSchema);