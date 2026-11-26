const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function createDifyUserContext(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  return jwt.sign(
    { scope: 'ai:tools', jti: crypto.randomUUID() },
    secret,
    {
      subject: String(userId),
      issuer: 'billmate',
      audience: 'dify-tools',
      expiresIn: '5m'
    }
  );
}

module.exports = { createDifyUserContext };
