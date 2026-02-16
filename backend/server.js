const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer'); // 👈 ADDED THIS

const authRoutes = require('./routes/auth');
const billRoutes = require('./routes/bills');
const startCronJob = require('./cronJob'); 

dotenv.config();
const app = express();

app.use(cors({
  origin: 'https://billmatex.netlify.app', 
  credentials: true,               
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json()); 

// ===============================
// 📧 EMAIL SETUP (Nodemailer)
// ===============================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Your Gmail
        pass: process.env.EMAIL_PASS  // Your App Password
    }
});

// Route for immediate alerts from Dashboard
app.post('/api/bills/send-immediate-alert', async (req, res) => {
    const { email, alerts } = req.body;
    
    const mailOptions = {
        from: `"BillMate Alerts" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '⚠️ BillMate: Important Bill Reminders',
        text: `Hello, you have the following reminders:\n\n${alerts.join('\n')}\n\nLog in to pay them now!`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: "Alert email sent!" });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).send("Error sending email");
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/bills', billRoutes);

// ===============================
// 3. DATABASE & SERVER START
// ===============================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/billmate';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    try {
        startCronJob();
        console.log('✅ Daily Email Scheduler Running');
    } catch (error) {
        console.error('⚠️ Cron Job Error:', error.message);
    }
  })
  .catch(err => console.log('❌ DB Connection Error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});