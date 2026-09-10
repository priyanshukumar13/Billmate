const Report = require('../models/Report');
const Bill = require('../models/Bill');
const geminiService = require('../services/geminiService');

async function generateMonthlyReport(req, res) {
  try {
    const userId = req.user.id;
    const { month } = req.body || {}; // expected: YYYY-MM

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ msg: 'Valid month (YYYY-MM) is required.' });
    }

    // Fetch bills belonging to this user for the specified month
    // Supports both 'YYYY-MM-DD' strings and ISO date strings
    const bills = await Bill.find({
      user: userId,
      date: { $regex: `^${month}` }
    });

    if (!bills || bills.length === 0) {
      return res.status(200).json({
        empty: true,
        month,
        msg: `No bills found for ${month}.`
      });
    }

    // Aggregations
    const totalBills = bills.length;
    let totalExpenses = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let highestExpense = { name: 'N/A', amount: 0, category: 'Other', date: '' };

    const categoryTotals = { Rent: 0, Food: 0, Bills: 0, Utilities: 0, Subscription: 0, Insurance: 0, Other: 0 };
    const upcomingBills = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    bills.forEach(b => {
      const amt = Number(b.amount || 0);
      totalExpenses += amt;

      const statusLower = (b.status || '').toLowerCase();

      if (statusLower === 'paid') {
        paidAmount += amt;
        paidCount++;
      } else {
        pendingAmount += amt;
        pendingCount++;
        const dueDate = new Date(b.date + (b.date.includes('T') ? '' : 'T00:00:00'));
        if (!isNaN(dueDate.getTime()) && dueDate >= now) {
          upcomingBills.push({ name: b.name, amount: amt, date: b.date });
        }
      }

      const cat = b.category || 'Other';
      if (categoryTotals[cat] !== undefined) {
        categoryTotals[cat] += amt;
      } else {
        categoryTotals['Other'] += amt;
      }

      if (amt > highestExpense.amount) {
        highestExpense = { name: b.name, amount: amt, category: cat, date: b.date };
      }
    });

    // Filter subscription / recurring items
    const subscriptions = bills.filter(b => 
      b.category === 'Subscription' ||
      /sub|netflix|spotify|youtube|prime|gym|internet|broadband|wifi|apple|disney/i.test(b.name) || 
      b.name.toLowerCase().includes('recurring')
    ).map(b => ({ name: b.name, amount: Number(b.amount || 0) }));

    // Financial Health Score calculation
    const ratio = totalExpenses > 0 ? (paidAmount / totalExpenses) : 1;
    let score = Math.round(ratio * 100);

    const reportData = {
      month,
      totalExpenses,
      totalBills,
      paidBills: paidCount,
      pendingBills: pendingCount,
      paidAmount,
      pendingAmount,
      highestExpense,
      categoryBreakdown: categoryTotals,
      subscriptions,
      financialHealthScore: score,
      upcomingBills
    };

    // Generate AI Insights via Gemini
    try {
      const insights = await geminiService.generateReportInsights(reportData);
      reportData.insights = insights;
    } catch (aiErr) {
      console.warn('AI Insights fallback:', aiErr.message);
      reportData.insights = [
        `You paid ₹${paidAmount} out of ₹${totalExpenses} total bills for ${month}.`,
        pendingAmount > 0 ? `You have ₹${pendingAmount} remaining in pending bills.` : "All bills for this month have been settled! 🎉"
      ];
    }

    // Save report in DB
    let reportDoc = await Report.findOne({ userId, month });
    if (reportDoc) {
      reportDoc.data = reportData;
      await reportDoc.save();
    } else {
      reportDoc = new Report({ userId, month, data: reportData });
      await reportDoc.save();
    }

    return res.json(reportData);
  } catch (err) {
    console.error('Report controller error:', err);
    return res.status(500).json({ msg: 'Internal server error generating report.' });
  }
}

async function getSavedReports(req, res) {
  try {
    const userId = req.user.id;
    const reports = await Report.find({ userId }).sort({ month: -1 });
    return res.json(reports);
  } catch (err) {
    console.error('Get reports error:', err);
    return res.status(500).json({ msg: 'Internal server error fetching reports.' });
  }
}

module.exports = {
  generateMonthlyReport,
  getSavedReports
};
