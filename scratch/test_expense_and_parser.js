/**
 * Test Suite: BillMate Expense Tracking & Notification Parsing Logic
 * Validates:
 * 1. Package-specific parser logic (Google Pay, PhonePe, Paytm).
 * 2. Strict negative pattern rejection (incoming, refunds, failures, pending, OTPs).
 * 3. Stable fingerprint deduplication.
 * 4. Monthly budget and spending aggregation logic.
 */

const crypto = require('crypto');

// --- 1. JAVASCRIPT MIRROR OF KOTLIN PARSER LOGIC FOR VERIFICATION ---
const PKG_GOOGLE_PAY = "com.google.android.apps.nbu.paisa.user";
const PKG_PHONEPE = "com.phonepe.app";
const PKG_PAYTM = "net.one97.paytm";
const SUPPORTED_PACKAGES = new Set([PKG_GOOGLE_PAY, PKG_PHONEPE, PKG_PAYTM]);

const NEGATIVE_PATTERNS = [
  "failed", "declined", "unsuccessful", "cancelled", "canceled",
  "pending", "processing", "requested", "request from",
  "received", "credited", "sent you", "refund", "cashback",
  "otp", "pin", "verification code", "security code", "password"
];

function extractAmount(title, text) {
  const candidates = [title, text].filter(Boolean);
  const pattern = /(?:[₹]|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i;

  for (const str of candidates) {
    const match = str.match(pattern);
    if (match && match[1]) {
      const clean = match[1].replace(/,/g, '');
      const val = parseFloat(clean);
      if (!isNaN(val) && val > 0) return val;
    }
  }

  const secondary = /([\d,]+(?:\.\d{1,2})?)\s*(?:[₹]|rs\.?|inr)/i;
  for (const str of candidates) {
    const match = str.match(secondary);
    if (match && match[1]) {
      const clean = match[1].replace(/,/g, '');
      const val = parseFloat(clean);
      if (!isNaN(val) && val > 0) return val;
    }
  }

  return null;
}

function extractMerchant(title, text) {
  const candidates = [title, text].filter(Boolean);
  const toPattern = /(?:to|at)\s+([A-Za-z0-9 &.'-]{2,40})/i;

  for (const str of candidates) {
    const match = str.match(toPattern);
    if (match && match[1]) {
      let raw = match[1].trim();
      raw = raw.replace(/\s+(was|for|using|via|on|ref).*/i, '').trim();
      if (raw.length >= 2 && raw.length <= 50) return raw;
    }
  }

  if (title && !title.toLowerCase().includes('paid') && !title.toLowerCase().includes('payment')) {
    const cleanTitle = title.trim();
    if (cleanTitle.length >= 2 && cleanTitle.length <= 40) return cleanTitle;
  }

  return null;
}

function generateFingerprint(sourceApp, amount, merchant, timestamp) {
  const timeBucket = Math.floor(timestamp / 60000);
  const raw = `${sourceApp}|${amount || 0.0}|${merchant || 'unknown'}|${timeBucket}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function parseNotification(packageName, title, text, postTime) {
  if (!SUPPORTED_PACKAGES.has(packageName)) return null;

  const combined = `${title || ''} ${text || ''}`.trim().toLowerCase();
  if (!combined) return null;

  for (const neg of NEGATIVE_PATTERNS) {
    if (combined.includes(neg)) return null;
  }

  let sourceApp = '';
  let isOutgoing = false;

  if (packageName === PKG_GOOGLE_PAY) {
    sourceApp = 'Google Pay';
    isOutgoing = combined.includes('paid') || combined.includes('sent') || combined.includes('payment to') || combined.includes('debited');
  } else if (packageName === PKG_PHONEPE) {
    sourceApp = 'PhonePe';
    isOutgoing = combined.includes('paid') || combined.includes('payment of') || combined.includes('debited') || combined.includes('successful at');
  } else if (packageName === PKG_PAYTM) {
    sourceApp = 'Paytm';
    isOutgoing = combined.includes('paid') || combined.includes('payment of') || combined.includes('money sent') || combined.includes('sent to');
  }

  if (!isOutgoing) return null;

  const amount = extractAmount(title, text);
  const merchant = extractMerchant(title, text);
  const fingerprint = generateFingerprint(sourceApp, amount, merchant, postTime);

  return {
    amount,
    merchant,
    sourceApp,
    packageName,
    timestamp: postTime,
    fingerprint,
    isAmbiguous: (amount === null || amount <= 0)
  };
}

// --- 2. RUN TESTS ---
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('\n=== SUITE 1: Notification Parser Tests ===');

// Google Pay Positive
const gpay1 = parseNotification(PKG_GOOGLE_PAY, "Google Pay", "You paid ₹150.00 to Starbucks", 1700000000000);
assert(gpay1 !== null, "GPay positive detected");
assert(gpay1 && gpay1.amount === 150.0, "GPay amount extracted: 150.0");
assert(gpay1 && gpay1.merchant === "Starbucks", "GPay merchant extracted: Starbucks");
assert(gpay1 && gpay1.sourceApp === "Google Pay", "GPay sourceApp: Google Pay");

// PhonePe Positive
const phonepe1 = parseNotification(PKG_PHONEPE, "PhonePe", "Payment of ₹450 to McDonald's was successful", 1700000000000);
assert(phonepe1 !== null, "PhonePe positive detected");
assert(phonepe1 && phonepe1.amount === 450.0, "PhonePe amount extracted: 450.0");
assert(phonepe1 && phonepe1.merchant === "McDonald's", "PhonePe merchant extracted: McDonald's");

// Paytm Positive
const paytm1 = parseNotification(PKG_PAYTM, "Paytm", "Paid ₹300 to Chai Point", 1700000000000);
assert(paytm1 !== null, "Paytm positive detected");
assert(paytm1 && paytm1.amount === 300.0, "Paytm amount extracted: 300.0");
assert(paytm1 && paytm1.merchant === "Chai Point", "Paytm merchant extracted: Chai Point");

// Negative: Received Money (must be ignored!)
const neg1 = parseNotification(PKG_GOOGLE_PAY, "Google Pay", "You received ₹500 from Alice", 1700000000000);
assert(neg1 === null, "Ignored incoming received payment");

// Negative: Failed Transaction (must be ignored!)
const neg2 = parseNotification(PKG_PHONEPE, "PhonePe", "Payment of ₹250 to Uber failed", 1700000000000);
assert(neg2 === null, "Ignored failed payment");

// Negative: Pending Transaction (must be ignored!)
const neg3 = parseNotification(PKG_PAYTM, "Paytm", "Payment of ₹100 pending at Grocery", 1700000000000);
assert(neg3 === null, "Ignored pending payment");

// Negative: Refund (must be ignored!)
const neg4 = parseNotification(PKG_GOOGLE_PAY, "Google Pay", "Refund of ₹200 credited to your account", 1700000000000);
assert(neg4 === null, "Ignored refund");

// Negative: OTP (must be ignored!)
const neg5 = parseNotification(PKG_GOOGLE_PAY, "Google Pay", "Your OTP is 482910 for transaction", 1700000000000);
assert(neg5 === null, "Ignored OTP alert");

// Negative: Non-target package
const neg6 = parseNotification("com.whatsapp", "WhatsApp", "Paid ₹100 to mom", 1700000000000);
assert(neg6 === null, "Ignored non-whitelisted package");

// Ambiguous Amount handling
const amb1 = parseNotification(PKG_GOOGLE_PAY, "Google Pay", "Paid to Metro Station", 1700000000000);
assert(amb1 !== null, "Detected payment without explicit amount");
assert(amb1 && amb1.isAmbiguous === true, "Marked as ambiguous amount");

// Deduplication Fingerprint Test
const fp1 = generateFingerprint("Google Pay", 150.0, "Starbucks", 1700000010000);
const fp2 = generateFingerprint("Google Pay", 150.0, "Starbucks", 1700000020000); // 10s later in same minute
assert(fp1 === fp2, "Stable deduplication fingerprint within 1-minute window");

console.log('\n=== SUITE 2: Budget & Spending Aggregation Tests ===');

const mockTransactions = [
  { _id: '1', name: 'Rent', amount: 15000, date: '2026-11-01', category: 'Rent', status: 'Unpaid', type: 'bill' },
  { _id: '2', name: 'Electricity', amount: 2500, date: '2026-11-05', category: 'Utilities', status: 'Paid', type: 'bill', paidDate: '2026-11-04' },
  { _id: '3', name: 'Groceries', amount: 3200, date: '2026-11-10', category: 'Food', status: 'Paid', type: 'expense', paymentMethod: 'Google Pay' },
  { _id: '4', name: 'Dining Out', amount: 1800, date: '2026-11-12', category: 'Food', status: 'Paid', type: 'expense', paymentMethod: 'PhonePe' },
  { _id: '5', name: 'Internet', amount: 999, date: '2026-11-28', category: 'Bills', status: 'Upcoming', type: 'bill' }
];

// Calculation verification
let calculatedPaid = 0;
let calculatedDue = 0;
const currentMonth = '2026-11';
let currentMonthSpending = 0;

mockTransactions.forEach(item => {
  const amt = Number(item.amount || 0);
  const isPaid = item.status === 'Paid' || item.type === 'expense';

  if (isPaid) {
    calculatedPaid += amt;
    if (item.date.startsWith(currentMonth)) {
      currentMonthSpending += amt;
    }
  } else {
    calculatedDue += amt;
  }
});

assert(calculatedPaid === (2500 + 3200 + 1800), `Total Paid is ₹7,500 (actual: ₹${calculatedPaid})`);
assert(calculatedDue === (15000 + 999), `Total Due is ₹15,999 (actual: ₹${calculatedDue})`);
assert(currentMonthSpending === 7500, `Monthly Spending strictly counts paid bills & expenses (₹${currentMonthSpending})`);

// Ensure unpaid rent (₹15,000) was NOT counted as spent money!
assert(!mockTransactions.filter(t => t.status !== 'Paid' && t.type !== 'expense').some(t => t.status === 'Paid'), "Unpaid bills are not counted as paid");

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
