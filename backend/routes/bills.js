const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Bill = require('../models/Bill');

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
    console.error('Fetch bills error:', err);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

// --- 1b. GET /:id - Fetch a single bill owned by the user ---
router.get('/:id', auth, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    if (bill.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'User not authorized to view this bill' });
    }
    res.json(bill);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid bill ID' });
    }
    console.error('Fetch single bill error:', err);
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

// --- 2. POST: Create a bill linked to the user ---
router.post('/', auth, async (req, res) => {
  try {
    const { name, amount, date, category, notes } = req.body;

    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Bill name is required.' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Bill amount must be greater than ₹0.' });
    }

    const trimmedDate = (date || '').trim();
    if (!trimmedDate || isNaN(new Date(trimmedDate).getTime())) {
      return res.status(400).json({ error: 'Please provide a valid due date.' });
    }

    const validCategories = ['Rent', 'Food', 'Bills', 'Utilities', 'Subscription', 'Insurance', 'Other'];
    const assignedCategory = validCategories.includes(category) ? category : 'Bills';

    const newBill = new Bill({
      user: req.user.id,
      name: trimmedName,
      amount: numAmount,
      date: trimmedDate.split('T')[0],
      category: assignedCategory,
      notes: (notes || '').trim(),
      status: 'Unpaid'
    });

    await newBill.save();
    res.status(201).json(newBill);
  } catch (err) {
    console.error('Create bill error:', err);
    res.status(400).json({ error: err.message || 'Error creating bill.' });
  }
});

// --- 3. PUT: Update bill or toggle status ---
router.put('/:id', auth, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    // Security Check: Ensure this bill belongs to the logged-in user
    if (bill.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'User not authorized to modify this bill' });
    }

    const { name, amount, date, category, status, notes } = req.body || {};

    // If explicit update payload provided
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) return res.status(400).json({ error: 'Bill name cannot be empty.' });
      bill.name = trimmedName;
    }

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'Bill amount must be greater than ₹0.' });
      }
      bill.amount = numAmount;
    }

    if (date !== undefined) {
      const trimmedDate = String(date).trim();
      if (!trimmedDate || isNaN(new Date(trimmedDate).getTime())) {
        return res.status(400).json({ error: 'Please provide a valid due date.' });
      }
      bill.date = trimmedDate.split('T')[0];
    }

    if (category !== undefined) {
      bill.category = category;
    }

    if (notes !== undefined) {
      bill.notes = String(notes).trim();
    }

    if (status !== undefined) {
      bill.status = status;
      bill.paidDate = status === 'Paid' ? new Date() : null;
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

    await bill.save();
    res.json(bill);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid bill ID' });
    }
    console.error('Update bill error:', err);
    res.status(500).json({ error: err.message || 'Error updating bill.' });
  }
});

// --- 4. DELETE: Remove a bill ---
router.delete('/:id', auth, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    // Security Check: Ensure this bill belongs to the logged-in user
    if (bill.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'User not authorized to delete this bill' });
    }

    await bill.deleteOne();
    res.json({ message: 'Bill removed successfully' });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid bill ID' });
    }
    console.error('Delete bill error:', err);
    res.status(500).json({ error: err.message || 'Error deleting bill.' });
  }
});

module.exports = router;