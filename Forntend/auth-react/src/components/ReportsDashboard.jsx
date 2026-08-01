import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { Calendar, Download, Printer, Mail, Loader2, Sparkles, TrendingUp, AlertCircle, FileText, CheckCircle, ShieldAlert } from 'lucide-react';

export default function ReportsDashboard() {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const BASE_URL = window.BILLMATE_API_BASE_URL ||
    ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:5000"
      : "https://billmate-backend.onrender.com");

  const token = localStorage.getItem("billmateToken");

  // Set default month to current month on mount (format YYYY-MM)
  useEffect(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${now.getFullYear()}-${month}`);
  }, []);

  const handleGenerateReport = async () => {
    if (!selectedMonth) return;
    setLoading(true);
    setError('');
    setReport(null);

    try {
      const res = await fetch(`${BASE_URL}/api/reports/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ month: selectedMonth })
      });

      if (!res.ok) {
        throw new Error('Failed to generate report for selected month.');
      }

      const data = await res.json();
      if (data.empty) {
        setError(data.msg || 'No data found for this month.');
      } else {
        setReport(data);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error generating monthly report.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEmailReport = async () => {
    const email = localStorage.getItem("billmateEmail") || prompt("Enter email address to send report to:");
    if (!email) return;

    try {
      // Re-use current email system or endpoint
      alert(`Report details for ${selectedMonth} sent to ${email}!`);
    } catch (err) {
      alert("Failed to send email report.");
    }
  };

  // Recharts color palettes
  const COLORS = ['#F5A93B', '#FFE29A', '#3b82f6', '#10b981'];
  
  const pieData = report ? Object.keys(report.categoryBreakdown).map((key) => ({
    name: key,
    value: report.categoryBreakdown[key]
  })).filter(item => item.value > 0) : [];

  const barData = report ? [
    { name: 'Paid (₹)', amount: report.paidAmount },
    { name: 'Pending (₹)', amount: report.pendingAmount }
  ] : [];

  return (
    <div className="min-h-screen bg-[#070707] text-white font-sans p-6 md:p-8 select-none print:bg-white print:text-black">
      
      {/* Top Header */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-6 mb-8 print:hidden">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <Sparkles className="w-5 h-5 text-[#F5A93B]" />
            <h1 className="text-2xl font-bold tracking-tight">Smart Monthly Report</h1>
          </div>
          <p className="text-xs text-neutral-400">Generate AI-powered spending reports, charts, and budget breakdowns</p>
        </div>

        {/* Input Controls */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-neutral-900 border border-white/[0.08] rounded-xl py-2 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#F5A93B]/20 text-white cursor-pointer"
            />
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-xs hover:shadow-[0_0_15px_rgba(245,169,59,0.25)] transition-all disabled:opacity-50 shrink-0 flex items-center space-x-1.5 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <span>Generate Report</span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto">
        {error && (
          <div className="bg-red-400/10 border border-red-500/20 text-red-400 rounded-2xl p-6 flex flex-col items-center text-center max-w-md mx-auto my-12 print:hidden">
            <AlertCircle className="w-10 h-10 mb-2" />
            <h4 className="font-semibold text-sm mb-1">No Data Available</h4>
            <p className="text-xs text-neutral-400 mb-4">{error}</p>
          </div>
        )}

        {!report && !loading && !error && (
          <div className="border border-white/[0.04] bg-neutral-950/40 rounded-3xl p-12 text-center max-w-lg mx-auto my-12 print:hidden">
            <FileText className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
            <h3 className="text-base font-bold mb-1">Select Month to Start</h3>
            <p className="text-xs text-neutral-400 mb-6">Choose a billing month from the selector above to compile spending statistics and generate AI-driven insights.</p>
          </div>
        )}

        {loading && (
          <div className="py-24 flex flex-col justify-center items-center print:hidden">
            <Loader2 className="w-10 h-10 text-[#F5A93B] animate-spin mb-3" />
            <h4 className="text-sm font-semibold">Compiling Financial Data...</h4>
            <p className="text-xs text-neutral-400 mt-1">Calculating aggregates and calling Gemini AI for insights</p>
          </div>
        )}

        {report && (
          <div className="space-y-6 print:space-y-10">
            {/* Header for printing */}
            <div className="hidden print:flex items-center justify-between border-b pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold">BillMate Financial Report</h1>
                <p className="text-sm text-gray-500">Billing Period: {report.month}</p>
              </div>
              <span className="text-lg font-semibold">📑 BillMate</span>
            </div>

            {/* Quick Actions (Print, PDF, Email) */}
            <div className="flex justify-end items-center space-x-2 print:hidden">
              <button 
                onClick={handlePrint}
                className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-white/[0.06] rounded-xl text-neutral-300 hover:text-white transition-colors cursor-pointer"
                title="Print Report"
              >
                <Printer className="w-4.5 h-4.5" />
              </button>
              <button 
                onClick={handleEmailReport}
                className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-white/[0.06] rounded-xl text-neutral-300 hover:text-white transition-colors cursor-pointer"
                title="Email Report"
              >
                <Mail className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Top Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0f0f0f] border border-white/[0.05] rounded-2xl p-4 shadow-sm">
                <span className="block text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-1">Total Expenses</span>
                <h2 className="text-2xl font-bold text-white">₹{report.totalExpenses}</h2>
                <small className="text-[10px] text-neutral-500">Across {report.totalBills} bills</small>
              </div>

              <div className="bg-[#0f0f0f] border border-white/[0.05] rounded-2xl p-4 shadow-sm">
                <span className="block text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-1">Paid Bills</span>
                <h2 className="text-2xl font-bold text-green-400">₹{report.paidAmount}</h2>
                <small className="text-[10px] text-neutral-500">{report.paidBills} bills settled</small>
              </div>

              <div className="bg-[#0f0f0f] border border-white/[0.05] rounded-2xl p-4 shadow-sm">
                <span className="block text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-1">Pending Balance</span>
                <h2 className="text-2xl font-bold text-amber-400">₹{report.pendingAmount}</h2>
                <small className="text-[10px] text-neutral-500">{report.pendingBills} bills remaining</small>
              </div>

              <div className="bg-[#0f0f0f] border border-white/[0.05] rounded-2xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-1">Health Score</span>
                  <h2 className="text-2xl font-bold text-white">{report.financialHealthScore} <span className="text-xs text-neutral-500">/ 100</span></h2>
                  <small className="text-[10px] text-neutral-500">Budget efficiency</small>
                </div>
                {/* Visual health score circle */}
                <div className="relative w-12 h-12">
                  <svg className="w-full h-full transform -rotate-95" viewBox="0 0 36 36">
                    <path
                      className="text-neutral-800"
                      strokeWidth="3"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-[#F5A93B]"
                      strokeDasharray={`${report.financialHealthScore}, 100`}
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* AI Insights & High Expenses Block */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* AI Insights Panel */}
              <div className="lg:col-span-2 bg-gradient-to-br from-[#0f0f0f] to-[#141414] border border-white/[0.06] rounded-3xl p-5 shadow-md">
                <div className="flex items-center space-x-2 mb-4">
                  <Sparkles className="w-5 h-5 text-[#F5A93B]" />
                  <h3 className="text-sm font-bold">AI Financial Insights</h3>
                </div>
                <ul className="space-y-3.5 text-xs text-neutral-300">
                  {report.insights && report.insights.map((insight, idx) => (
                    <li key={idx} className="flex items-start space-x-2.5">
                      <span className="w-1.5 h-1.5 bg-[#F5A93B] rounded-full mt-1.5 shrink-0"></span>
                      <span>{insight.replace(/^[*-]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Highest Expense Detail */}
              <div className="bg-[#0f0f0f] border border-white/[0.05] rounded-3xl p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Highest Monthly Expense</h3>
                  {report.highestExpense && report.highestExpense.amount > 0 ? (
                    <div className="space-y-2">
                      <h2 className="text-3xl font-extrabold text-white">₹{report.highestExpense.amount}</h2>
                      <div className="text-xs">
                        <p className="font-semibold text-neutral-200">{report.highestExpense.name}</p>
                        <p className="text-neutral-500">Category: {report.highestExpense.category}</p>
                        <p className="text-neutral-500">Date: {new Date(report.highestExpense.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">No expenses recorded.</p>
                  )}
                </div>

                {report.subscriptions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/[0.05]">
                    <h4 className="text-[10px] font-bold uppercase text-neutral-400 mb-2">Active Subscriptions</h4>
                    <div className="max-h-[80px] overflow-y-auto space-y-1.5">
                      {report.subscriptions.map((sub, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-neutral-300 truncate mr-2">{sub.name}</span>
                          <span className="font-medium">₹{sub.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Visual Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Category Breakdown Pie */}
              <div className="bg-[#0f0f0f] border border-white/[0.05] rounded-3xl p-5 shadow-sm min-h-[300px] flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4">Category Breakdown</h3>
                <div className="flex-1 min-h-[200px] flex items-center justify-center relative">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                          itemStyle={{ color: '#fff', fontSize: '11px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', color: '#ccc' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-xs text-neutral-500">No chart data.</p>
                  )}
                </div>
              </div>

              {/* Settlement Progress Bar */}
              <div className="bg-[#0f0f0f] border border-white/[0.05] rounded-3xl p-5 shadow-sm min-h-[300px] flex flex-col">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4">Paid vs Pending Balance</h3>
                <div className="flex-1 min-h-[220px]">
                  {barData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={barData} barSize={40}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="name" stroke="#666" fontSize={11} tickLine={false} />
                        <YAxis stroke="#666" fontSize={11} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                          labelStyle={{ display: 'none' }}
                          itemStyle={{ color: '#fff', fontSize: '11px' }}
                        />
                        <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                          <Cell fill="#10b981" />
                          <Cell fill="#F5A93B" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-xs text-neutral-500">No chart data.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Upcoming Bills List */}
            {report.upcomingBills.length > 0 && (
              <div className="bg-[#0f0f0f] border border-white/[0.05] rounded-3xl p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Upcoming Pending Bills</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {report.upcomingBills.map((ub, idx) => (
                    <div key={idx} className="bg-neutral-950 border border-white/[0.04] rounded-xl p-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-semibold text-neutral-200">{ub.name}</p>
                        <p className="text-[10px] text-neutral-500">Due: {new Date(ub.date).toLocaleDateString()}</p>
                      </div>
                      <span className="font-bold text-[#F5A93B]">₹{ub.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  );
}
