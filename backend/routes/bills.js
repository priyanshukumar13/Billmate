const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Bill = require('../models/Bill');

// --- MIDDLEWARE: Identify User via Token ---
const verifyToken = (req, res, next) => {
    const tokenHeader = req.header('Authorization');
    if (!tokenHeader) return res.status(401).json({ msg: 'Unauthorized' });

    try {
        const token = tokenHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user; // contains user id
        next();
    } catch (e) {
        res.status(401).json({ msg: 'Token invalid' });
    }
};

// --- 1. GET: Fetch ONLY the logged-in user's bills ---
router.get('/', verifyToken, async (req, res) => {
    try {
        const bills = await Bill.find({ user: req.user.id });
        res.json(bills);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 2. POST: Create a bill linked to the user ---
router.post('/', verifyToken, async (req, res) => {
    try {
        const { name, amount, date, category } = req.body;
        const newBill = new Bill({
            user: req.user.id, 
            name,
            amount,
            date,
            category,
            status: "Unpaid"
        });
        await newBill.save();
        res.status(201).json(newBill);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- 3. PUT: Toggle Paid/Unpaid status ---
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) return res.status(404).json({ msg: "Bill not found" });

        // Security Check: Ensure this bill belongs to the logged-in user
        if (bill.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: "User not authorized" });
        }

        // Toggle status
        bill.status = bill.status === "Paid" ? "Unpaid" : "Paid";
        await bill.save();
        res.json(bill);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. DELETE: Remove a bill ---
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id);
        if (!bill) return res.status(404).json({ msg: "Bill not found" });

        // Security Check: Ensure this bill belongs to the logged-in user
        if (bill.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: "User not authorized" });
        }

        await bill.deleteOne();
        res.json({ msg: "Bill removed" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;