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

// --- 1. GET: Fetch ONLY the logged-in user's bills (supports ?type=bill|expense) ---
router.get('/', auth, async (req, res) => {
  try {
    const filter = { user: req.user.id };
    if (req.query.type && ['bill', 'expense'].includes(req.query.type)) {
      filter.type = req.query.type;
    }
    const bills = await Bill.find(filter).sort({ date: 1, createdAt: -1 });
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

// --- 2. POST: Create a bill or expense linked to the user ---
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      amount,
      date,
      category,
      notes,
      type,
      paymentMethod,
      sourceApp,
      transactionFingerprint,
      transactionDate,
    } = req.body || {};

    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return res.status(400).json({
        success: false,
        error: 'Name is required.',
        message: 'Name is required.',
        msg: 'Name is required.'
      });
    }
    if (trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Name cannot exceed 100 characters.',
        message: 'Name cannot exceed 100 characters.',
        msg: 'Name cannot exceed 100 characters.'
      });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than ₹0.',
        message: 'Amount must be greater than ₹0.',
        msg: 'Amount must be greater than ₹0.'
      });
    }

    const trimmedDate = String(date || '').trim();
    if (!trimmedDate || isNaN(new Date(trimmedDate).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid date.',
        message: 'Please provide a valid date.',
        msg: 'Please provide a valid date.'
      });
    }

    const validCategories = [
      'Rent', 'Food', 'Bills', 'Utilities', 'Subscription', 'Insurance',
      'Shopping', 'Travel', 'Entertainment', 'Health', 'Other'
    ];
    const assignedCategory = validCategories.includes(category) ? category : 'Bills';

    const isExpense = type === 'expense';

    // Duplicate detection for transactions with a fingerprint
    if (transactionFingerprint && typeof transactionFingerprint === 'string' && transactionFingerprint.trim()) {
      const existing = await Bill.findOne({
        user: req.user.id,
        transactionFingerprint: transactionFingerprint.trim()
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'This transaction has already been recorded as an expense.',
          message: 'This transaction has already been recorded as an expense.',
          duplicate: true,
          expense: existing
        });
      }
    }

    const newBill = new Bill({
      user: req.user.id,
      name: trimmedName,
      amount: numAmount,
      date: trimmedDate.split('T')[0],
      category: assignedCategory,
      notes: String(notes || '').trim().slice(0, 500),
      type: isExpense ? 'expense' : 'bill',
      status: isExpense ? 'Paid' : (req.body.status || 'Unpaid'),
      paidDate: isExpense ? (trimmedDate ? new Date(trimmedDate) : new Date()) : (req.body.status === 'Paid' ? new Date() : null),
      paymentMethod: String(paymentMethod || (isExpense ? 'Other' : 'Other')).trim(),
      sourceApp: sourceApp ? String(sourceApp).trim() : (isExpense ? 'Manual' : null),
      transactionFingerprint: transactionFingerprint ? String(transactionFingerprint).trim() : null,
      transactionDate: transactionDate ? new Date(transactionDate) : (isExpense ? new Date(trimmedDate) : null)
    });

    await newBill.save();

    try {
      if (isExpense) {
        await createNotification({
          userId: req.user.id,
          title: 'Expense Recorded',
          message: `Expense recorded: ${newBill.name} — ₹${Number(newBill.amount).toLocaleString('en-IN')}${newBill.paymentMethod ? ' via ' + newBill.paymentMethod : ''}.`,
          type: 'BILL_PAID',
          billId: newBill._id,
          billName: newBill.name
        });
      } else {
        await createNotification({
          userId: req.user.id,
          title: 'New Bill Added',
          message: `New bill added: ${newBill.name} — ₹${Number(newBill.amount).toLocaleString('en-IN')}.`,
          type: 'BILL_CREATED',
          billId: newBill._id,
          billName: newBill.name
        });
      }
    } catch (notifErr) {
      console.warn('Failed to record notification:', notifErr.message);
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

    const { name, amount, date, category, status, notes, paymentMethod, sourceApp, type } = req.body || {};

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          error: 'Name cannot be empty.',
          message: 'Name cannot be empty.',
          msg: 'Name cannot be empty.'
        });
      }
      if (trimmedName.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Name cannot exceed 100 characters.',
          message: 'Name cannot exceed 100 characters.',
          msg: 'Name cannot exceed 100 characters.'
        });
      }
      bill.name = trimmedName;
    }

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Amount must be greater than ₹0.',
          message: 'Amount must be greater than ₹0.',
          msg: 'Amount must be greater than ₹0.'
        });
      }
      bill.amount = numAmount;
    }

    if (date !== undefined) {
      const trimmedDate = String(date).trim();
      if (!trimmedDate || isNaN(new Date(trimmedDate).getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid date.',
          message: 'Please provide a valid date.',
          msg: 'Please provide a valid date.'
        });
      }
      bill.date = trimmedDate.split('T')[0];
    }

    if (category !== undefined) {
      const validCategories = [
        'Rent', 'Food', 'Bills', 'Utilities', 'Subscription', 'Insurance',
        'Shopping', 'Travel', 'Entertainment', 'Health', 'Other'
      ];
      bill.category = validCategories.includes(category) ? category : bill.category;
    }

    if (notes !== undefined) {
      bill.notes = String(notes).trim().slice(0, 500);
    }

    if (paymentMethod !== undefined) {
      bill.paymentMethod = String(paymentMethod).trim();
    }

    if (sourceApp !== undefined) {
      bill.sourceApp = String(sourceApp).trim();
    }

    if (type !== undefined && ['bill', 'expense'].includes(type)) {
      bill.type = type;
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