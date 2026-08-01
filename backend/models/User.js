// backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  full_name: { type: String, required: true, trim: true, default: 'User' },
  phone_number: { type: String, default: '' },
  profile_picture: { type: String, default: '' },
  password: { type: String, required: true }, // We will hash this later
  date: { type: Date, default: Date.now },
  email_notifications: { type: Boolean, default: true },
  sms_notifications: { type: Boolean, default: false },
  reminder_days_before: { type: [Number], default: [1, 3] },
  // Password reset (OTP) fields
  passwordResetOtpHash: { type: String, default: null },
  passwordResetOtpExpires: { type: Date, default: null }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Backward compatibility: preserve existing users that only have `username`.
UserSchema.pre('validate', async function () {
  if (!this.full_name || this.full_name.trim() === '') {
    this.full_name = this.username || 'User';
  }
});

module.exports = mongoose.model('User', UserSchema);