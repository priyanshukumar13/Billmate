// backend/models/OtpChallenge.js
const mongoose = require('mongoose');

const OtpChallengeSchema = new mongoose.Schema({
  challenge_id: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  email: { 
    type: String, 
    required: true, 
    lowercase: true, 
    trim: true 
  },
  purpose: { 
    type: String, 
    enum: ['FIRST_LOGIN', 'FORGOT_PASSWORD'], 
    required: true 
  },
  otp_hash: { 
    type: String, 
    required: true 
  },
  expires_at: { 
    type: Date, 
    required: true 
  },
  attempts: { 
    type: Number, 
    default: 0 
  },
  max_attempts: { 
    type: Number, 
    default: 5 
  },
  consumed: { 
    type: Boolean, 
    default: false 
  },
  resend_cooldown_until: { 
    type: Date, 
    default: Date.now 
  },
  reset_token_hash: { 
    type: String, 
    default: null 
  },
  reset_token_expires_at: { 
    type: Date, 
    default: null 
  },
  created_at: { 
    type: Date, 
    default: Date.now, 
    expires: 3600 // Automatically expire after 1 hour in MongoDB
  }
});

module.exports = mongoose.model('OtpChallenge', OtpChallengeSchema);
