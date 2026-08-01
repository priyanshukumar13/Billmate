const Report = require('../models/Report');
const Bill = require('../models/Bill');
const geminiService = require('../services/geminiService');

async function generateMonthlyReport(req, res) {
  try {
    const userId = req.user.id;
    const { month } = req.body; // expected: YYYY-MM

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ msg: 'Valid month (YYYY-MM) is required.' });
    }

    // Fetch bills falling in this month
    const startOfMonth = new Date(`${month}-01T00:00:00.000Z`);
    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59, 999);

    const bills = await Bill.find({
      userId,
      date: { $gte: startOfMonth, $lte: endOfMonth }
    });

    if (bills.length === 0) {
      return res.status(200).json({
        empty: true,
        month,
        msg: 'No bills found for the selected month.'
      });
    }

    // Aggregations
    const totalBills = bills.length;
    let totalExpenses = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let highestExpense = { name: 'N/A', amount: 0 };

    const categoryTotals = { Rent: 0, Food: 0, Bills: 0, Other: 0 };
    const upcomingBills = [];

    const now = new Date();

    bills.forEach(b => {
      const amt = Number(b.amount || 0);
      totalExpenses += amt;

      if (b.status === 'Paid') {
        paidAmount += amt;
        paidCount++;
      } else {
        pendingAmount += amt;
        pendingCount++;
        if (new Date(b.date) > now) {
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

    // Subscriptions/Recurring estimate (simple filter by common names or recurring categories)
    const subscriptions = bills.filter(b => 
      /sub|netflix|spotify|youtube|prime|gym|internet|broadband/i.test(b.name) || 
      b.name.toLowerCase().includes('recurring')
    ).map(b => ({ name: b.name, amount: Number(b.amount || 0) }));

    // Financial Health Score calculation (Paid vs Pending, Budget limit if any)
    const budgetLimit = 25000; // default local budget
    const ratio = totalExpenses > 0 ? (paidAmount / totalExpenses) : 1;
    let score = Math.round(ratio * 100);
    if (totalExpenses > budgetLimit) {
      score = Math.max(0, score - Math.round(((totalExpenses - budgetLimit) / budgetLimit) * 20));
    }

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

    // 3. Generate AI Insights via Gemini
    const insights = await geminiService.generateReportInsights(reportData);
    reportData.insights = insights;

    // 4. Save report in DB (overwrite existing report for the month if exists)
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
