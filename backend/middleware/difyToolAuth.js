const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = function difyToolAuth(req, res, next) {
  const expectedSecret = process.env.DIFY_BACKEND_TOOL_SECRET;
  const suppliedSecret = req.get('X-Dify-Tool-Secret');
  if (!expectedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
    return res.status(401).json({ success: false, error: 'Tool authentication failed.' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(503).json({ success: false, error: 'Tool identity verification is not configured.' });
  }

  const contextToken = req.get('X-BillMate-Context')
    || req.query.contextToken
    || req.body?.contextToken;
  if (typeof contextToken !== 'string' || contextToken.length > 4096) {
    return res.status(401).json({ success: false, error: 'A valid BillMate user context is required.' });
  }

  try {
    const identity = jwt.verify(contextToken, jwtSecret, {
      issuer: 'billmate',
      audience: 'dify-tools'
    });
    if (identity.scope !== 'ai:tools' || typeof identity.sub !== 'string') {
      return res.status(401).json({ success: false, error: 'A valid BillMate user context is required.' });
    }

    req.user = { id: identity.sub };
    return next();
  } catch (_error) {
    return res.status(401).json({ success: false, error: 'A valid BillMate user context is required.' });
  }
};
