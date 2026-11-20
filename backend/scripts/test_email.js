// Safe Resend diagnostics and test email tool
require('dotenv').config();
const emailService = require('../utils/emailService');

async function testResend() {
  console.log('==============================================');
  console.log('BillMate Resend Diagnostics & Test Tool');
  console.log('==============================================');

  const status = emailService.getEmailConfigurationStatus();
  console.log(`RESEND_API_KEY loaded: ${!status.missing.includes('RESEND_API_KEY')}`);
  console.log(`RESEND_FROM_EMAIL loaded: ${!status.missing.includes('RESEND_FROM_EMAIL')}`);
  console.log(`MOCK_EMAIL setting: ${process.env.MOCK_EMAIL || 'false'}`);

  if (!status.configured) {
    console.error(`Missing: ${status.missing.join(', ')}`);
    process.exit(1);
  }

  const targetRecipient = process.argv[2]
    ? process.argv[2].trim()
    : String(process.env.RESEND_FROM_EMAIL || '').trim();

  console.log(`Sending test email through Resend to ${targetRecipient}...`);
  try {
    const result = await emailService.sendEmail({
      to: targetRecipient,
      subject: 'BillMate Resend Verification Test',
      text: `This is a BillMate Resend delivery test.\nTimestamp: ${new Date().toISOString()}`,
      html: '<h2>BillMate Resend Test</h2><p>Resend accepted this test request.</p>',
    });
    console.log(`Resend accepted the request. ID: ${result.messageId || 'unknown'}`);
    console.log('Inbox delivery must be verified separately.');
  } catch (error) {
    console.error(`Resend test failed: ${emailService.getSafeEmailDeliveryError(error)}`);
    process.exit(1);
  }
}

testResend().catch(error => {
  console.error(`Unexpected Resend diagnostic error: ${error.message}`);
  process.exit(1);
});
