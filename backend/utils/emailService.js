// backend/utils/emailService.js
const nodemailer = require('nodemailer');

function getSanitizedCredentials() {
  const user = process.env.EMAIL_USER ? String(process.env.EMAIL_USER).trim() : '';
  const rawPass = process.env.EMAIL_PASS ? String(process.env.EMAIL_PASS).trim() : '';
  // Gmail app passwords are often copied with spaces like "abcd efgh ijkl mnop"
  const pass = rawPass.replace(/\s+/g, '');
  return { user, pass };
}

function createTransporter() {
  const { user, pass } = getSanitizedCredentials();
  if (!user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

/**
 * Safely log SMTP delivery errors without exposing passwords, OTPs, or message bodies.
 */
function logSmtpError(context, err) {
  if (!err) return;
  const safeInfo = {
    context: context || 'Email Delivery',
    code: err.code || 'UNKNOWN',
    responseCode: err.responseCode || 'N/A',
    command: err.command || 'N/A',
    message: err.message ? String(err.message).replace(/[\r\n]+/g, ' ').slice(0, 200) : 'Unknown error',
  };
  console.error(`❌ [SMTP Error] ${safeInfo.context}: code=${safeInfo.code}, responseCode=${safeInfo.responseCode}, command=${safeInfo.command} (${safeInfo.message})`);
}

/**
 * Startup verification check for SMTP connection.
 */
async function verifySmtpConnection() {
  const { user, pass } = getSanitizedCredentials();
  if (!user || !pass) {
    console.warn('⚠️ [SMTP] EMAIL_USER or EMAIL_PASS not configured in environment variables.');
    return { ok: false, error: 'EMAIL_USER or EMAIL_PASS missing' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.warn('⚠️ [SMTP] Transporter could not be created.');
    return { ok: false, error: 'Transporter creation failed' };
  }

  try {
    await transporter.verify();
    const maskedUser = user.replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => `${a}***${c}`);
    console.log(`✅ [SMTP] Transporter successfully verified for ${maskedUser} (Mode: ${process.env.MOCK_EMAIL === 'true' ? 'MOCK' : 'LIVE'})`);
    return { ok: true };
  } catch (err) {
    logSmtpError('Connection Verification', err);
    return { ok: false, code: err.code, responseCode: err.responseCode };
  }
}

function getBaseTemplate({ title, preheader, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }
    .wrapper {
      max-width: 560px;
      margin: 30px auto;
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }
    .header {
      padding: 32px 32px 24px;
      text-align: center;
      background: linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, transparent 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .brand {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #f59e0b;
      display: inline-block;
      text-decoration: none;
    }
    .brand span {
      color: #10b981;
    }
    .body {
      padding: 32px;
      font-size: 15px;
      line-height: 1.6;
      color: #cbd5e1;
    }
    .code-box {
      margin: 28px 0;
      padding: 20px;
      text-align: center;
      background: #1e293b;
      border: 1px dashed rgba(245, 158, 11, 0.4);
      border-radius: 12px;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 8px;
      color: #f59e0b;
      margin: 0;
    }
    .warning {
      margin-top: 24px;
      padding: 12px 16px;
      background: rgba(239, 68, 68, 0.1);
      border-left: 3px solid #ef4444;
      border-radius: 6px;
      font-size: 13px;
      color: #fca5a5;
    }
    .footer {
      padding: 20px 32px;
      background: #0d131f;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#0b0f19;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader || title}
  </div>
  <div class="wrapper">
    <div class="header">
      <div class="brand">Bill<span>Mate</span></div>
    </div>
    <div class="body">
      ${contentHtml}
    </div>
    <div class="footer">
      This is an automated security email from BillMate. If you did not make this request, please secure your account immediately.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Checks whether the request should use simulated mock delivery.
 */
function shouldUseMock(to) {
  if (String(to).toLowerCase().includes('@fail.test') || process.env.FORCE_EMAIL_ERROR === 'true') {
    return false; // Will trigger simulated failure check
  }
  if (process.env.MOCK_EMAIL === 'true') {
    return true;
  }
  // In test mode, only mock simulated test addresses ending in @example.com
  if (process.env.NODE_ENV === 'test' && String(to).toLowerCase().includes('@example.com')) {
    return true;
  }
  return false;
}

/**
 * Send First-Time Login OTP Verification Email
 */
async function sendFirstLoginOtp({ to, otp, fullName = 'Valued User', expiryMinutes = 5 }) {
  if (String(to).toLowerCase().includes('@fail.test') || process.env.FORCE_EMAIL_ERROR === 'true') {
    throw new Error('Simulated email provider network failure');
  }

  if (shouldUseMock(to)) {
    console.log(`[Email Mock] Simulated First-Login OTP delivery to ${to}`);
    return { success: true, mocked: true };
  }

  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('Email service is not configured on the server.');
  }

  const { user } = getSanitizedCredentials();

  const contentHtml = `
    <h2 style="margin-top:0; color:#f8fafc; font-size:20px;">Verify your first login</h2>
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>Welcome to BillMate! To activate your account and complete your first login, please enter the six-digit verification code below:</p>
    <div class="code-box">
      <p class="otp-code">${otp}</p>
    </div>
    <p style="font-size:14px; color:#94a3b8;">This verification code will expire in <strong>${expiryMinutes} minutes</strong>.</p>
    <div class="warning">
      <strong>Security notice:</strong> Never share this code with anyone. BillMate support will never ask for your verification code.
    </div>
  `;

  const html = getBaseTemplate({
    title: 'Verify your BillMate account',
    preheader: `Your BillMate first-login verification code is ${otp}`,
    contentHtml,
  });

  try {
    const info = await transporter.sendMail({
      from: `"BillMate Security" <${user}>`,
      to,
      subject: '🔐 Verify your BillMate account - Login code',
      text: `Hello ${fullName},\n\nYour BillMate first-login verification code is: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes.\n\nNever share this code with anyone.\n\nBillMate Team`,
      html,
    });
    console.log(`📧 [Email] First-login OTP successfully dispatched to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logSmtpError(`First-Login OTP to ${to}`, err);
    throw err;
  }
}

/**
 * Send Password Reset OTP Email
 */
async function sendPasswordResetOtp({ to, otp, fullName = 'Valued User', expiryMinutes = 5 }) {
  if (String(to).toLowerCase().includes('@fail.test') || process.env.FORCE_EMAIL_ERROR === 'true') {
    throw new Error('Simulated email provider network failure');
  }

  if (shouldUseMock(to)) {
    console.log(`[Email Mock] Simulated Password-Reset OTP delivery to ${to}`);
    return { success: true, mocked: true };
  }

  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('Email service is not configured on the server.');
  }

  const { user } = getSanitizedCredentials();

  const contentHtml = `
    <h2 style="margin-top:0; color:#f8fafc; font-size:20px;">Password reset request</h2>
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>We received a request to reset the password for your BillMate account. Use the six-digit security code below to verify your identity:</p>
    <div class="code-box">
      <p class="otp-code">${otp}</p>
    </div>
    <p style="font-size:14px; color:#94a3b8;">This code will expire in <strong>${expiryMinutes} minutes</strong>.</p>
    <div class="warning">
      <strong>Did not request this?</strong> If you did not request a password reset, you can safely ignore this email. Your existing password will remain secure.
    </div>
  `;

  const html = getBaseTemplate({
    title: 'Reset your BillMate password',
    preheader: `Your BillMate password reset code is ${otp}`,
    contentHtml,
  });

  try {
    const info = await transporter.sendMail({
      from: `"BillMate Security" <${user}>`,
      to,
      subject: '🔑 Reset your BillMate password - Security code',
      text: `Hello ${fullName},\n\nYour BillMate password reset code is: ${otp}\n\nThis code will expire in ${expiryMinutes} minutes.\n\nIf you did not request this, you can safely ignore this email.\n\nBillMate Team`,
      html,
    });
    console.log(`📧 [Email] Password reset OTP successfully dispatched to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logSmtpError(`Password Reset OTP to ${to}`, err);
    throw err;
  }
}

/**
 * Send Password Changed Notification Email
 */
async function sendPasswordChangedNotification({ to, fullName = 'Valued User' }) {
  if (shouldUseMock(to)) {
    return { success: true, mocked: true };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { success: false, error: 'Email service not configured.' };
  }

  const { user } = getSanitizedCredentials();

  const contentHtml = `
    <h2 style="margin-top:0; color:#f8fafc; font-size:20px;">Your password has been changed</h2>
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>This is confirmation that the password for your BillMate account (<strong>${to}</strong>) was successfully changed.</p>
    <p>All active sessions have been invalidated as a security precaution. Please log in with your new password.</p>
    <div class="warning">
      <strong>Important:</strong> If you did not perform this change, please contact support or immediately reset your password to protect your account.
    </div>
  `;

  const html = getBaseTemplate({
    title: 'BillMate password changed',
    preheader: 'Your BillMate password was recently changed.',
    contentHtml,
  });

  try {
    const info = await transporter.sendMail({
      from: `"BillMate Security" <${user}>`,
      to,
      subject: '🛡️ Your BillMate password has been changed',
      text: `Hello ${fullName},\n\nYour BillMate password was successfully changed. All prior sessions have been invalidated.\n\nIf you did not perform this change, please contact support immediately.\n\nBillMate Team`,
      html,
    });
    console.log(`📧 [Email] Password change notice dispatched to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logSmtpError(`Password Changed Notification to ${to}`, err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  createTransporter,
  verifySmtpConnection,
  logSmtpError,
  sendFirstLoginOtp,
  sendPasswordResetOtp,
  sendPasswordChangedNotification,
};
