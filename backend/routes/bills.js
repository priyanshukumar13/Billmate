const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Bill = require('../models/Bill');
const { createNotification } = require('../utils/notificationHelper');

// Helper to compute effective bill status
function getCalculatedStatus(bill) {
  if (bill.status === 'Paid') return 'Paid';
  if (!bill.date) return 'Unpaid';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00'));
  dueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Due Soon';
  if (diffDays <= 3) return 'Due Soon';
  return 'Upcoming';
}

// --- 1. GET: Fetch ONLY the logged-in user's bills ---
router.get('/', auth, async (req, res) => {
  try {
    const bills = await Bill.find({ user: req.user.id }).sort({ date: 1, createdAt: -1 });
    res.json(bills);
  } catch (err) {
    console.error('Fetch bills error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bills. Please try again.',
      message: 'Failed to fetch bills. Please try again.',
      msg: 'Failed to fetch bills. Please try again.'
    });
  }
});

// --- 1b. GET /:id - Fetch a single bill owned by the user ---
router.get('/:id', auth, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found.',
        message: 'Bill not found.',
        msg: 'Bill not found.'
      });
    }
    if (bill.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'User not authorized to view this bill.',
        message: 'User not authorized to view this bill.',
        msg: 'User not authorized to view this bill.'
      });
    }
    res.json(bill);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid bill ID format.',
        message: 'Invalid bill ID format.',
        msg: 'Invalid bill ID format.'
      });
    }
    console.error('Fetch single bill error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill.',
      message: 'Failed to fetch bill.',
      msg: 'Failed to fetch bill.'
    });
  }
});

// --- 2. POST: Create a bill linked to the user ---
router.post('/', auth, async (req, res) => {
  try {
    const { name, amount, date, category, notes } = req.body || {};

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({
        success: false,
        error: 'Bill name is required.',
        message: 'Bill name is required.',
        msg: 'Bill name is required.'
      });
    }
    if (trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Bill name cannot exceed 100 characters.',
        message: 'Bill name cannot exceed 100 characters.',
        msg: 'Bill name cannot exceed 100 characters.'
      });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Bill amount must be greater than ₹0.',
        message: 'Bill amount must be greater than ₹0.',
        msg: 'Bill amount must be greater than ₹0.'
      });
    }

    const trimmedDate = String(date || '').trim();
    if (!trimmedDate || isNaN(new Date(trimmedDate).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid due date.',
        message: 'Please provide a valid due date.',
        msg: 'Please provide a valid due date.'
      });
    }

    const validCategories = ['Rent', 'Food', 'Bills', 'Utilities', 'Subscription', 'Insurance', 'Other'];
    const assignedCategory = validCategories.includes(category) ? category : 'Bills';

    const newBill = new Bill({
      user: req.user.id,
      name: trimmedName,
      amount: numAmount,
      date: trimmedDate.split('T')[0],
      category: assignedCategory,
      notes: String(notes || '').trim().slice(0, 500),
      status: 'Unpaid'
    });

    await newBill.save();

    try {
      await createNotification({
        userId: req.user.id,
        title: 'New Bill Added',
        message: `New bill added: ${newBill.name} — ₹${Number(newBill.amount).toLocaleString('en-IN')}.`,
        type: 'BILL_CREATED',
        billId: newBill._id,
        billName: newBill.name
      });
    } catch (notifErr) {
      console.warn('Failed to record bill-created notification:', notifErr.message);
    }

    res.status(201).json(newBill);
  } catch (err) {
    console.error('Create bill error:', err.message);
    const msg = err.errors 
      ? Object.values(err.errors).map(e => e.message).join(', ') 
      : (err.message || 'Error creating bill.');
    res.status(400).json({
      success: false,
      error: msg,
      message: msg,
      msg: msg
    });
  }
});

// --- 3. PUT: Update bill or toggle status ---
router.put('/:id', auth, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found.',
        message: 'Bill not found.',
        msg: 'Bill not found.'
      });
    }

    // Security Check: Ensure this bill belongs to the logged-in user
    if (bill.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'User not authorized to modify this bill.',
        message: 'User not authorized to modify this bill.',
        msg: 'User not authorized to modify this bill.'
      });
    }

    const { name, amount, date, category, status, notes } = req.body || {};

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          error: 'Bill name cannot be empty.',
          message: 'Bill name cannot be empty.',
          msg: 'Bill name cannot be empty.'
        });
      }
      if (trimmedName.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Bill name cannot exceed 100 characters.',
          message: 'Bill name cannot exceed 100 characters.',
          msg: 'Bill name cannot exceed 100 characters.'
        });
      }
      bill.name = trimmedName;
    }

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Bill amount must be greater than ₹0.',
          message: 'Bill amount must be greater than ₹0.',
          msg: 'Bill amount must be greater than ₹0.'
        });
      }
      bill.amount = numAmount;
    }

    if (date !== undefined) {
      const trimmedDate = String(date).trim();
      if (!trimmedDate || isNaN(new Date(trimmedDate).getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid due date.',
          message: 'Please provide a valid due date.',
          msg: 'Please provide a valid due date.'
        });
      }
      bill.date = trimmedDate.split('T')[0];
    }

    if (category !== undefined) {
      const validCategories = ['Rent', 'Food', 'Bills', 'Utilities', 'Subscription', 'Insurance', 'Other'];
      bill.category = validCategories.includes(category) ? category : bill.category;
    }

    if (notes !== undefined) {
      bill.notes = String(notes).trim().slice(0, 500);
    }

    const wasPaid = bill.status === 'Paid';

    if (status !== undefined) {
      const validStatuses = ['Unpaid', 'Paid', 'Upcoming', 'Due Soon', 'Overdue'];
      if (validStatuses.includes(status)) {
        bill.status = status;
        bill.paidDate = status === 'Paid' ? (bill.paidDate || new Date()) : null;
      }
    } else if (name === undefined && amount === undefined && date === undefined && category === undefined) {
      // Simple toggle status if empty body
      if (bill.status === 'Paid') {
        bill.status = 'Unpaid';
        bill.paidDate = null;
      } else {
        bill.status = 'Paid';
        bill.paidDate = new Date();
      }
    }

    const isNowPaid = bill.status === 'Paid';
    await bill.save();

    if (!wasPaid && isNowPaid) {
      try {
        await createNotification({
          userId: req.user.id,
          title: 'Payment Recorded',
          message: `Payment recorded: ${bill.name} — ₹${Number(bill.amount).toLocaleString('en-IN')}.`,
          type: 'BILL_PAID',
          billId: bill._id,
          billName: bill.name
        });
      } catch (notifErr) {
        console.warn('Failed to record bill-paid notification:', notifErr.message);
      }
    }

    res.json(bill);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid bill ID format.',
        message: 'Invalid bill ID format.',
        msg: 'Invalid bill ID format.'
      });
    }
    console.error('Update bill error:', err.message);
    const msg = err.errors 
      ? Object.values(err.errors).map(e => e.message).join(', ') 
      : (err.message || 'Error updating bill.');
    res.status(400).json({
      success: false,
      error: msg,
      message: msg,
      msg: msg
    });
  }
});

// --- 4. DELETE: Remove a bill ---
router.delete('/:id', auth, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found.',
        message: 'Bill not found.',
        msg: 'Bill not found.'
      });
    }

    // Security Check: Ensure this bill belongs to the logged-in user
    if (bill.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'User not authorized to delete this bill.',
        message: 'User not authorized to delete this bill.',
        msg: 'User not authorized to delete this bill.'
      });
    }

    await bill.deleteOne();
    res.json({ success: true, message: 'Bill removed successfully.' });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid bill ID format.',
        message: 'Invalid bill ID format.',
        msg: 'Invalid bill ID format.'
      });
    }
    console.error('Delete bill error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Error deleting bill.',
      message: 'Error deleting bill.',
      msg: 'Error deleting bill.'
    });
  }
});

module.exports = router;