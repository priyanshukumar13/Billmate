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

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

// ===============================
// 1. SIGNUP ROUTE
// ===============================
router.post('/signup', async (req, res) => {
    const { username, full_name, email, password } = req.body || {};

    const trimmedUsername = (username || '').trim();
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedFullName = (full_name || '').trim() || trimmedUsername;

    if (!trimmedUsername || !trimmedEmail || !password) {
        return res.status(400).json({ msg: 'Please provide username, email, and password.' });
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
        return res.status(400).json({ msg: 'Please enter a valid email address.' });
    }

    if (String(password).length < 6) {
        return res.status(400).json({ msg: 'Password must be at least 6 characters.' });
    }

    try {
        // Check if user already exists with this email or username
        let existingUser = await User.findOne({
            $or: [
                { email: trimmedEmail },
                { username: trimmedUsername }
            ]
        });

        if (existingUser) {
            if (existingUser.email === trimmedEmail) {
                return res.status(409).json({ msg: 'An account with this email already exists.' });
            }
            return res.status(409).json({ msg: 'This username is already taken.' });
        }

        // Create new user instance
        const user = new User({
            username: trimmedUsername,
            full_name: trimmedFullName,
            email: trimmedEmail,
            password
        });

        // Hash the password before saving
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        // Create Token so they are logged in immediately after signup
        const payload = { user: { id: user.id } };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        return res.status(201).json({ 
            token, 
            user: { 
                id: user.id, 
                username: user.username, 
                full_name: user.full_name,
                email: user.email,
                profile_picture: user.profile_picture || ''
            } 
        });

    } catch (err) {
        console.error('Signup Error:', err);
        return res.status(500).json({ msg: 'Server error during signup. Please try again later.' });
    }
});

// ===============================
// 2. LOGIN ROUTE
// ===============================
router.post('/login', async (req, res) => {
    const { username, email, usernameOrEmail, password } = req.body || {};
    const identifier = (username || email || usernameOrEmail || '').trim();

    if (!identifier || !password) {
        return res.status(400).json({ msg: 'Please provide both username/email and password.' });
    }

    try {
        const lowerIdentifier = identifier.toLowerCase();
        const user = await User.findOne({
            $or: [
                { email: lowerIdentifier },
                { email: identifier },
                { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }
            ]
        });

        if (!user) {
            return res.status(401).json({ msg: 'Invalid email or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ msg: 'Invalid email or password.' });
        }

        const payload = { user: { id: user.id } };

        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '7d' },
            (err, token) => {
                if (err) {
                    console.error('JWT Sign error:', err);
                    return res.status(500).json({ msg: 'Authentication error' });
                }
                res.json({ 
                    token, 
                    user: { 
                        id: user.id, 
                        username: user.username, 
                        full_name: user.full_name,
                        email: user.email,
                        profile_picture: user.profile_picture || ''
                    } 
                });
            }
        );

    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ msg: 'Server error during login. Please try again.' });
    }
});

// ===============================
// 2.5 FORGOT PASSWORD (OTP)
// ===============================
router.post('/forgot-password', async (req, res) => {
    const { usernameOrEmail } = req.body || {};

    if (!usernameOrEmail || !String(usernameOrEmail).trim()) {
        return res.status(400).json({ msg: 'Please enter your username or email.' });
    }

    try {
        const trimmed = String(usernameOrEmail).trim();
        const lowerTrimmed = trimmed.toLowerCase();

        const user = await User.findOne({
            $or: [{ email: lowerTrimmed }, { email: trimmed }, { username: trimmed }]
        });

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
        return res.status(500).json({ msg: 'Server error sending password reset email' });
    }
});

// ===============================
// 2.6 RESET PASSWORD (OTP)
// ===============================
router.post('/reset-password', async (req, res) => {
    const { usernameOrEmail, email, otp, newPassword } = req.body || {};

    const identifier = (email || usernameOrEmail || '').trim();
    if (!identifier || !otp || !newPassword) {
        return res.status(400).json({ msg: 'Please provide identifier, OTP, and new password.' });
    }

    if (String(newPassword).length < 6) {
        return res.status(400).json({ msg: 'New password must be at least 6 characters.' });
    }

    try {
        const lowerIdentifier = identifier.toLowerCase();
        const user = await User.findOne({
            $or: [{ email: lowerIdentifier }, { email: identifier }, { username: identifier }]
        });

        if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpires) {
            return res.status(400).json({ msg: 'OTP is not valid or has expired.' });
        }

        if (user.passwordResetOtpExpires < new Date()) {
            return res.status(400).json({ msg: 'OTP has expired. Please request a new one.' });
        }

        if (user.passwordResetOtpHash !== hashOtp(otp)) {
            return res.status(400).json({ msg: 'Invalid OTP entered.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.passwordResetOtpHash = null;
        user.passwordResetOtpExpires = null;
        await user.save();

        return res.status(200).json({ msg: 'Password reset successfully. You can now log in.' });
    } catch (err) {
        console.error('Reset password error:', err.message);
        return res.status(500).json({ msg: 'Server error resetting password' });
    }
});

// ===============================
// 3. GET USER DATA (For Dashboard)
// ===============================
const auth = require('../middleware/auth');
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json(user);
    } catch (err) {
        console.error('/me error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;