const express = require('express');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

function normalizePhone(phone) {
  return String(phone || '').trim();
}

function isValidPhone(phone) {
  if (!phone) return true; // optional
  return /^\+?[0-9\s\-()]{7,20}$/.test(phone);
}

function parseReminderDays(input) {
  if (Array.isArray(input)) {
    const parsed = input.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 30);
    return [...new Set(parsed)].sort((a, b) => a - b);
  }

  if (typeof input === 'string') {
    const parsed = input
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 30);
    return [...new Set(parsed)].sort((a, b) => a - b);
  }

  return [1, 3];
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    phone_number: user.phone_number || '',
    profile_picture: user.profile_picture || '',
    email_notifications: Boolean(user.email_notifications),
    sms_notifications: Boolean(user.sms_notifications),
    reminder_days_before: Array.isArray(user.reminder_days_before) ? user.reminder_days_before : [1, 3],
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

// GET /api/profile
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    return res.json(sanitizeUser(user));
  } catch (error) {
    return res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/profile/update
router.put('/update', auth, async (req, res) => {
  const { full_name, email, phone_number, profile_picture } = req.body || {};

  if (!full_name || String(full_name).trim() === '') {
    return res.status(400).json({ msg: 'Full name is required' });
  }

  const cleanPhone = normalizePhone(phone_number);
  if (!isValidPhone(cleanPhone)) {
    return res.status(400).json({ msg: 'Invalid phone number format' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (!email || String(email).trim() === '') {
      return res.status(400).json({ msg: 'Email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingWithEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: req.user.id } });
    if (existingWithEmail) {
      return res.status(400).json({ msg: 'Email is already in use' });
    }

    user.full_name = String(full_name).trim();
    user.username = user.full_name; // compatibility with existing UI/flows
    user.email = normalizedEmail;
    user.phone_number = cleanPhone;
    user.profile_picture = profile_picture ? String(profile_picture).trim() : '';

    await user.save();
    return res.json({ msg: 'Profile updated successfully', user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/profile/change-password
router.put('/change-password', auth, async (req, res) => {
  const { old_password, new_password } = req.body || {};

  if (!old_password || !new_password) {
    return res.status(400).json({ msg: 'Old password and new password are required' });
  }

  if (String(new_password).length < 6) {
    return res.status(400).json({ msg: 'New password must be at least 6 characters' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const isMatch = await bcrypt.compare(old_password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Old password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(new_password, salt);
    await user.save();

    return res.json({ msg: 'Password changed successfully' });
  } catch (error) {
    return res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/profile/notifications
router.get('/notifications', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    return res.json({
      email_notifications: Boolean(user.email_notifications),
      sms_notifications: Boolean(user.sms_notifications),
      reminder_days_before: Array.isArray(user.reminder_days_before) ? user.reminder_days_before : [1, 3]
    });
  } catch (error) {
    return res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/profile/notifications
router.put('/notifications', auth, async (req, res) => {
  const { email_notifications, sms_notifications, reminder_days_before } = req.body || {};
  const parsedReminderDays = parseReminderDays(reminder_days_before);

  if (parsedReminderDays.length === 0) {
    return res.status(400).json({ msg: 'Reminder days must include at least one valid day (0-30)' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    user.email_notifications = Boolean(email_notifications);
    user.sms_notifications = Boolean(sms_notifications);
    user.reminder_days_before = parsedReminderDays;
    await user.save();

    return res.json({
      msg: 'Notification preferences updated',
      notifications: {
        email_notifications: user.email_notifications,
        sms_notifications: user.sms_notifications,
        reminder_days_before: user.reminder_days_before
      }
    });
  } catch (error) {
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
