require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

// ⬇️ Change these two values to set a fresh password for your user
const TARGET_USERNAME = 'priyanshu';   // pick any username from the list
const NEW_PASSWORD    = 'Test@1234';

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const user = await User.findOne({ username: TARGET_USERNAME });
  if (!user) {
    console.error(`❌ User "${TARGET_USERNAME}" not found.`);
    return mongoose.disconnect();
  }

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(NEW_PASSWORD, salt);
  await user.save();

  console.log(`✅ Password for "${TARGET_USERNAME}" (${user.email}) reset to: ${NEW_PASSWORD}`);
  mongoose.disconnect();
}).catch(err => {
  console.error('DB error:', err.message);
  process.exit(1);
});
