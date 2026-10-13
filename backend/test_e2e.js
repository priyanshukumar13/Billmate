// End-to-End Verification Test Script for BillMate
require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const crypto = require('crypto');
const OtpChallenge = require('./models/OtpChallenge');

const API_BASE = 'http://localhost:5000';

async function getOtpForChallenge(challengeId) {
  const challenge = await OtpChallenge.findOne({ challenge_id: challengeId });
  if (!challenge) return null;
  const secret = process.env.JWT_SECRET || 'devsecret';
  for (let i = 100000; i < 1000000; i++) {
    if (crypto.createHmac('sha256', secret).update(String(i)).digest('hex') === challenge.otp_hash) {
      return String(i);
    }
  }
  return null;
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('========================================');
  console.log('🚀 RUNNING BILLMATE END-TO-END TESTS');
  console.log('========================================\n');

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  // Scenario 1: Backend unavailable / invalid port test
  console.log('--- Scenario 1: Backend unavailable test ---');
  try {
    await fetch('http://localhost:59999/api/bills');
    assert(false, 'Expected fetch to fail on unavailable backend');
  } catch (err) {
    assert(err.name === 'TypeError' || err.code === 'ECONNREFUSED' || err.message.includes('fetch'), 'Network failure correctly throws on unavailable backend');
  }

  // Scenario 2: User logged out -> protected bill endpoints reject unauthorized requests
  console.log('\n--- Scenario 2: Unauthorized requests rejected ---');
  const unauthGet = await request('/api/bills');
  assert(unauthGet.status === 401, 'GET /api/bills without token returns 401');
  assert(Boolean(unauthGet.data?.error || unauthGet.data?.msg || unauthGet.data?.message), '401 response contains informative error message');

  const unauthPost = await request('/api/bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', amount: 100, date: '2026-10-20' })
  });
  assert(unauthPost.status === 401, 'POST /api/bills without token returns 401');

  // Create User A
  console.log('\n--- User A Registration & First-Time Login OTP ---');
  const timestamp = Date.now();
  const userAData = {
    username: `userA_${timestamp}`,
    email: `usera_${timestamp}@example.com`,
    password: 'Password123'
  };
  const signupA = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userAData)
  });
  assert(signupA.status === 201, 'User A signup returns 201');

  // User A first login: credentials valid, initiates OTP verification challenge
  const loginAChallenge = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAData.email, password: userAData.password })
  });
  console.log('loginAChallenge response:', loginAChallenge);
  assert(loginAChallenge.status === 200, 'User A login returns 200');
  assert(loginAChallenge.data.requireOtp === true, 'First-time login triggers OTP challenge');
  assert(loginAChallenge.data.purpose === 'FIRST_LOGIN', 'Challenge purpose is FIRST_LOGIN');
  const challengeIdA = loginAChallenge.data.challengeId;

  // Retrieve OTP and verify
  const otpA = await getOtpForChallenge(challengeIdA);
  assert(Boolean(otpA), 'Cryptographic OTP challenge found and resolved');

  const verifyA = await request('/api/auth/verify-first-login-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: challengeIdA, otp: otpA })
  });
  assert(verifyA.status === 200, 'User A first login OTP verification succeeds');
  const tokenA = verifyA.data.token;
  assert(Boolean(tokenA), 'User A received valid JWT token');

  // Verify subsequent login does NOT require OTP
  const loginASubsequent = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userAData.email, password: userAData.password })
  });
  assert(loginASubsequent.status === 200, 'Subsequent login returns 200');
  assert(!loginASubsequent.data.requireOtp, 'Subsequent login does not require OTP');
  assert(Boolean(loginASubsequent.data.token), 'Subsequent login issues token immediately');

  // Scenario 3: User logged in -> Profile endpoint works
  console.log('\n--- Scenario 3: Profile endpoint works ---');
  const profileRes = await request('/api/profile', {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(profileRes.status === 200, 'GET /api/profile returns 200');
  assert(profileRes.data.username === userAData.username, 'Profile returns correct username');
  assert(profileRes.data.email === userAData.email, 'Profile returns correct email');

  // Scenario 4: User logged in -> Existing bills load successfully
  console.log('\n--- Scenario 4: Existing bills load successfully ---');
  const initialBillsRes = await request('/api/bills', {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(initialBillsRes.status === 200, 'GET /api/bills returns 200');
  assert(Array.isArray(initialBillsRes.data), 'Bills response is an array');
  assert(initialBillsRes.data.length === 0, 'New user starts with 0 bills');

  // Scenario 5: User logged in -> Valid bill is created and persisted
  console.log('\n--- Scenario 5: Valid bill creation and persistence ---');
  const billPayload = {
    name: 'Broadband Internet',
    amount: 1499.50,
    date: '2026-10-30',
    category: 'Utilities',
    notes: '500Mbps fiber'
  };
  const createBillRes = await request('/api/bills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify(billPayload)
  });
  assert(createBillRes.status === 201, 'POST /api/bills returns 201 Created');
  assert(createBillRes.data.name === 'Broadband Internet', 'Created bill has correct name');
  assert(createBillRes.data.amount === 1499.50, 'Created bill has correct amount');
  assert(createBillRes.data.status === 'Unpaid', 'Created bill defaults to Unpaid');
  const billAId = createBillRes.data._id;
  assert(Boolean(billAId), 'Created bill has generated database _id');

  // Scenario 6: Invalid bill data -> Backend returns appropriate validation error
  console.log('\n--- Scenario 6: Bill validation error handling ---');
  // 6a: Missing name
  const invalidNameRes = await request('/api/bills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({ name: '', amount: 500, date: '2026-10-30' })
  });
  assert(invalidNameRes.status === 400, 'Empty bill name rejected with 400');
  assert(invalidNameRes.data.error.includes('name'), 'Validation error specifies missing name');

  // 6b: Invalid amount
  const invalidAmtRes = await request('/api/bills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({ name: 'Valid Name', amount: -50, date: '2026-10-30' })
  });
  assert(invalidAmtRes.status === 400, 'Negative bill amount rejected with 400');
  assert(invalidAmtRes.data.error.includes('amount'), 'Validation error specifies invalid amount');

  // 6c: Invalid date
  const invalidDateRes = await request('/api/bills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({ name: 'Valid Name', amount: 500, date: 'not-a-date' })
  });
  assert(invalidDateRes.status === 400, 'Invalid bill date rejected with 400');

  // Scenario 7: Expired or invalid token -> authentication fails safely
  console.log('\n--- Scenario 7: Invalid token handling ---');
  const invalidTokenRes = await request('/api/bills', {
    headers: { 'Authorization': 'Bearer invalid.jwt.token' }
  });
  assert(invalidTokenRes.status === 401, 'Invalid token returns 401');
  assert(Boolean(invalidTokenRes.data.error || invalidTokenRes.data.msg), 'Error message explains invalid token');

  const emptyBearerRes = await request('/api/bills', {
    headers: { 'Authorization': 'Bearer null' }
  });
  assert(emptyBearerRes.status === 401, 'Bearer null returns 401');

  // Scenario 8: After creating a bill, the new bill appears in subsequent fetch
  console.log('\n--- Scenario 8: New bill appears in subsequent fetch ---');
  const fetchUpdatedBills = await request('/api/bills', {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(fetchUpdatedBills.status === 200, 'GET /api/bills returns 200');
  assert(fetchUpdatedBills.data.length === 1, 'Bill list contains exactly 1 bill');
  assert(fetchUpdatedBills.data[0]._id === billAId, 'Fetched bill matches created bill ID');

  // Scenario 9: One user cannot access another user\'s bills
  console.log('\n--- Scenario 9: Cross-user authorization isolation ---');
  const userBData = {
    username: `userB_${timestamp}`,
    email: `userb_${timestamp}@example.com`,
    password: 'Password123'
  };
  const signupB = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userBData)
  });
  assert(signupB.status === 201, 'User B registered successfully');

  const loginBChallenge = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userBData.email, password: userBData.password })
  });
  assert(loginBChallenge.data.requireOtp === true, 'User B first-time login requires OTP');
  const challengeIdB = loginBChallenge.data.challengeId;
  const otpB = await getOtpForChallenge(challengeIdB);
  assert(Boolean(otpB), 'User B OTP challenge resolved');

  const verifyB = await request('/api/auth/verify-first-login-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: challengeIdB, otp: otpB })
  });
  assert(verifyB.status === 200, 'User B OTP verified successfully');
  const tokenB = verifyB.data.token;
  assert(Boolean(tokenB), 'User B received valid JWT token');

  // User B fetching bills should see 0 bills
  const userBBills = await request('/api/bills', {
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert(userBBills.data.length === 0, 'User B cannot see User A bills in GET /api/bills');

  // User B attempting to view User A's bill directly
  const accessBillAByB = await request(`/api/bills/${billAId}`, {
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert(accessBillAByB.status === 403, 'User B accessing User A bill by ID returns 403 Forbidden');

  // User B attempting to update User A's bill
  const updateBillAByB = await request(`/api/bills/${billAId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    },
    body: JSON.stringify({ amount: 1 })
  });
  assert(updateBillAByB.status === 403, 'User B modifying User A bill returns 403 Forbidden');

  // User B attempting to delete User A's bill
  const deleteBillAByB = await request(`/api/bills/${billAId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert(deleteBillAByB.status === 403, 'User B deleting User A bill returns 403 Forbidden');

  // Scenario 10: Bill status toggle & cleanup
  console.log('\n--- Scenario 10: User A bill toggle and deletion ---');
  const toggleRes = await request(`/api/bills/${billAId}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(toggleRes.status === 200, 'User A can toggle bill status to Paid');
  assert(toggleRes.data.status === 'Paid', 'Bill status is now Paid');

  const deleteRes = await request(`/api/bills/${billAId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(deleteRes.status === 200, 'User A can delete their own bill');

  const finalCheck = await request('/api/bills', {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(finalCheck.data.length === 0, 'Bill list is empty after deletion');

  // Scenario 11: In-app notifications generated & isolated per user
  console.log('\n--- Scenario 11: In-app notifications verification ---');
  const notifsRes = await request('/api/notifications', {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(notifsRes.status === 200, 'GET /api/notifications returns 200');
  assert(Array.isArray(notifsRes.data.notifications), 'Notifications response has notifications array');
  assert(notifsRes.data.notifications.length >= 2, 'User A has at least 2 notifications (created + paid)');
  
  const createdNotif = notifsRes.data.notifications.find(n => n.type === 'BILL_CREATED');
  assert(Boolean(createdNotif), 'Found BILL_CREATED notification for User A');
  assert(createdNotif.message.includes('New bill added:'), 'BILL_CREATED message format is correct');
  
  const paidNotif = notifsRes.data.notifications.find(n => n.type === 'BILL_PAID');
  assert(Boolean(paidNotif), 'Found BILL_PAID notification for User A');
  assert(paidNotif.message.includes('Payment recorded:'), 'BILL_PAID message format is correct');

  // Verify User B cannot see User A notifications
  const notifsBRes = await request('/api/notifications', {
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert(notifsBRes.status === 200, 'User B GET /api/notifications returns 200');
  assert(notifsBRes.data.notifications.length === 0, 'User B cannot see User A notifications (isolated)');

  // Verify User B cannot mark User A notification as read
  const hackNotif = await request(`/api/notifications/${createdNotif._id}/read`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  assert(hackNotif.status === 403, 'User B cannot mark User A notification as read (403 Forbidden)');

  // User A marks single notification as read
  const markRead = await request(`/api/notifications/${createdNotif._id}/read`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(markRead.status === 200, 'User A can mark single notification as read');

  // User A marks all as read
  const markAllRead = await request('/api/notifications/read-all', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(markAllRead.status === 200, 'User A can mark all notifications as read');

  const afterReadRes = await request('/api/notifications', {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  assert(afterReadRes.data.unreadCount === 0, 'Unread notification count is now 0');

  console.log('\n========================================');
  console.log('🎉 ALL 11 TEST SCENARIOS PASSED SUCCESSFULLY!');
  console.log('========================================');
  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
