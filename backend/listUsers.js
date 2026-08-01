require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const users = await User.find({}, 'username email full_name created_at');
  if (users.length === 0) {
    console.log('⚠️  No users found in the database!');
  } else {
    console.log(`✅ Found ${users.length} user(s):\n`);
    users.forEach(u => {
      console.log(`  username : ${u.username}`);
      console.log(`  email    : ${u.email}`);
      console.log(`  name     : ${u.full_name}`);
      console.log(`  created  : ${u.created_at}`);
      console.log('  ---');
    });
  }
  mongoose.disconnect();
}).catch(err => {
  console.error('DB connection error:', err.message);
  process.exit(1);
});
