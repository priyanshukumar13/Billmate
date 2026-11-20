// backend/utils/emailService.js
const { Resend } = require('resend');

function getConfiguration() {
  return {
    apiKey: String(process.env.RESEND_API_KEY || '').trim(),
    fromEmail: String(process.env.RESEND_FROM_EMAIL || '').trim(),
  };
}

function getEmailConfigurationStatus() {
  const { apiKey, fromEmail } = getConfiguration();
  const missing = [];
  if (!apiKey) missing.push('RESEND_API_KEY');
  if (!fromEmail) missing.push('RESEND_FROM_EMAIL');
  return {
    configured: missing.length === 0,
    missing,
    mode: process.env.MOCK_EMAIL === 'true' ? 'MOCK' : 'LIVE',
  };
}

function shouldUseMock(to) {
  if (process.env.MOCK_EMAIL === 'true') return true;
  if (String(to).toLowerCase().includes('@fail.test') || process.env.FORCE_EMAIL_ERROR === 'true') return false;
  if (process.env.NODE_ENV === 'test' && String(to).toLowerCase().includes('@example.com')) return true;
  return false;
}

function logResendError(context, error) {
  const safeError = error && typeof error === 'object' ? error : { message: String(error || 'Unknown Resend error') };
  const code = safeError.code || safeError.name || 'RESEND_ERROR';
  const message = String(safeError.message || 'Unknown error').replace(/[\r\n]+/g, ' ').slice(0, 200);
  console.error(`Email provider error [${context}]: code=${code} message=${message}`);
}

function getSafeEmailDeliveryError(error) {
  const code = String(error?.code || error?.name || '').toUpperCase();
  const statusCode = Number(error?.statusCode);
  if (statusCode === 401 || code === 'UNAUTHORIZED') return 'Email provider authentication failed. Please try again later.';
  if (statusCode === 429 || code === 'RATE_LIMITED') return 'Email provider rate limit reached. Please try again shortly.';
  if (statusCode >= 500 || code === 'ETIMEDOUT') return 'Email provider is temporarily unavailable. Please try again shortly.';
  return 'Unable to deliver the email. Please try again shortly.';
}

function getResendClient() {
  const { apiKey } = getConfiguration();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

async function sendEmail({ to, subject, text, html }) {
  if (shouldUseMock(to)) {
    console.log(`Email provider simulated acceptance for ${to}`);
    return { success: true, mocked: true };
  }

  if (String(to).toLowerCase().includes('@fail.test') || process.env.FORCE_EMAIL_ERROR === 'true') {
    const error = new Error('Simulated Resend provider failure');
    error.code = 'PROVIDER_FAILURE';
    throw error;
  }

  const resend = getResendClient();
  const { fromEmail } = getConfiguration();
  if (!resend || !fromEmail) {
    const error = new Error('Email service is not configured on the server.');
    error.code = 'MISSING_CONFIGURATION';
    throw error;
  }

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [String(to).trim()],
    subject,
    text,
    html,
  });

  if (error) {
    logResendError(subject, error);
    const providerError = new Error(error.message || 'Resend rejected the email.');
    providerError.code = error.code || error.name;
    providerError.statusCode = error.statusCode;
    throw providerError;
  }

  console.log(`Email accepted by Resend for ${to} (ID: ${data?.id || 'unknown'})`);
  return { success: true, messageId: data?.id };
}

function getBaseTemplate(title, contentHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;background:#0b0f19;font-family:Arial,sans-serif;color:#e2e8f0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:30px 12px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#111827;border-radius:16px;border:1px solid #263244;">
<tr><td style="padding:24px;text-align:center;border-bottom:1px solid #263244;"><strong style="font-size:26px;color:#f59e0b;">Bill<span style="color:#10b981;">Mate</span></strong></td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.6;color:#cbd5e1;">${contentHtml}</td></tr>
<tr><td style="padding:20px 32px;text-align:center;font-size:12px;color:#64748b;border-top:1px solid #263244;">BillMate automated security email. Never share verification codes.</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendFirstLoginOtp({ to, otp, fullName = 'Valued User', expiryMinutes = 10 }) {
  const subject = 'Verify your BillMate account';
  const text = `Hello ${fullName},\n\nYour BillMate verification code is: ${otp}\n\nThis code expires in ${expiryMinutes} minutes.\n\nNever share this code with anyone.\n\nBillMate Team`;
  const html = getBaseTemplate(subject, `
    <h2 style="margin-top:0;color:#f8fafc;">Verify your first login</h2>
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>Enter this verification code to activate your BillMate account:</p>
    <div style="margin:28px 0;padding:20px;text-align:center;background:#1e293b;border:1px dashed #f59e0b;border-radius:12px;">
      <strong style="font-size:36px;letter-spacing:8px;color:#f59e0b;">${otp}</strong>
    </div>
    <p>This code expires in <strong>${expiryMinutes} minutes</strong>.</p>
    <p style="color:#fca5a5;">Never share this code with anyone. BillMate support will never ask for it.</p>`);
  return sendEmail({ to, subject, text, html });
}

async function sendPasswordResetOtp({ to, otp, fullName = 'Valued User', expiryMinutes = 10 }) {
  const subject = 'Reset your BillMate password';
  const text = `Hello ${fullName},\n\nYour BillMate password reset code is: ${otp}\n\nThis code expires in ${expiryMinutes} minutes.\n\nIf you did not request this, ignore this email.\n\nBillMate Team`;
  const html = getBaseTemplate(subject, `
    <h2 style="margin-top:0;color:#f8fafc;">Password reset request</h2>
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>Use this code to reset your BillMate password:</p>
    <div style="margin:28px 0;padding:20px;text-align:center;background:#1e293b;border:1px dashed #f59e0b;border-radius:12px;">
      <strong style="font-size:36px;letter-spacing:8px;color:#f59e0b;">${otp}</strong>
    </div>
    <p>This code expires in <strong>${expiryMinutes} minutes</strong>.</p>
    <p style="color:#fca5a5;">If you did not request this, ignore this email.</p>`);
  return sendEmail({ to, subject, text, html });
}

async function sendPasswordChangedNotification({ to, fullName = 'Valued User' }) {
  const subject = 'Your BillMate password has changed';
  const text = `Hello ${fullName},\n\nYour BillMate password was changed successfully. All existing sessions have been invalidated.\n\nIf you did not perform this change, reset your password immediately.\n\nBillMate Team`;
  const html = getBaseTemplate(subject, `
    <h2 style="margin-top:0;color:#f8fafc;">Password changed</h2>
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>Your BillMate password was changed successfully. All existing sessions have been invalidated.</p>
    <p style="color:#fca5a5;">If you did not perform this change, reset your password immediately.</p>`);
  return sendEmail({ to, subject, text, html });
}

async function sendBillReminder({ to, userName, billName, amount, dueDate, stageLabel, daysRemaining }) {
  let statusDescription;
  if (daysRemaining > 1) statusDescription = `Days remaining: ${daysRemaining}.`;
  else if (daysRemaining === 1) statusDescription = 'Due tomorrow.';
  else if (daysRemaining === 0) statusDescription = 'This bill is due today.';
  else statusDescription = `Overdue by ${Math.abs(daysRemaining)} day(s).`;

  const subject = `BillMate Reminder: ${billName}`;
  const text = `Hello ${userName || 'Valued User'},\n\n${billName} for ${amount} is due on ${dueDate}. ${statusDescription}\n\nLog in to BillMate to manage this bill.\n\nBillMate Team`;
  const html = getBaseTemplate(subject, `
    <h2 style="margin-top:0;color:#f8fafc;">${stageLabel}</h2>
    <p>Hello <strong>${userName || 'Valued User'}</strong>,</p>
    <p><strong>${billName}</strong> for <strong>${amount}</strong> is due on <strong>${dueDate}</strong>.</p>
    <p>${statusDescription}</p>`);
  return sendEmail({ to, subject, text, html });
}

async function verifyResendConnection() {
  const status = getEmailConfigurationStatus();
  if (!status.configured) return { ok: false, missing: status.missing };
  return { ok: true, configured: true, mode: status.mode };
}

module.exports = {
  getEmailConfigurationStatus,
  getSafeEmailDeliveryError,
  verifyResendConnection,
  sendEmail,
  sendFirstLoginOtp,
  sendPasswordResetOtp,
  sendPasswordChangedNotification,
  sendBillReminder,
};
