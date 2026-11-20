const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'devsecret');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePasswordPolicy(password) {
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    profile_picture: user.profile_picture || '',
  };
}

router.post('/signup', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const fullName = String(req.body?.full_name || '').trim() || username;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, msg: 'Please provide username, email, and password.' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, msg: 'Please enter a valid email address.' });
  }

  const passwordError = validatePasswordPolicy(password);
  if (passwordError) {
    return res.status(400).json({ success: false, msg: passwordError });
  }

  try {
    const existingUser = await User.findOne({
      $or: [{ email }, { username: { $regex: `^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }],
    });
    if (existingUser) {
      return res.status(existingUser.email === email ? 409 : 409).json({
        success: false,
        msg: existingUser.email === email
          ? 'An account with this email already exists.'
          : 'This username is already taken.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      full_name: fullName,
      email,
      password: hashedPassword,
      token_version: 0,
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Please log in.',
      msg: 'Account created successfully. Please log in.',
      user: publicUser(user),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({
        success: false,
        msg: duplicateField === 'username'
          ? 'This username is already taken.'
          : 'An account with this email already exists.',
      });
    }
    console.error('[AUTH] Signup error:', error.message);
    return res.status(500).json({ success: false, msg: 'Server error during signup. Please try again later.' });
  }
});

router.post('/login', async (req, res) => {
  const identifier = normalizeEmail(req.body?.email || req.body?.usernameOrEmail || req.body?.username);
  const password = req.body?.password;

  console.log('[AUTH] Login request received');
  if (!identifier || !password) {
    return res.status(400).json({ success: false, msg: 'Please provide email and password.' });
  }
  if (!JWT_SECRET) {
    console.error('[AUTH] JWT_SECRET is not configured');
    return res.status(500).json({ success: false, msg: 'Authentication is not configured on this server.' });
  }

  try {
    const user = await User.findOne({ email: identifier });
    if (!user) {
      return res.status(401).json({ success: false, msg: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, msg: 'Invalid email or password.' });
    }

    const tokenVersion = user.token_version || 0;
    const token = jwt.sign(
      { user: { id: user.id, token_version: tokenVersion } },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error.message);
    return res.status(500).json({ success: false, msg: 'Server error during login. Please try again.' });
  }
});

router.post('/logout', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { token_version: 1 } });
    return res.status(200).json({ success: true, message: 'Logged out successfully. All sessions revoked.' });
  } catch (error) {
    console.error('[AUTH] Logout error:', error.message);
    return res.status(500).json({ success: false, msg: 'Server error during logout.' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, msg: 'User not found.' });
    return res.json(user);
  } catch (error) {
    console.error('[AUTH] /me error:', error.message);
    return res.status(500).json({ success: false, msg: 'Server error.' });
  }
});

module.exports = router;
