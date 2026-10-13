const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

// GET /api/notifications - Fetch user's notifications
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      isRead: false
    });

    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (err) {
    console.error('Fetch notifications error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications.',
      message: 'Failed to fetch notifications.'
    });
  }
});

// PUT /api/notifications/read-all - Mark all as read
router.put('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Mark all read error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read.',
      message: 'Failed to mark notifications as read.'
    });
  }
});

// PUT /api/notifications/:id/read - Mark single notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    notification.isRead = true;
    await notification.save();

    res.json({ success: true, notification });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    }
    console.error('Mark read error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification.',
      message: 'Failed to update notification.'
    });
  }
});

// DELETE /api/notifications/:id - Delete single notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Notification removed.' });
  } catch (err) {
    console.error('Delete notification error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
});

// DELETE /api/notifications - Clear all read notifications
router.delete('/', auth, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user.id, isRead: true });
    res.json({ success: true, message: 'Read notifications cleared.' });
  } catch (err) {
    console.error('Clear read notifications error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to clear read notifications.' });
  }
});

module.exports = router;
