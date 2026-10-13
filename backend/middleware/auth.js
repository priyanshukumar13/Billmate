const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  // Get token from header
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      error: 'No token provided. Authorization denied.',
      message: 'No token provided. Authorization denied.',
      msg: 'No token provided. Authorization denied.' 
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid token format. Expected "Bearer <token>".',
      message: 'Invalid token format. Expected "Bearer <token>".',
      msg: 'Invalid token format. Expected "Bearer <token>".' 
    });
  }

  const token = parts[1];
  if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
    return res.status(401).json({
      success: false,
      error: 'Token is missing or invalid.',
      message: 'Token is missing or invalid.',
      msg: 'Token is missing or invalid.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    if (!decoded || !decoded.user || !decoded.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token claims.',
        message: 'Invalid token claims.',
        msg: 'Invalid token claims.'
      });
    }

    const user = await User.findById(decoded.user.id).select('token_version is_verified email username');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found. Authorization denied.',
        message: 'User not found. Authorization denied.',
        msg: 'User not found. Authorization denied.'
      });
    }

    // Enforce first-login verification: unverified users cannot access protected APIs
    if (user.is_verified === false) {
      return res.status(403).json({
        success: false,
        isUnverified: true,
        error: 'Account email verification required.',
        message: 'Account email verification required.',
        msg: 'Account email verification required.'
      });
    }

    // Enforce token revocation / versioning on logout or password reset
    const userTokenVersion = user.token_version || 0;
    const tokenVersion = decoded.user.token_version !== undefined ? decoded.user.token_version : 0;
    if (tokenVersion !== userTokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'Session has been revoked or invalidated. Please log in again.',
        message: 'Session has been revoked or invalidated. Please log in again.',
        msg: 'Session has been revoked or invalidated. Please log in again.'
      });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      token_version: userTokenVersion
    };
    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token is not valid or has expired.',
      message: 'Token is not valid or has expired.',
      msg: 'Token is not valid or has expired.' 
    });
  }
};