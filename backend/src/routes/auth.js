// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { sendPasswordResetEmail } = require('../utils/email');
const { sendWelcomeMessage } = require('../services/botNotice');
const { notifyGrowth } = require('../utils/slack');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty().trim(),
  body('location.coordinates').isArray({ min: 2, max: 2 }),
  body('bio').optional().trim().isLength({ max: 500 }),
  body('searchRadius').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      email,
      password,
      name,
      location,
      bio,
      isOrganizer,
      searchRadius
    } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const userData = {
      email,
      password,
      name,
      location
    };

    if (bio) userData.bio = bio;
    if (isOrganizer !== undefined) userData.isOrganizer = isOrganizer;
    if (searchRadius) userData.searchRadius = searchRadius;

    const user = await User.create(userData);
    const token = generateToken(user._id);

    try {
      await sendWelcomeMessage(user._id, req);
    } catch (welcomeError) {
      console.error('⚠️ Failed to send welcome message:', welcomeError);
    }

    notifyGrowth(`👤 New DRPN user: ${user.name}`);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        bio: user.bio,
        isOrganizer: user.isOrganizer,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        premiumTrialUsedAt: user.premiumTrialUsedAt,
        searchRadius: user.searchRadius,
        reputation: user.reputation,
        location: user.location,
        blockedUsers: user.blockedUsers
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: 'Account has been banned',
        reason: user.banReason
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.lastActive = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        age: user.age,
        bio: user.bio,
        isOrganizer: user.isOrganizer,
        isVerified: user.isVerified,
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        premiumTrialUsedAt: user.premiumTrialUsedAt,
        searchRadius: user.searchRadius,
        reputation: user.reputation,
        location: user.location,
        photos: user.photos,
        settings: user.settings,
        eventsJoined: user.eventsJoined,
        eventsOrganized: user.eventsOrganized,
        lastActive: user.lastActive,
        blockedUsers: user.blockedUsers
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Emails a time-limited reset link. Always responds with the same
//          generic message whether or not the email matches an account, so
//          this can't be used to enumerate registered emails.
// @access  Public
router.post('/forgot-password', authLimiter, [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const user = await User.findOne({ email: req.body.email });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      await sendPasswordResetEmail(user.email, rawToken);
    }

    res.json({
      success: true,
      message: 'If an account exists for that email, a reset link has been sent.'
    });
  } catch (error) {
    console.error('❌ Forgot-password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Consumes the token emailed by /forgot-password and sets a new
//          password.
// @access  Public
router.post('/reset-password', authLimiter, [
  body('token').notEmpty(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const hashedToken = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset. You can now log in.' });
  } catch (error) {
    console.error('❌ Reset-password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (JWT is stateless - this is a client-side no-op today)
// @access  Private
router.post('/logout', protect, async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', protect, async (req, res) => {
  // req.user is already populated (minus password) by the protect middleware
  res.json({ success: true, user: req.user });
});

// @route   PUT /api/auth/change-password
// @desc    Change current user's password (requires login)
// @access  Private
router.put('/change-password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // req.user (from protect) has the password hash stripped; re-fetch
    // the full document to compare against the current password.
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword; // re-hashed by the pre-save hook on User
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
