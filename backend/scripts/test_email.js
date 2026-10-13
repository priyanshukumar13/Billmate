// backend/scripts/test_email.js
/**
 * Safe SMTP Diagnostics and Test Email Tool
 * Usage: node scripts/test_email.js [recipient_email]
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSmtp() {
  console.log('==============================================');
  console.log('🔍 BillMate SMTP Diagnostics & Test Tool');
  console.log('==============================================');

  const rawUser = process.env.EMAIL_USER || '';
  const rawPass = process.env.EMAIL_PASS || '';
  const mockEmail = process.env.MOCK_EMAIL || 'false';

  console.log(`• EMAIL_USER loaded: ${Boolean(rawUser)} (length: ${rawUser.length})`);
  console.log(`• EMAIL_PASS loaded: ${Boolean(rawPass)} (length: ${rawPass.length})`);
  console.log(`• MOCK_EMAIL setting: ${mockEmail}`);

  if (!rawUser || !rawPass) {
    console.error('\n❌ ERROR: EMAIL_USER or EMAIL_PASS is missing in .env file.');
    process.exit(1);
  }

  const cleanUser = rawUser.trim();
  const cleanPass = rawPass.trim().replace(/\s+/g, '');

  console.log('\n[1/2] Verifying SMTP Transporter Connection...');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: cleanUser,
      pass: cleanPass
    }
  });

  try {
    await transporter.verify();
    console.log('✅ SMTP Handshake & Authentication Successful!');
  } catch (authErr) {
    console.error('❌ SMTP Authentication Failed:');
    console.error(`   Code: ${authErr.code || 'N/A'}`);
    console.error(`   Response Code: ${authErr.responseCode || 'N/A'}`);
    console.error(`   Command: ${authErr.command || 'N/A'}`);
    console.error(`   Message: ${authErr.message}`);
    process.exit(1);
  }

  // Determine recipient (CLI argument or default to EMAIL_USER)
  const targetRecipient = process.argv[2] ? process.argv[2].trim() : cleanUser;
  console.log(`\n[2/2] Sending Test Email to ${targetRecipient}...`);

  try {
    const info = await transporter.sendMail({
      from: `"BillMate Test" <${cleanUser}>`,
      to: targetRecipient,
      subject: '✅ BillMate SMTP Verification Test',
      text: `Hello,\n\nThis is a test email sent from BillMate to verify your Gmail SMTP integration.\n\nTime: ${new Date().toISOString()}\n\nBillMate Diagnostics`,
      html: `
        <div style="font-family:sans-serif; background:#0b0f19; color:#e2e8f0; padding:24px; border-radius:12px; max-width:500px;">
          <h2 style="color:#f59e0b; margin-top:0;">BillMate SMTP Test</h2>
          <p>Your Gmail App Password and SMTP connection are configured correctly and active.</p>
          <div style="background:#1e293b; padding:12px; border-radius:8px; font-size:13px; color:#94a3b8;">
            <strong>Timestamp:</strong> ${new Date().toISOString()}<br/>
            <strong>Sender:</strong> ${cleanUser.replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => `${a}***${c}`)}
          </div>
        </div>
      `
    });

    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log('==============================================');
  } catch (sendErr) {
    console.error('❌ Failed to send test email:');
    console.error(`   Code: ${sendErr.code || 'N/A'}`);
    console.error(`   Response Code: ${sendErr.responseCode || 'N/A'}`);
    console.error(`   Command: ${sendErr.command || 'N/A'}`);
    console.error(`   Message: ${sendErr.message}`);
    process.exit(1);
  }
}

testSmtp().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
