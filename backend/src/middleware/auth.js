// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }
      
      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
  }
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }
};

// Check if user is an organizer
const organizer = async (req, res, next) => {
  if (req.user && req.user.isOrganizer) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Not authorized as organizer' });
  }
};

// Check if user has premium
const premium = async (req, res, next) => {
  if (req.user && req.user.premium.active && new Date(req.user.premium.expiresAt) > new Date()) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Premium subscription required' });
  }
};

// Private (1:1) chats are the app's highest-trust surface - no roster or
// shared-event context to fall back on if someone abuses it - so they're
// gated on the requester being verified. Event/group chats are unaffected.
const requireVerified = async (req, res, next) => {
  if (req.user && req.user.isVerified) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Get verified from your Profile to use private chats' });
  }
};

module.exports = { protect, organizer, premium, requireVerified };