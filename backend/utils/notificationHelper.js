const Notification = require('../models/Notification');

/**
 * Creates an in-app notification for a user.
 */
async function createNotification({ userId, title, message, type, billId, billName, deduplicationKey }) {
  if (!userId) return null;
  try {
    if (deduplicationKey) {
      const existing = await Notification.findOne({ user: userId, deduplicationKey });
      if (existing) return existing;
    }
    const notification = new Notification({
      user: userId,
      title: String(title || 'Notification').trim(),
      message: String(message || '').trim(),
      type: type || 'GENERAL',
      billId: billId || null,
      billName: billName || '',
      deduplicationKey: deduplicationKey || null,
      isRead: false
    });
    return await notification.save();
  } catch (err) {
    if (err.code === 11000 && deduplicationKey) {
      return Notification.findOne({ user: userId, deduplicationKey });
    }
    console.error('Failed to create notification:', err.message);
    throw err;
  }
}

module.exports = { createNotification };
