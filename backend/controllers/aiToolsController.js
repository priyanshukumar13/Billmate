const crypto = require('crypto');
const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const User = require('../models/User');
const Reminder = require('../models/Reminder');
const Automation = require('../models/Automation');
const PendingAction = require('../models/PendingAction');
const AutomationHistory = require('../models/AutomationHistory');
const { createNotification } = require('../utils/notificationHelper');

const CATEGORIES = ['Rent', 'Food', 'Bills', 'Utilities', 'Subscription', 'Insurance', 'Shopping', 'Travel', 'Entertainment', 'Health', 'Other'];
const ACTION_TTL_MS = 15 * 60 * 1000;

function validDate(value) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value);
}

function validDateOnly(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && validDate(`${value}T00:00:00.000Z`) !== null
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function validAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0.01 && amount <= 1000000000;
}

function getCurrentMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function getWeekRange(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

function isUnpaidStatus(status) {
  return ['unpaid', 'upcoming', 'due soon', 'overdue'].includes(String(status || '').toLowerCase());
}

function calculatedBillStatus(bill, now = new Date()) {
  if (bill.status === 'Paid') return 'paid';
  const due = validDate(String(bill.date || '').includes('T') ? bill.date : `${bill.date}T00:00:00`);
  if (!due) return 'unpaid';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay < today) return 'overdue';
  if (dueDay <= new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)) return 'upcoming';
  return 'unpaid';
}

function validateIdempotencyKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(value);
}

function sanitizeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength) : '';
}

function describeAction(operation, payload) {
  switch (operation) {
    case 'add_expense':
      return `Record expense "${payload.name}" for ₹${payload.amount}.`;
    case 'create_bill':
      return `Create bill "${payload.name}" for ₹${payload.amount}, due ${payload.date}.`;
    case 'create_reminder':
      return `Create reminder "${payload.title}" for ${payload.scheduledAt}.`;
    case 'create_automation':
      return `Create ${payload.type.replaceAll('_', ' ')} automation "${payload.name}".`;
    case 'mark_bill_paid':
      return `Mark bill "${payload.billName}" as paid.`;
    default:
      return 'Confirm this financial action.';
  }
}

function confirmationHash(actionId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required for action confirmation.');
  return crypto.createHmac('sha256', secret).update(`billmate-ai-action:${actionId}`).digest('hex');
}

async function prepareAction(req, res, operation, payload) {
  const idempotencyKey = req.get('Idempotency-Key') || req.body?.idempotencyKey;
  if (!validateIdempotencyKey(idempotencyKey)) {
    return res.status(400).json({ success: false, error: 'A valid Idempotency-Key (8-128 characters) is required.' });
  }

  const existing = await PendingAction.findOne({
    userId: req.user.id,
    operation,
    idempotencyKey
  });
  if (existing) {
    return res.status(202).json({
      success: true,
      status: existing.status,
      confirmationToken: existing.status === 'pending' ? confirmationHash(existing._id) : undefined,
      preview: existing.preview,
      expiresAt: existing.expiresAt,
      duplicate: true
    });
  }

  const actionId = new mongoose.Types.ObjectId();
  const action = await PendingAction.create({
    _id: actionId,
    userId: req.user.id,
    operation,
    payload,
    preview: describeAction(operation, payload),
    idempotencyKey,
    confirmationHash: confirmationHash(actionId),
    expiresAt: new Date(Date.now() + ACTION_TTL_MS)
  });

  return res.status(202).json({
    success: true,
    status: 'confirmation_required',
    confirmationToken: action.confirmationHash,
    preview: action.preview,
    expiresAt: action.expiresAt
  });
}

function mapBill(bill, now = new Date()) {
  return {
    id: String(bill._id),
    name: bill.name,
    amount: bill.amount,
    category: bill.category,
    dueDate: bill.date,
    status: calculatedBillStatus(bill, now),
    paymentStatus: bill.status,
    paidDate: bill.paidDate || null
  };
}

async function getBills(req, res) {
  const filter = { user: req.user.id, type: 'bill' };
  const now = new Date();
  const bills = await Bill.find(filter).sort({ date: 1, createdAt: -1 }).lean();
  const status = String(req.query.status || '').toLowerCase();
  if (!['', 'upcoming', 'overdue', 'paid', 'unpaid'].includes(status)) {
    return res.status(400).json({ success: false, error: 'status must be upcoming, overdue, paid, or unpaid.' });
  }
  const data = bills.map((bill) => mapBill(bill, now)).filter((bill) => {
    if (!status) return true;
    if (status === 'paid') return bill.status === 'paid';
    if (status === 'unpaid') return isUnpaidStatus(bill.paymentStatus) && bill.status !== 'overdue';
    return bill.status === status;
  });
  return res.json({ success: true, bills: data });
}

async function getExpenses(req, res) {
  const filter = { user: req.user.id, type: 'expense' };
  const { start, end } = req.query.period === 'weekly'
    ? getWeekRange()
    : req.query.period === 'monthly'
      ? getCurrentMonthRange()
      : { start: null, end: null };
  if (req.query.period && !['weekly', 'monthly'].includes(req.query.period)) {
    return res.status(400).json({ success: false, error: 'period must be weekly or monthly.' });
  }

  const startDate = req.query.startDate || (start ? start.toISOString().slice(0, 10) : null);
  const endDate = req.query.endDate || (end ? new Date(end.getTime() - 1).toISOString().slice(0, 10) : null);
  if ((startDate && !validDateOnly(startDate)) || (endDate && !validDateOnly(endDate))) {
    return res.status(400).json({ success: false, error: 'startDate and endDate must use YYYY-MM-DD.' });
  }
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = startDate;
    if (endDate) filter.date.$lte = endDate;
  }
  if (req.query.category) {
    if (!CATEGORIES.includes(req.query.category)) {
      return res.status(400).json({ success: false, error: 'Unsupported expense category.' });
    }
    filter.category = req.query.category;
  }
  const expenses = await Bill.find(filter).sort({ date: -1, createdAt: -1 }).limit(500).lean();
  return res.json({
    success: true,
    expenses: expenses.map((item) => ({
      id: String(item._id),
      amount: item.amount,
      description: item.name,
      category: item.category,
      date: item.date
    }))
  });
}

async function getBudget(req, res) {
  const user = await User.findById(req.user.id).select('monthlyBudget').lean();
  if (!user || !Number.isFinite(Number(user.monthlyBudget)) || Number(user.monthlyBudget) <= 0) {
    return res.status(409).json({ success: false, error: 'Set a monthly budget in BillMate before using the budget tool.' });
  }
  const { start, end } = getCurrentMonthRange();
  const monthPrefix = start.toISOString().slice(0, 7);
  const spentItems = await Bill.find({
    user: req.user.id,
    date: { $regex: `^${monthPrefix}` },
    $or: [{ type: 'expense' }, { status: 'Paid' }]
  }).select('amount').lean();
  const totalSpending = spentItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const budget = Number(user.monthlyBudget);
  return res.json({
    success: true,
    month: monthPrefix,
    budget,
    totalSpending,
    remaining: budget - totalSpending,
    utilizationPercent: Math.round((totalSpending / budget) * 10000) / 100,
    thresholds: { warningPercent: 80, exceededPercent: 100 },
    period: { start: start.toISOString(), end: end.toISOString() }
  });
}

function validateFinancialPayload(operation, body) {
  if (operation === 'add_expense' || operation === 'create_bill') {
    const name = sanitizeText(operation === 'add_expense' ? body.description : body.name, 100);
    if (!name || !validAmount(body.amount) || !validDateOnly(body.date)) return null;
    if (body.category && !CATEGORIES.includes(body.category)) return null;
    return { name, amount: Number(body.amount), date: body.date, category: body.category || 'Other', notes: sanitizeText(body.notes, 500) };
  }

  if (operation === 'create_reminder') {
    const title = sanitizeText(body.title, 120);
    const scheduledAt = validDate(body.scheduledAt);
    if (!title || !scheduledAt || scheduledAt <= new Date()) return null;
    if (body.billId && !mongoose.isValidObjectId(body.billId)) return null;
    return {
      title,
      description: sanitizeText(body.description, 500),
      scheduledAt,
      timezone: sanitizeText(body.timezone || 'Asia/Kolkata', 64),
      billId: body.billId || null
    };
  }

  if (operation === 'create_automation') {
    const name = sanitizeText(body.name, 120);
    const type = body.type;
    const schedule = body.schedule || {};
    if (!name || !['budget_threshold', 'recurring_reminder', 'weekly_report'].includes(type)) return null;
    const frequency = schedule.frequency || (type === 'weekly_report' ? 'weekly' : '');
    if (!['daily', 'weekly', 'monthly'].includes(frequency)) return null;
    const intervalDays = Number(schedule.intervalDays || (frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 30));
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) return null;
    const nextRunAt = validDate(body.nextRunAt);
    if (!nextRunAt || nextRunAt <= new Date()) return null;
    const thresholdPercent = Number(body.config?.thresholdPercent ?? 80);
    if (type === 'budget_threshold' && (!Number.isFinite(thresholdPercent) || thresholdPercent < 1 || thresholdPercent > 100)) return null;
    return {
      name,
      description: sanitizeText(body.description, 500),
      type,
      config: {
        thresholdPercent: type === 'budget_threshold' ? thresholdPercent : undefined,
        title: sanitizeText(body.config?.title || name, 120),
        billId: body.config?.billId || null
      },
      trigger: { type, thresholdPercent: type === 'budget_threshold' ? thresholdPercent : undefined },
      schedule: { frequency, intervalDays, timezone: sanitizeText(schedule.timezone || 'Asia/Kolkata', 64) },
      nextRunAt
    };
  }

  if (operation === 'mark_bill_paid') {
    if (!mongoose.isValidObjectId(body.billId)) return null;
    return { billId: body.billId };
  }
  return null;
}

async function proposeOperation(req, res, operation) {
  const payload = validateFinancialPayload(operation, req.body || {});
  if (!payload) return res.status(400).json({ success: false, error: 'The request contains invalid or missing fields.' });

  if (operation === 'mark_bill_paid') {
    const bill = await Bill.findOne({ _id: payload.billId, user: req.user.id, type: 'bill' }).select('name status');
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found.' });
    if (bill.status === 'Paid') return res.status(409).json({ success: false, error: 'Bill is already marked paid.' });
    payload.billName = bill.name;
  }
  if (operation === 'create_reminder' && payload.billId) {
    const bill = await Bill.findOne({ _id: payload.billId, user: req.user.id, type: 'bill' }).select('_id');
    if (!bill) return res.status(404).json({ success: false, error: 'Bill not found.' });
  }

  return prepareAction(req, res, operation, payload);
}

async function getConfirmationToken(req, res) {
  const token = req.params.token;
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ success: false, error: 'Invalid confirmation token.' });
  const action = await PendingAction.findOne({
    userId: req.user.id,
    confirmationHash: token,
    status: { $in: ['pending', 'confirmed'] },
    expiresAt: { $gt: new Date() }
  });
  if (!action) return res.status(404).json({ success: false, error: 'This action is unavailable or has expired.' });
  return { action };
}

async function executeAction(action) {
  const { userId, operation, payload } = action;
  if (operation === 'add_expense' || operation === 'create_bill') {
    const isExpense = operation === 'add_expense';
    const bill = await Bill.findOneAndUpdate(
      { aiActionId: action._id },
      {
        $setOnInsert: {
          user: userId,
          name: payload.name,
          amount: payload.amount,
          date: payload.date,
          category: payload.category,
          notes: payload.notes,
          type: isExpense ? 'expense' : 'bill',
          status: isExpense ? 'Paid' : 'Unpaid',
          paidDate: isExpense ? new Date(payload.date) : null,
          transactionFingerprint: `ai:${action._id}`,
          aiActionId: action._id
        }
      },
      { new: true, upsert: true, runValidators: true }
    );
    await createNotification({
      userId,
      title: isExpense ? 'Expense Recorded' : 'New Bill Added',
      message: isExpense ? `Expense recorded: ${bill.name} — ₹${bill.amount}.` : `New bill added: ${bill.name} — ₹${bill.amount}.`,
      type: isExpense ? 'BILL_PAID' : 'BILL_CREATED',
      billId: bill._id,
      billName: bill.name,
      deduplicationKey: `ai-action:${action._id}`
    });
    return { id: String(bill._id), name: bill.name, amount: bill.amount };
  }
  if (operation === 'create_reminder') {
    const reminder = await Reminder.findOneAndUpdate(
      { userId, idempotencyKey: `ai-action:${action._id}` },
      {
        $setOnInsert: {
          userId,
          billId: payload.billId,
          title: payload.title,
          description: payload.description,
          scheduledAt: payload.scheduledAt,
          timezone: payload.timezone,
          idempotencyKey: `ai-action:${action._id}`
        }
      },
      { new: true, upsert: true, runValidators: true }
    );
    return { id: String(reminder._id), scheduledAt: reminder.scheduledAt };
  }
  if (operation === 'create_automation') {
    const automation = await Automation.findOneAndUpdate(
      { userId, idempotencyKey: `ai-action:${action._id}` },
      {
        $setOnInsert: {
          userId,
          ...payload,
          enabled: true,
          idempotencyKey: `ai-action:${action._id}`
        }
      },
      { new: true, upsert: true, runValidators: true }
    );
    return { id: String(automation._id), name: automation.name, nextRunAt: automation.nextRunAt };
  }
  if (operation === 'mark_bill_paid') {
    const bill = await Bill.findOneAndUpdate(
      { _id: payload.billId, user: userId, type: 'bill', status: { $ne: 'Paid' } },
      { $set: { status: 'Paid', paidDate: new Date() } },
      { new: true }
    );
    if (!bill) {
      const alreadyPaid = await Bill.exists({ _id: payload.billId, user: userId, status: 'Paid' });
      if (alreadyPaid) return { id: String(payload.billId), status: 'Paid', alreadyPaid: true };
      throw new Error('Bill not found or no longer available.');
    }
    await createNotification({
      userId,
      title: 'Payment Recorded',
      message: `Payment recorded: ${bill.name} — ₹${bill.amount}.`,
      type: 'BILL_PAID',
      billId: bill._id,
      billName: bill.name,
      deduplicationKey: `ai-action:${action._id}`
    });
    return { id: String(bill._id), status: bill.status, paidDate: bill.paidDate };
  }
  throw new Error('Unsupported action.');
}

async function confirmAction(req, res) {
  const found = await getConfirmationToken(req, res);
  if (!found?.action) return;
  const action = await PendingAction.findOneAndUpdate(
    {
      _id: found.action._id,
      userId: req.user.id,
      status: { $in: ['pending', 'confirmed'] },
      expiresAt: { $gt: new Date() }
    },
    { $set: { status: 'confirmed' } },
    { new: true }
  );
  if (!action) return res.status(409).json({ success: false, error: 'This action has already been confirmed or cancelled.' });

  try {
    const result = await executeAction(action);
    action.status = 'completed';
    action.resultId = result.id && mongoose.isValidObjectId(result.id) ? result.id : null;
    await action.save();
    return res.json({ success: true, status: 'completed', result });
  } catch (error) {
    action.status = 'failed';
    await action.save();
    console.error('AI action execution failed:', error.message);
    return res.status(500).json({ success: false, error: 'The confirmed action could not be completed.' });
  }
}

async function cancelAction(req, res) {
  const found = await getConfirmationToken(req, res);
  if (!found?.action) return;
  found.action.status = 'cancelled';
  await found.action.save();
  return res.json({ success: true, status: 'cancelled' });
}

async function getAutomations(req, res) {
  const [automations, history] = await Promise.all([
    Automation.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100).lean(),
    AutomationHistory.find({ userId: req.user.id }).sort({ executedAt: -1 }).limit(50).lean()
  ]);
  return res.json({ success: true, automations, history });
}

async function setAutomationEnabled(req, res) {
  if (!mongoose.isValidObjectId(req.params.id) || typeof req.body?.enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Valid automation id and enabled boolean are required.' });
  }
  const automation = await Automation.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { $set: { enabled: req.body.enabled } },
    { new: true }
  );
  if (!automation) return res.status(404).json({ success: false, error: 'Automation not found.' });
  return res.json({ success: true, automation });
}

module.exports = {
  getBills,
  getExpenses,
  getBudget,
  addExpense: (req, res) => proposeOperation(req, res, 'add_expense'),
  createBill: (req, res) => proposeOperation(req, res, 'create_bill'),
  createReminder: (req, res) => proposeOperation(req, res, 'create_reminder'),
  createAutomation: (req, res) => proposeOperation(req, res, 'create_automation'),
  markBillPaid: (req, res) => proposeOperation(req, res, 'mark_bill_paid'),
  confirmAction,
  cancelAction,
  getAutomations,
  setAutomationEnabled,
  helpers: {
    calculatedBillStatus,
    getCurrentMonthRange,
    getWeekRange,
    validDateOnly,
    validAmount,
    validateIdempotencyKey,
    validateFinancialPayload
  }
};
