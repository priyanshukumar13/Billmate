const cron = require('node-cron');
const mongoose = require('mongoose');
const emailService = require('./utils/emailService');
const Bill = require('./models/Bill');
const User = require('./models/User');
const Reminder = require('./models/Reminder');
const Automation = require('./models/Automation');
const AutomationHistory = require('./models/AutomationHistory');
const SchedulerLock = require('./models/SchedulerLock');
const { createNotification } = require('./utils/notificationHelper');
require('dotenv').config();
const { randomUUID } = require('crypto');

// Send formatted reminder email
const sendEmailAlert = async (toEmail, userName, billName, amount, dueDateStr, stageLabel, daysRemaining) => {
  const emailConfig = emailService.getEmailConfigurationStatus();
  if (!emailConfig.configured && process.env.MOCK_EMAIL !== 'true') {
    console.warn(`Cannot send reminder for "${billName}": missing ${emailConfig.missing.join(', ')}`);
    return false;
  }

  try {
    await emailService.sendBillReminder({
      to: toEmail,
      userName,
      billName,
      amount,
      dueDate: dueDateStr,
      stageLabel,
      daysRemaining,
    });
    console.log(`Reminder request accepted by Resend for ${toEmail}; bill="${billName}" stage="${stageLabel}"`);
    return true;
  } catch (error) {
    console.error(`Failed to send reminder for bill "${billName}": ${emailService.getSafeEmailDeliveryError(error)}`);
    return false;
  }
};

// Main check function
const checkBills = async () => {
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️ [Scheduler] DB is not connected. Skipping bill check.');
    return;
  }
  console.log('⏰ [Scheduler] Running Bill Check & Reminder Evaluation...');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all unpaid bills populated with user notification preferences
    const unpaidBills = await Bill.find({
      status: { $regex: /^(unpaid|upcoming|due soon|overdue)$/i }
    }).populate('user', 'email username full_name email_notifications reminder_days_before');

    if (!unpaidBills || unpaidBills.length === 0) {
      console.log('ℹ️ [Scheduler] No unpaid bills found.');
      return;
    }

    console.log(`🔍 [Scheduler] Evaluating ${unpaidBills.length} unpaid bill(s)...`);

    for (const bill of unpaidBills) {
      try {
        if (!bill.date) continue;

        // Parse due date
        const due = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00'));
        due.setHours(0, 0, 0, 0);

        if (isNaN(due.getTime())) continue;

        // Difference in days (positive = in future, 0 = today, negative = overdue)
        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        const user = bill.user;
        // If user disabled email notifications, skip email sending
        if (user && user.email_notifications === false) {
          continue;
        }

        const targetEmail = user?.email;
        if (!targetEmail) continue;

        const displayName = user?.full_name || user?.username || 'User';

        bill.reminders = bill.reminders || {};
        let reminderSent = false;

        // Stage 1: 7 days before
        if (diffDays === 7 && !bill.reminders.sevenDays) {
          const ok = await sendEmailAlert(targetEmail, displayName, bill.name, bill.amount, bill.date, '7 Days Before', 7);
          if (ok) {
            bill.reminders.sevenDays = true;
            reminderSent = true;
          }
        }

        // Stage 2: 3 days before
        if (diffDays === 3 && !bill.reminders.threeDays) {
          const ok = await sendEmailAlert(targetEmail, displayName, bill.name, bill.amount, bill.date, '3 Days Before', 3);
          if (ok) {
            bill.reminders.threeDays = true;
            reminderSent = true;
          }
        }

        // Stage 3: 1 day before (tomorrow)
        if (diffDays === 1 && !bill.reminders.oneDay) {
          const ok = await sendEmailAlert(targetEmail, displayName, bill.name, bill.amount, bill.date, '1 Day Before', 1);
          if (ok) {
            bill.reminders.oneDay = true;
            bill.reminders.dayBeforeMorning = true;
            reminderSent = true;
          }
        }

        // Stage 4: Due today
        if (diffDays === 0 && !bill.reminders.dueToday) {
          const ok = await sendEmailAlert(targetEmail, displayName, bill.name, bill.amount, bill.date, 'Due Today', 0);
          if (ok) {
            bill.reminders.dueToday = true;
            reminderSent = true;
          }
        }

        // Stage 5: Overdue (send once when diffDays <= -1)
        if (diffDays < 0 && !bill.reminders.overdue) {
          const ok = await sendEmailAlert(targetEmail, displayName, bill.name, bill.amount, bill.date, 'Overdue Alert', diffDays);
          if (ok) {
            bill.reminders.overdue = true;
            reminderSent = true;
          }
        }

        if (reminderSent) {
          await bill.save();
          try {
            const { createNotification } = require('./utils/notificationHelper');
            const userId = (bill.user && bill.user._id) ? bill.user._id : bill.user;
            if (userId) {
              await createNotification({
                userId,
                title: 'Reminder Email Sent',
                message: `Reminder email sent for ${bill.name}.`,
                type: 'REMINDER_EMAIL',
                billId: bill._id,
                billName: bill.name
              });
            }
          } catch (notifErr) {
            console.warn('Failed to record cron reminder notification:', notifErr.message);
          }
        }

      } catch (billErr) {
        console.error(`❌ [Scheduler] Error processing bill ${bill._id}:`, billErr.message);
      }
    }
  } catch (error) {
    console.error('❌ [Scheduler] Error during bill check:', error.message);
  }
};

async function withSchedulerLock(name, task) {
  const now = new Date();
  const ownerToken = randomUUID();
  let lock;
  try {
    lock = await SchedulerLock.findOneAndUpdate(
      {
        _id: name,
        $or: [{ leaseExpiresAt: { $lte: now } }, { leaseExpiresAt: { $exists: false } }]
      },
      { $set: { leaseExpiresAt: new Date(now.getTime() + 30 * 60 * 1000), ownerToken } },
      { new: true, upsert: true }
    );
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
  if (!lock || lock.ownerToken !== ownerToken) return false;

  try {
    await task();
    return true;
  } finally {
    await SchedulerLock.updateOne(
      { _id: name, ownerToken },
      { $set: { leaseExpiresAt: new Date(0), ownerToken: null } }
    );
  }
}

function retryAt(attempt) {
  const delayMinutes = Math.min(60 * 6, 2 ** Math.min(attempt, 8));
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

async function processDueReminders() {
  while (true) {
    const now = new Date();
    const reminder = await Reminder.findOneAndUpdate(
      {
        scheduledAt: { $lte: now },
        $or: [
          { status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: now } },
          { status: 'processing', lockExpiresAt: { $lte: now } }
        ]
      },
      {
        $set: { status: 'processing', lockExpiresAt: new Date(now.getTime() + 5 * 60 * 1000) },
        $inc: { attempts: 1 }
      },
      { new: true, sort: { scheduledAt: 1 } }
    );
    if (!reminder) return;

    try {
      const user = await User.findById(reminder.userId).select('email full_name username email_notifications');
      if (!user) throw new Error('Reminder owner no longer exists.');
      await createNotification({
        userId: reminder.userId,
        title: reminder.title,
        message: reminder.description || reminder.title,
        type: 'GENERAL',
        billId: reminder.billId,
        deduplicationKey: `reminder:${reminder._id}`
      });

      if (user.email_notifications && user.email) {
        const status = emailService.getEmailConfigurationStatus();
        if (status.configured) {
          await emailService.sendEmail({
            to: user.email,
            subject: `BillMate Reminder: ${reminder.title}`,
            text: `${reminder.title}\n\n${reminder.description || 'Your scheduled BillMate reminder is due.'}`
          });
        } else {
          console.warn(`Email reminder ${reminder._id} delivered in-app; missing ${status.missing.join(', ')}.`);
        }
      }

      reminder.status = 'sent';
      reminder.notifiedAt = new Date();
      reminder.lockExpiresAt = null;
      reminder.lastError = '';
      await reminder.save();
    } catch (error) {
      reminder.status = 'failed';
      reminder.nextAttemptAt = retryAt(reminder.attempts);
      reminder.lockExpiresAt = null;
      reminder.lastError = String(error.message || 'Reminder delivery failed.').slice(0, 300);
      await reminder.save();
      console.error(`Reminder delivery failed (${reminder._id}):`, error.message);
    }
  }
}

function nextAutomationRun(automation, from = new Date()) {
  const days = Number(automation.schedule?.intervalDays || 7);
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

async function executeAutomation(automation) {
  const executionKey = `${automation._id}:${automation.nextRunAt.toISOString()}`;
  let result = { executed: true };

  if (automation.type === 'budget_threshold') {
    const user = await User.findById(automation.userId).select('monthlyBudget');
    const budget = Number(user?.monthlyBudget || 0);
    if (budget <= 0) throw new Error('A monthly budget has not been configured.');
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const items = await Bill.find({
      user: automation.userId,
      date: { $regex: `^${monthPrefix}` },
      $or: [{ type: 'expense' }, { status: 'Paid' }]
    }).select('amount').lean();
    const spent = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const thresholdPercent = Number(automation.config?.thresholdPercent || 80);
    const triggered = spent >= budget * thresholdPercent / 100;
    result = { triggered, spent, budget, thresholdPercent };
    if (triggered) {
      await createNotification({
        userId: automation.userId,
        title: 'Budget threshold reached',
        message: `Spending is ₹${spent.toLocaleString('en-IN')} of your ₹${budget.toLocaleString('en-IN')} monthly budget (${thresholdPercent}% threshold).`,
        type: 'GENERAL',
        deduplicationKey: `automation:${executionKey}`
      });
    }
  } else if (automation.type === 'weekly_report') {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const items = await Bill.find({
      user: automation.userId,
      date: { $gte: start.toISOString().slice(0, 10), $lte: end.toISOString().slice(0, 10) },
      $or: [{ type: 'expense' }, { status: 'Paid' }]
    }).select('amount').lean();
    const spent = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    result = { period: '7 days', totalSpending: spent, transactions: items.length };
    await createNotification({
      userId: automation.userId,
      title: 'Your weekly financial report',
      message: `You recorded ${items.length} paid transaction(s) totaling ₹${spent.toLocaleString('en-IN')} in the last 7 days.`,
      type: 'GENERAL',
      deduplicationKey: `automation:${executionKey}`
    });
  } else if (automation.type === 'recurring_reminder') {
    await createNotification({
      userId: automation.userId,
      title: automation.config?.title || automation.name,
      message: automation.description || automation.name,
      type: 'GENERAL',
      deduplicationKey: `automation:${executionKey}`
    });
    result = { reminderSent: true };
  }

  await AutomationHistory.updateOne(
    { executionKey },
    {
      $setOnInsert: {
        userId: automation.userId,
        automationId: automation._id,
        action: automation.type,
        executionStatus: 'success',
        result,
        error: '',
        executedAt: new Date()
      }
    },
    { upsert: true }
  );
}

async function processDueAutomations() {
  while (true) {
    const now = new Date();
    const automation = await Automation.findOneAndUpdate(
      {
        enabled: true,
        nextRunAt: { $lte: now },
        $or: [{ lockExpiresAt: { $lte: now } }, { lockExpiresAt: null }]
      },
      { $set: { lockExpiresAt: new Date(now.getTime() + 5 * 60 * 1000) } },
      { new: true, sort: { nextRunAt: 1 } }
    );
    if (!automation) return;

    const previousRun = new Date(automation.nextRunAt);
    try {
      await executeAutomation(automation);
      automation.lastRunAt = new Date();
      automation.lastStatus = 'success';
      automation.nextRunAt = nextAutomationRun(automation, previousRun);
      automation.attempts = 0;
    } catch (error) {
      automation.lastRunAt = new Date();
      automation.lastStatus = 'failed';
      automation.attempts += 1;
      automation.nextRunAt = retryAt(automation.attempts);
      await AutomationHistory.updateOne(
        { executionKey: `${automation._id}:${previousRun.toISOString()}` },
        {
          $setOnInsert: {
            userId: automation.userId,
            automationId: automation._id,
            action: automation.type,
            executionStatus: 'failed',
            error: String(error.message || 'Automation failed.').slice(0, 300),
            executedAt: new Date()
          }
        },
        { upsert: true }
      );
      console.error(`Automation execution failed (${automation._id}):`, error.message);
    } finally {
      automation.lockExpiresAt = null;
      await automation.save();
    }
  }
}

async function processPersistentSchedules() {
  if (mongoose.connection.readyState !== 1) return;
  await processDueReminders();
  await processDueAutomations();
}

const startCronJob = () => {
  // Check once an hour for scheduled reminders
  cron.schedule('0 * * * *', () => {
    withSchedulerLock('bill-reminders', checkBills).catch((error) => {
      console.error('Bill reminder scheduler lock failed:', error.message);
    });
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('* * * * *', () => {
    withSchedulerLock('persistent-ai-schedules', processPersistentSchedules).catch((error) => {
      console.error('Persistent scheduler lock failed:', error.message);
    });
  }, { timezone: 'Asia/Kolkata' });

  withSchedulerLock('bill-reminders', checkBills).catch((error) => {
    console.error('Initial bill reminder check failed:', error.message);
  });
  withSchedulerLock('persistent-ai-schedules', processPersistentSchedules).catch((error) => {
    console.error('Initial persistent scheduler run failed:', error.message);
  });
};

module.exports = startCronJob;