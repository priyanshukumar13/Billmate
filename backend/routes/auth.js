const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../models/User'); 

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function generateOtp() {
  // 6-digit OTP
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

// ===============================
// 1. SIGNUP ROUTE (The missing part!)
// ===============================
router.post('/signup', async (req, res) => {
    // Note: Use 'username' if your frontend sends 'username' or 'fullName'
    const { username, email, password } = req.body;

    try {
        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        // Create new user instance
        user = new User({
            username, // This captures "Full Name" from your form
            email,
            password
        });

        // Hash the password before saving
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        // Create Token so they are logged in immediately after signup
        const payload = { user: { id: user.id } };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) throw err;
                res.status(201).json({ 
                    token, 
                    user: { 
                        id: user.id, 
                        username: user.username, 
                        email: user.email 
                    } 
                });
            }
        );

    } catch (err) {
        console.error("Signup Error:", err.message);
        res.status(500).send('Server Error');
    }
});

// ===============================
// 2. LOGIN ROUTE
// ===============================
router.post('/login', async (req, res) => {
    // Frontend sends username + password (and we also support email for flexibility)
    const { username, email, password } = req.body;

    try {
        const user = await User.findOne(email ? { email } : { username });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const payload = { user: { id: user.id } };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '1h' },
            (err, token) => {
                if (err) throw err;
                res.json({ 
                    token, 
                    user: { 
                        id: user.id, 
                        username: user.username, 
                        email: user.email 
                    } 
                });
            }
        );

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// ===============================
// 2.5 FORGOT PASSWORD (OTP)
// ===============================
router.post('/forgot-password', async (req, res) => {
    const { usernameOrEmail } = req.body;

    if (!usernameOrEmail) {
        return res.status(400).json({ msg: 'usernameOrEmail is required' });
    }

    try {
        const user = await User.findOne({
            $or: [{ email: usernameOrEmail }, { username: usernameOrEmail }]
        });

        // Avoid user enumeration: respond success either way.
        if (!user) {
            return res.status(200).json({ msg: 'If an account exists, an OTP has been sent.' });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return res.status(500).json({ msg: 'Email not configured on server' });
        }

        const otp = generateOtp();
        user.passwordResetOtpHash = hashOtp(otp);
        user.passwordResetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();

        await transporter.sendMail({
            from: `"BillMate" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'BillMate password reset OTP',
            text: `Your BillMate OTP is: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you didn't request it, you can ignore this email.`
        });

        return res.status(200).json({ msg: 'OTP sent successfully', email: user.email });
    } catch (err) {
        console.error('Forgot password error:', err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// ===============================
// 2.6 RESET PASSWORD (OTP)
// ===============================
router.post('/reset-password', async (req, res) => {
    const { usernameOrEmail, email, otp, newPassword } = req.body;

    const identifier = email || usernameOrEmail;
    if (!identifier || !otp || !newPassword) {
        return res.status(400).json({ msg: 'identifier, otp, and newPassword are required' });
    }

    try {
        const user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }]
        });

        if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpires) {
            return res.status(400).json({ msg: 'OTP is not valid or has expired' });
        }

        if (user.passwordResetOtpExpires < new Date()) {
            return res.status(400).json({ msg: 'OTP expired' });
        }

        if (user.passwordResetOtpHash !== hashOtp(otp)) {
            return res.status(400).json({ msg: 'Invalid OTP' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.passwordResetOtpHash = null;
        user.passwordResetOtpExpires = null;
        await user.save();

        return res.status(200).json({ msg: 'Password reset successful' });
    } catch (err) {
        console.error('Reset password error:', err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// ===============================
// 3. VERIFY TOKEN MIDDLEWARE
// ===============================
const verifyToken = (req, res, next) => {
    const tokenHeader = req.header('Authorization');
    if (!tokenHeader) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const token = tokenHeader.split(" ")[1];
        if (!token) return res.status(401).json({ msg: 'Token format error' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (e) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// ===============================
// 4. GET USER DATA (For Dashboard)
// ===============================
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;