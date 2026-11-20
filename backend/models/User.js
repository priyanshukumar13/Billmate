// backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    trim: true,
    default: function() {
      return (this.email ? this.email.split('@')[0] : '') || this.name || 'user';
    }
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  full_name: { type: String, required: true, trim: true, default: 'User' },
  name: { type: String, default: '' },
  phone_number: { type: String, default: '' },
  profile_picture: { type: String, default: '' },
  password: { type: String, required: true },
  date: { type: Date, default: Date.now },
  email_notifications: { type: Boolean, default: true },
  sms_notifications: { type: Boolean, default: false },
  reminder_days_before: { type: [Number], default: [1, 3] },
  // Session state
  token_version: { type: Number, default: 0 },
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Backward compatibility: preserve existing users that have legacy schema (e.g. only `name` or only `username`).
UserSchema.pre('validate', async function () {
  if (!this.full_name || this.full_name.trim() === '') {
    this.full_name = this.username || this.name || 'User';
  }
  if (!this.username || this.username.trim() === '') {
    this.username = (this.email ? this.email.split('@')[0] : '') || this.full_name || this.name || 'user';
  }
});

module.exports = mongoose.model('User', UserSchema);