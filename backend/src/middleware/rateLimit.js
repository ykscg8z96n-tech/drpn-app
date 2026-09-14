// backend/src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

// Applied globally: generous, just stops a runaway client or scraper.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Applied to /auth/login and /auth/register: tight, since these are the
// brute-force / credential-stuffing / account-enumeration targets.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count against the limit
  message: { success: false, message: 'Too many attempts, please try again later.' },
});

module.exports = { apiLimiter, authLimiter };
