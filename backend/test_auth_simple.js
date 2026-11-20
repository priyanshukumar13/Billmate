require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const API_BASE = process.env.TEST_API_BASE || 'http://localhost:5000';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);

  const suffix = Date.now();
  const email = `simple_${suffix}@example.com`;
  const password = 'SimplePassword123';

  const signup = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `simple_${suffix}`, email: email.toUpperCase(), password }),
  });
  assert(signup.status === 201, 'signup returns 201');
  assert(signup.data.success === true, 'signup succeeds');

  const dbUser = await User.findOne({ email });
  assert(Boolean(dbUser), 'user is stored with normalized email');
  assert(await bcrypt.compare(password, dbUser.password), 'password is bcrypt hashed');

  const wrongPassword = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toUpperCase(), password: 'WrongPassword123' }),
  });
  assert(wrongPassword.status === 401, 'wrong password returns 401');

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toUpperCase(), password }),
  });
  assert(login.status === 200, 'correct credentials return 200');
  assert(Boolean(login.data.token), 'login issues JWT');
  assert(login.data.token && login.status === 200, 'login returns a direct authenticated session');

  const duplicate = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `other_${suffix}`, email, password }),
  });
  assert(duplicate.status === 409, 'duplicate normalized email returns 409');

  await mongoose.disconnect();
}

run().catch(error => {
  console.error(error.message);
  process.exit(1);
});
