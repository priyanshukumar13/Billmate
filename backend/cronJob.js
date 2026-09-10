const cron = require('node-cron');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const Bill = require('./models/Bill');
const User = require('./models/User');
require('dotenv').config();

// Create Nodemailer Transporter
function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

// Send formatted reminder email
const sendEmailAlert = async (toEmail, userName, billName, amount, dueDateStr, stageLabel, daysRemaining) => {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`⚠️ Cannot send email reminder for "${billName}": EMAIL_USER or EMAIL_PASS not configured.`);
    return false;
  }

  let statusDescription = '';
  if (daysRemaining > 1) {
    statusDescription = `Days remaining: ${daysRemaining}\nPlease make your payment before the due date.`;
  } else if (daysRemaining === 1) {
    statusDescription = `Days remaining: 1 (Due tomorrow)\nPlease make your payment soon.`;
  } else if (daysRemaining === 0) {
    statusDescription = `⚠️ This bill is due TODAY!\nPlease make your payment today to avoid late fees.`;
  } else {
    statusDescription = `🚨 This bill is OVERDUE by ${Math.abs(daysRemaining)} day(s).\nPlease make your payment immediately.`;
  }

  const subject = `BillMate Reminder: ${billName} ${daysRemaining < 0 ? 'is Overdue' : daysRemaining === 0 ? 'Due Today' : 'Due Soon'}`;
  const text = `Hello ${userName || 'Valued User'},\n\nYour ${billName} of ₹${amount} is due on ${dueDateStr}.\n\n${statusDescription}\n\nLog in to your dashboard to manage your bills:\nBillMate Team`;

  const mailOptions = {
    from: `"BillMate Reminders" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    text
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Reminder email successfully sent to ${toEmail} for bill: "${billName}" [${stageLabel}]`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email for bill "${billName}":`, error.message);
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

        const targetEmail = user?.email || process.env.EMAIL_USER;
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
        }

      } catch (billErr) {
        console.error(`❌ [Scheduler] Error processing bill ${bill._id}:`, billErr.message);
      }
    }
  } catch (error) {
    console.error('❌ [Scheduler] Error during bill check:', error.message);
  }
};

const startCronJob = () => {
  // Check once an hour for scheduled reminders
  cron.schedule('0 * * * *', () => {
    checkBills();
  });

  // Run once immediately on startup
  checkBills();
};

module.exports = startCronJob;