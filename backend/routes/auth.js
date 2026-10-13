const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const OtpChallenge = require('../models/OtpChallenge');
const emailService = require('../utils/emailService');
const auth = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_OTP_ATTEMPTS = 5;

// Cryptographic helpers
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashValue(val) {
  return crypto.createHmac('sha256', JWT_SECRET).update(String(val)).digest('hex');
}

function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return '***@***.***';
  }
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  const visiblePrefix = local.slice(0, 2);
  const visibleSuffix = local.slice(-1);
  return `${visiblePrefix}****${visibleSuffix}@${domain}`;
}

function validatePasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

// ===============================
// 1. SIGNUP ROUTE
// ===============================
router.post('/signup', async (req, res) => {
  const { username, full_name, email, password } = req.body || {};

  const trimmedUsername = (username || '').trim();
  const trimmedEmail = (email || '').trim().toLowerCase();
  const trimmedFullName = (full_name || '').trim() || trimmedUsername;

  if (!trimmedUsername || !trimmedEmail || !password) {
    return res.status(400).json({ success: false, msg: 'Please provide username, email, and password.' });
  }

  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return res.status(400).json({ success: false, msg: 'Please enter a valid email address.' });
  }

  const passwordError = validatePasswordPolicy(password);
  if (passwordError) {
    return res.status(400).json({ success: false, msg: passwordError });
  }

  try {
    const existingUser = await User.findOne({
      $or: [
        { email: trimmedEmail },
        { username: trimmedUsername }
      ]
    });

    if (existingUser) {
      if (existingUser.email === trimmedEmail) {
        return res.status(409).json({ success: false, msg: 'An account with this email already exists.' });
      }
      return res.status(409).json({ success: false, msg: 'This username is already taken.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username: trimmedUsername,
      full_name: trimmedFullName,
      email: trimmedEmail,
      password: hashedPassword,
      is_verified: false,
      token_version: 0
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Please log in to complete email verification.',
      msg: 'Account created successfully. Please log in to complete email verification.',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        is_verified: false
      }
    });
  } catch (err) {
    console.error('Signup Error:', err);
    return res.status(500).json({ success: false, msg: 'Server error during signup. Please try again later.' });
  }
});

// ===============================
// 2. LOGIN ROUTE
// ===============================
router.post('/login', async (req, res) => {
  const { username, email, usernameOrEmail, password } = req.body || {};
  const identifier = (username || email || usernameOrEmail || '').trim();

  if (!identifier || !password) {
    return res.status(400).json({ success: false, msg: 'Please provide both username/email and password.' });
  }

  try {
    const lowerIdentifier = identifier.toLowerCase();
    const user = await User.findOne({
      $or: [
        { email: lowerIdentifier },
        { email: identifier },
        { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }
      ]
    });

    if (!user) {
      return res.status(401).json({ success: false, msg: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, msg: 'Invalid email or password.' });
    }

    // Check if first-login email verification is required
    if (user.is_verified === false) {
      // Invalidate existing active FIRST_LOGIN challenges for this user
      await OtpChallenge.updateMany(
        { user_id: user._id, purpose: 'FIRST_LOGIN', consumed: false },
        { $set: { consumed: true } }
      );

      const otp = generateOtp();
      const challengeId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
      const resendCooldownUntil = new Date(Date.now() + RESEND_COOLDOWN_MS);

      const challenge = new OtpChallenge({
        challenge_id: challengeId,
        user_id: user._id,
        email: user.email,
        purpose: 'FIRST_LOGIN',
        otp_hash: hashValue(otp),
        expires_at: expiresAt,
        resend_cooldown_until: resendCooldownUntil,
        max_attempts: MAX_OTP_ATTEMPTS
      });
      await challenge.save();

      // Send OTP to registered email
      try {
        await emailService.sendFirstLoginOtp({
          to: user.email,
          otp,
          fullName: user.full_name || user.username,
          expiryMinutes: 5
        });
      } catch (mailErr) {
        console.error('Failed to send first login OTP email:', mailErr.message);
        // Do not return successful challenge if mail delivery failed
        await OtpChallenge.findByIdAndDelete(challenge._id);
        return res.status(503).json({
          success: false,
          msg: 'Unable to deliver verification code email. Please verify email configuration or try again shortly.'
        });
      }

      return res.status(200).json({
        success: true,
        requireOtp: true,
        purpose: 'FIRST_LOGIN',
        challengeId,
        emailMasked: maskEmail(user.email),
        expiresInSeconds: 300,
        cooldownSeconds: 60,
        message: 'First-time login verification code sent to your registered email.',
        msg: 'First-time login verification code sent to your registered email.'
      });
    }

    // Normal Login: Verified user
    const tokenVersion = user.token_version || 0;
    const payload = {
      user: {
        id: user.id,
        token_version: tokenVersion
      }
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        profile_picture: user.profile_picture || '',
        is_verified: true
      }
    });
  } catch (err) {
    console.error('Login Error:', err.message);
    return res.status(500).json({ success: false, msg: 'Server error during login. Please try again.' });
  }
});

// ===============================
// 3. VERIFY FIRST-LOGIN OTP ROUTE
// ===============================
router.post('/verify-first-login-otp', async (req, res) => {
  const { challengeId, otp } = req.body || {};

  if (!challengeId || !otp) {
    return res.status(400).json({ success: false, msg: 'Challenge ID and OTP are required.' });
  }

  const cleanOtp = String(otp).trim();
  if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({ success: false, msg: 'OTP must be a 6-digit numeric code.' });
  }

  try {
    const challenge = await OtpChallenge.findOne({
      challenge_id: challengeId,
      purpose: 'FIRST_LOGIN',
      consumed: false
    });

    if (!challenge) {
      return res.status(400).json({ success: false, msg: 'Invalid or already consumed verification challenge.' });
    }

    if (challenge.expires_at < new Date()) {
      challenge.consumed = true;
      await challenge.save();
      return res.status(400).json({ success: false, msg: 'Verification code has expired. Please request a new code.' });
    }

    if (challenge.attempts >= challenge.max_attempts) {
      challenge.consumed = true;
      await challenge.save();
      return res.status(429).json({ success: false, msg: 'Maximum verification attempts exceeded. Please request a new code.' });
    }

    const isMatch = safeCompare(challenge.otp_hash, hashValue(cleanOtp));
    if (!isMatch) {
      challenge.attempts += 1;
      if (challenge.attempts >= challenge.max_attempts) {
        challenge.consumed = true;
      }
      await challenge.save();
      const remaining = Math.max(0, challenge.max_attempts - challenge.attempts);
      return res.status(400).json({
        success: false,
        msg: remaining > 0 ? `Invalid code. ${remaining} attempt(s) remaining.` : 'Maximum verification attempts exceeded. Please request a new code.',
        attemptsRemaining: remaining
      });
    }

    // OTP is valid! Atomically consume challenge
    challenge.consumed = true;
    await challenge.save();

    // Mark user as verified persistently
    const user = await User.findById(challenge.user_id);
    if (!user) {
      return res.status(404).json({ success: false, msg: 'User account not found.' });
    }

    user.is_verified = true;
    await user.save();

    // Issue access token
    const tokenVersion = user.token_version || 0;
    const payload = {
      user: {
        id: user.id,
        token_version: tokenVersion
      }
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully! Logging you in.',
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        profile_picture: user.profile_picture || '',
        is_verified: true
      }
    });
  } catch (err) {
    console.error('Verify First Login OTP Error:', err);
    return res.status(500).json({ success: false, msg: 'Server error verifying code. Please try again.' });
  }
});

// ===============================
// 4. FORGOT PASSWORD (REQUEST OTP)
// ===============================
router.post('/forgot-password', async (req, res) => {
  const { usernameOrEmail, email } = req.body || {};
  const identifier = String(email || usernameOrEmail || '').trim();

  if (!identifier) {
    return res.status(400).json({ success: false, msg: 'Please enter your registered username or email.' });
  }

  try {
    const lowerIdentifier = identifier.toLowerCase();
    const user = await User.findOne({
      $or: [
        { email: lowerIdentifier },
        { email: identifier },
        { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }
      ]
    });

    // Anti-enumeration: Return generic message whether user exists or not
    if (!user) {
      // Simulate delay to prevent timing analysis
      await new Promise(r => setTimeout(r, 100));
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a verification code has been sent.',
        msg: 'If an account exists with this email, a verification code has been sent.',
        challengeId: crypto.randomUUID(), // non-actionable dummy ID
        emailMasked: maskEmail(identifier)
      });
    }

    // Invalidate prior active forgot-password challenges
    await OtpChallenge.updateMany(
      { user_id: user._id, purpose: 'FORGOT_PASSWORD', consumed: false },
      { $set: { consumed: true } }
    );

    const otp = generateOtp();
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const resendCooldownUntil = new Date(Date.now() + RESEND_COOLDOWN_MS);

    const challenge = new OtpChallenge({
      challenge_id: challengeId,
      user_id: user._id,
      email: user.email,
      purpose: 'FORGOT_PASSWORD',
      otp_hash: hashValue(otp),
      expires_at: expiresAt,
      resend_cooldown_until: resendCooldownUntil,
      max_attempts: MAX_OTP_ATTEMPTS
    });
    await challenge.save();

    try {
      await emailService.sendPasswordResetOtp({
        to: user.email,
        otp,
        fullName: user.full_name || user.username,
        expiryMinutes: 5
      });
    } catch (mailErr) {
      console.error('Failed to send forgot password email:', mailErr.message);
      await OtpChallenge.findByIdAndDelete(challenge._id);
      return res.status(503).json({
        success: false,
        msg: 'Email service unavailable. Please try again later.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists with this email, a verification code has been sent.',
      msg: 'If an account exists with this email, a verification code has been sent.',
      challengeId,
      emailMasked: maskEmail(user.email),
      expiresInSeconds: 300,
      cooldownSeconds: 60
    });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    return res.status(500).json({ success: false, msg: 'Server error processing request.' });
  }
});

// ===============================
// 5. VERIFY RESET OTP (STEP 2 OF FORGOT PASSWORD)
// ===============================
router.post('/verify-reset-otp', async (req, res) => {
  const { challengeId, otp } = req.body || {};

  if (!challengeId || !otp) {
    return res.status(400).json({ success: false, msg: 'Challenge ID and OTP are required.' });
  }

  const cleanOtp = String(otp).trim();
  if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({ success: false, msg: 'OTP must be a 6-digit numeric code.' });
  }

  try {
    const challenge = await OtpChallenge.findOne({
      challenge_id: challengeId,
      purpose: 'FORGOT_PASSWORD',
      consumed: false
    });

    if (!challenge) {
      return res.status(400).json({ success: false, msg: 'Invalid or already consumed verification code.' });
    }

    if (challenge.expires_at < new Date()) {
      challenge.consumed = true;
      await challenge.save();
      return res.status(400).json({ success: false, msg: 'Verification code has expired. Please request a new code.' });
    }

    if (challenge.attempts >= challenge.max_attempts) {
      challenge.consumed = true;
      await challenge.save();
      return res.status(429).json({ success: false, msg: 'Maximum verification attempts exceeded. Please request a new code.' });
    }

    const isMatch = safeCompare(challenge.otp_hash, hashValue(cleanOtp));
    if (!isMatch) {
      challenge.attempts += 1;
      if (challenge.attempts >= challenge.max_attempts) {
        challenge.consumed = true;
      }
      await challenge.save();
      const remaining = Math.max(0, challenge.max_attempts - challenge.attempts);
      return res.status(400).json({
        success: false,
        msg: remaining > 0 ? `Invalid code. ${remaining} attempt(s) remaining.` : 'Maximum verification attempts exceeded. Please request a new code.',
        attemptsRemaining: remaining
      });
    }

    // Single-use: Consume OTP immediately
    challenge.consumed = true;

    // Issue single-use, short-lived reset authorization token (10 minutes)
    const resetToken = crypto.randomBytes(32).toString('hex');
    challenge.reset_token_hash = hashValue(resetToken);
    challenge.reset_token_expires_at = new Date(Date.now() + 10 * 60 * 1000);
    await challenge.save();

    return res.status(200).json({
      success: true,
      message: 'Code verified successfully. Please enter your new password.',
      resetToken,
      emailMasked: maskEmail(challenge.email)
    });
  } catch (err) {
    console.error('Verify reset OTP error:', err);
    return res.status(500).json({ success: false, msg: 'Server error verifying reset code.' });
  }
});

// ===============================
// 6. RESET PASSWORD (STEP 3 OF FORGOT PASSWORD)
// ===============================
router.post('/reset-password', async (req, res) => {
  const { resetToken, newPassword, confirmPassword } = req.body || {};

  if (!resetToken || !newPassword) {
    return res.status(400).json({ success: false, msg: 'Reset token and new password are required.' });
  }

  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, msg: 'Passwords do not match.' });
  }

  const passwordError = validatePasswordPolicy(newPassword);
  if (passwordError) {
    return res.status(400).json({ success: false, msg: passwordError });
  }

  try {
    const hashedResetToken = hashValue(resetToken);
    const challenge = await OtpChallenge.findOne({
      reset_token_hash: hashedResetToken,
      reset_token_expires_at: { $gt: new Date() }
    });

    if (!challenge) {
      return res.status(400).json({
        success: false,
        msg: 'Password reset authorization is invalid or has expired. Please restart the forgot-password process.'
      });
    }

    const user = await User.findById(challenge.user_id);
    if (!user) {
      return res.status(404).json({ success: false, msg: 'User account not found.' });
    }

    // Ensure legacy users have username & full_name populated
    if (!user.username) {
      user.username = (user.email ? user.email.split('@')[0] : '') || user.name || 'user';
    }
    if (!user.full_name) {
      user.full_name = user.name || user.username || 'User';
    }

    // Hash new password securely using bcrypt
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Invalidate all existing sessions / tokens
    user.token_version = (user.token_version || 0) + 1;
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpires = null;
    await user.save();

    // Invalidate reset authorization only AFTER user password update succeeds (single-use)
    challenge.reset_token_hash = null;
    challenge.reset_token_expires_at = null;
    await challenge.save();

    // Send confirmation email asynchronously
    emailService.sendPasswordChangedNotification({
      to: user.email,
      fullName: user.full_name || user.username
    }).catch(err => {
      console.warn('Could not deliver password changed confirmation email:', err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
      msg: 'Password reset successfully. Please log in with your new password.'
    });
  } catch (err) {
    console.error('Reset password completion error:', err.message);
    return res.status(500).json({ success: false, msg: 'Server error resetting password.' });
  }
});

// ===============================
// 7. RESEND OTP ROUTE
// ===============================
router.post('/resend-otp', async (req, res) => {
  const { challengeId } = req.body || {};

  if (!challengeId) {
    return res.status(400).json({ success: false, msg: 'Challenge ID is required to resend.' });
  }

  try {
    const previousChallenge = await OtpChallenge.findOne({ challenge_id: challengeId });
    if (!previousChallenge) {
      return res.status(400).json({ success: false, msg: 'Challenge not found or invalid.' });
    }

    // Enforce 60-second cooldown
    if (previousChallenge.resend_cooldown_until > new Date()) {
      const waitSeconds = Math.ceil((previousChallenge.resend_cooldown_until.getTime() - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        msg: `Please wait ${waitSeconds} second(s) before requesting a new code.`,
        waitSeconds
      });
    }

    // Invalidate prior challenge
    previousChallenge.consumed = true;
    await previousChallenge.save();

    const user = await User.findById(previousChallenge.user_id);
    if (!user) {
      return res.status(404).json({ success: false, msg: 'User account not found.' });
    }

    // Create new challenge
    const otp = generateOtp();
    const newChallengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const resendCooldownUntil = new Date(Date.now() + RESEND_COOLDOWN_MS);

    const newChallenge = new OtpChallenge({
      challenge_id: newChallengeId,
      user_id: user._id,
      email: user.email,
      purpose: previousChallenge.purpose,
      otp_hash: hashValue(otp),
      expires_at: expiresAt,
      resend_cooldown_until: resendCooldownUntil,
      max_attempts: MAX_OTP_ATTEMPTS
    });
    await newChallenge.save();

    // Deliver email based on purpose
    try {
      if (previousChallenge.purpose === 'FIRST_LOGIN') {
        await emailService.sendFirstLoginOtp({
          to: user.email,
          otp,
          fullName: user.full_name || user.username,
          expiryMinutes: 5
        });
      } else {
        await emailService.sendPasswordResetOtp({
          to: user.email,
          otp,
          fullName: user.full_name || user.username,
          expiryMinutes: 5
        });
      }
    } catch (mailErr) {
      console.error('Failed to deliver resend OTP email:', mailErr.message);
      await OtpChallenge.findByIdAndDelete(newChallenge._id);
      return res.status(503).json({
        success: false,
        msg: 'Email service unavailable. Please try again shortly.'
      });
    }

    return res.status(200).json({
      success: true,
      challengeId: newChallengeId,
      emailMasked: maskEmail(user.email),
      expiresInSeconds: 300,
      cooldownSeconds: 60,
      message: 'A new verification code has been sent to your registered email.'
    });
  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ success: false, msg: 'Server error resending verification code.' });
  }
});

// ===============================
// 8. LOGOUT ROUTE
// ===============================
router.post('/logout', auth, async (req, res) => {
  try {
    // Invalidate all tokens for this user by incrementing token_version
    await User.findByIdAndUpdate(req.user.id, { $inc: { token_version: 1 } });
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully. All sessions revoked.'
    });
  } catch (err) {
    console.error('Logout error:', err.message);
    return res.status(500).json({ success: false, msg: 'Server error during logout.' });
  }
});

// ===============================
// 9. GET USER DATA (For Dashboard)
// ===============================
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json(user);
  } catch (err) {
    console.error('/me error:', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ===============================
// 10. EMAIL STATUS DIAGNOSTIC
// ===============================
router.get('/email-status', (_req, res) => {
  const isConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  const mode = process.env.MOCK_EMAIL === 'true' ? 'MOCK' : 'LIVE';
  return res.status(200).json({
    success: true,
    emailConfigured: isConfigured,
    mode,
    senderMasked: maskEmail(process.env.EMAIL_USER),
    time: new Date().toISOString()
  });
});

module.exports = router;