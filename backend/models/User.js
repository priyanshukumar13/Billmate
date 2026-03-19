// backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // We will hash this later
  date: { type: Date, default: Date.now },
  // Password reset (OTP) fields
  passwordResetOtpHash: { type: String, default: null },
  passwordResetOtpExpires: { type: Date, default: null }
});

module.exports = mongoose.model('User', UserSchema);