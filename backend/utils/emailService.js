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
  return { configured: missing.length === 0, missing };
}

function getResendClient() {
  const { apiKey } = getConfiguration();
  return apiKey ? new Resend(apiKey) : null;
}

async function sendEmail({ to, subject, text, html }) {
  const resend = getResendClient();
  const { fromEmail } = getConfiguration();
  if (!resend || !fromEmail) {
    const error = new Error('Email service is not configured.');
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
    const providerError = new Error(error.message || 'Resend rejected the email.');
    providerError.code = error.code || error.name;
    providerError.statusCode = error.statusCode;
    console.error('[EMAIL] Resend request failed:', {
      code: providerError.code || 'UNKNOWN',
      statusCode: providerError.statusCode || null,
      message: String(providerError.message || '').slice(0, 200),
    });
    throw providerError;
  }

  console.log(`[EMAIL] Resend request accepted (ID: ${data?.id || 'unknown'})`);
  return { success: true, messageId: data?.id };
}

async function sendBillReminder({ to, userName, billName, amount, dueDate, stageLabel, daysRemaining }) {
  const statusDescription = daysRemaining > 1
    ? `Days remaining: ${daysRemaining}.`
    : daysRemaining === 1
      ? 'Due tomorrow.'
      : daysRemaining === 0
        ? 'Due today.'
        : `Overdue by ${Math.abs(daysRemaining)} day(s).`;
  const subject = `BillMate Reminder: ${billName}`;
  const text = `Hello ${userName || 'Valued User'},\n\n${billName} for ${amount} is due on ${dueDate}. ${statusDescription}\n\nBillMate Team`;
  return sendEmail({ to, subject, text, html: `<h2>${stageLabel}</h2><p>${text.replace(/\n/g, '<br>')}</p>` });
}

async function verifyResendConnection() {
  const status = getEmailConfigurationStatus();
  return status.configured
    ? { ok: true, configured: true }
    : { ok: false, missing: status.missing };
}

module.exports = {
  getEmailConfigurationStatus,
  verifyResendConnection,
  sendEmail,
  sendBillReminder,
};
