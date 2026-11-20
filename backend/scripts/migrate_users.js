// backend/scripts/migrate_users.js
/**
 * Safe Migration Script for Existing Users
 * - Preserves all existing user records, passwords, bills, budgets, and settings.
 * - Safely initializes `token_version` if not present.
 * - Users with existing activity can be migrated or flagged according to policy.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrateUsers() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set in environment.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  const cursor = User.find({}).cursor();
  let migratedCount = 0;
  let totalCount = 0;

  for await (const user of cursor) {
    totalCount++;
    let needsUpdate = false;

    if (!user.username || user.username.trim() === '') {
      user.username = (user.email ? user.email.split('@')[0] : '') || user.name || 'user';
      needsUpdate = true;
    }

    if (!user.full_name || user.full_name.trim() === '') {
      user.full_name = user.name || user.username || 'User';
      needsUpdate = true;
    }

    if (user.token_version === undefined || user.token_version === null) {
      user.token_version = 0;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await user.save();
      migratedCount++;
    }
  }

  console.log(`Migration complete. Processed: ${totalCount}, Updated: ${migratedCount}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  migrateUsers().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = migrateUsers;
