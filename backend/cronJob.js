const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Bill = require('./models/Bill');
const User = require('./models/User');
require('dotenv').config();

// 1. Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper function to send email (to the user's email when available)
const sendEmailAlert = async (toEmail, billName, dueDate, alertLabel) => {
    const mailOptions = {
        from: `"BillMate Reminders" <${process.env.EMAIL_USER}>`,
        to: toEmail || process.env.EMAIL_USER,
        subject: `⚠️ [${alertLabel}] Bill Reminder: ${billName}`,
        text: `Hello,\n\nThis is an automated reminder from BillMate.\n\n${alertLabel}: Your bill "${billName}" is due on ${dueDate}.\n\nPlease log in to your dashboard to pay it.\n\nRegards,\nBillMate Team`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent successfully for: ${billName} (${alertLabel}) to ${mailOptions.to}`);
    } catch (error) {
        console.error(`❌ Failed to send email for ${billName}:`, error.message);
    }
};

const checkBills = async () => {
    console.log("⏰ Running Daily Bill Check...");

    try {
        const now = new Date();
        // Get today and 3 days from now in YYYY-MM-DD format
        const today = now;
        const todayStr = today.toISOString().split('T')[0];

        const threeDaysDate = new Date();
        threeDaysDate.setDate(today.getDate() + 3);
        const threeDaysStr = threeDaysDate.toISOString().split('T')[0];

        console.log(`🔍 Checking bills due between [${todayStr}] and [${threeDaysStr}]`);

        // Find Unpaid bills due in this range and populate user email
        const dueBills = await Bill.find({
            date: { $gte: todayStr, $lte: threeDaysStr },
            status: { $regex: /^unpaid$/i }
        }).populate('user', 'email username');

        if (dueBills.length > 0) {
            console.log(`📢 Found ${dueBills.length} bills due!`);
            
            for (const bill of dueBills) {
                try {
                    console.log(`✅ Processing Bill: ${bill.name} (due ${bill.date})`);

                    // Parse the bill's due date (assumes YYYY-MM-DD)
                    const due = new Date(bill.date + 'T00:00:00');

                    // Build scheduled times (local): 3 days before at 09:00, day-before at 09:00 and 18:00
                    const threeDaysAt9 = new Date(due);
                    threeDaysAt9.setDate(due.getDate() - 3);
                    threeDaysAt9.setHours(9,0,0,0);

                    const dayBeforeAt9 = new Date(due);
                    dayBeforeAt9.setDate(due.getDate() - 1);
                    dayBeforeAt9.setHours(9,0,0,0);

                    const dayBeforeAt18 = new Date(due);
                    dayBeforeAt18.setDate(due.getDate() - 1);
                    dayBeforeAt18.setHours(18,0,0,0);

                    // Helper: consider a match if the target time is within one minute of now
                    const isNow = (target) => Math.abs(now - target) < 60 * 1000;

                    // Send 3-days-before reminder
                    if (!bill.reminders?.threeDays && isNow(threeDaysAt9)) {
                        const to = bill.user?.email || process.env.EMAIL_USER;
                        await sendEmailAlert(to, bill.name, bill.date, '3 days before');
                        bill.reminders = bill.reminders || {};
                        bill.reminders.threeDays = true;
                        await bill.save();
                    }

                    // Send day-before morning reminder
                    if (!bill.reminders?.dayBeforeMorning && isNow(dayBeforeAt9)) {
                        const to = bill.user?.email || process.env.EMAIL_USER;
                        await sendEmailAlert(to, bill.name, bill.date, 'Day-before (Morning)');
                        bill.reminders = bill.reminders || {};
                        bill.reminders.dayBeforeMorning = true;
                        await bill.save();
                    }

                    // Send day-before evening reminder
                    if (!bill.reminders?.dayBeforeEvening && isNow(dayBeforeAt18)) {
                        const to = bill.user?.email || process.env.EMAIL_USER;
                        await sendEmailAlert(to, bill.name, bill.date, 'Day-before (Evening)');
                        bill.reminders = bill.reminders || {};
                        bill.reminders.dayBeforeEvening = true;
                        await bill.save();
                    }

                } catch (billErr) {
                    console.error(`❌ Error processing bill ${bill._id}:`, billErr.message);
                }
            }
        } else {
            console.log("No bills due in the checked window.");
        }

    } catch (error) {
        console.error("❌ Error during bill check:", error);
    }
};

const startCronJob = () => {
    // Runs every minute for testing
    cron.schedule('* * * * *', () => {
        checkBills();
    });
    
    // Run once immediately when server starts
    checkBills(); 
};

module.exports = startCronJob;