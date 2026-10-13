const Notification = require('../models/Notification');

/**
 * Creates an in-app notification for a user.
 */
async function createNotification({ userId, title, message, type, billId, billName }) {
  if (!userId) return null;
  try {
    const notification = new Notification({
      user: userId,
      title: String(title || 'Notification').trim(),
      message: String(message || '').trim(),
      type: type || 'GENERAL',
      billId: billId || null,
      billName: billName || '',
      isRead: false
    });
    return await notification.save();
  } catch (err) {
    console.error('Failed to create notification:', err.message);
    return null;
  }
}

module.exports = { createNotification };
