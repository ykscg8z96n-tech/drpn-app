// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

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

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        bio: user.bio,
        isOrganizer: user.isOrganizer,
        isPremium: user.isPremium,
        searchRadius: user.searchRadius,
        reputation: user.reputation,
        location: user.location
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
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        searchRadius: user.searchRadius,
        reputation: user.reputation,
        location: user.location,
        photos: user.photos,
        settings: user.settings,
        eventsJoined: user.eventsJoined,
        eventsOrganized: user.eventsOrganized,
        lastActive: user.lastActive
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    TEMPORARY pre-launch password reset. There's no email-sending
//          infrastructure yet, so this generates a new password and
//          returns it directly in the response instead of emailing it -
//          only acceptable because there are no real users yet. Revisit
//          before real launch: a real reset must email a link, never
//          hand back a working password in an API response.
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
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with that email' });
    }

    const temporaryPassword = crypto.randomBytes(6).toString('hex');
    user.password = temporaryPassword;
    await user.save();

    res.json({
      success: true,
      temporaryPassword,
      message: 'Use this temporary password to log in, then change it from your profile.'
    });
  } catch (error) {
    console.error('❌ Forgot-password error:', error);
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
