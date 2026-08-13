// backend/src/routes/auth.js - CLEANED FOR DRPN
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty().trim(),
  body('location.coordinates').isArray({ min: 2, max: 2 }),
  body('bio').optional().trim().isLength({ max: 500 }),
  body('searchRadius').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  console.log('🔐 Register endpoint hit');
  console.log('📝 Request body:', req.body);
  
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
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
    
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      console.log('❌ User already exists:', email);
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    
    // Create user data object
    const userData = {
      email,
      password,
      name,
      location
    };
    
    // Add optional fields if provided
    if (bio) userData.bio = bio;
    if (isOrganizer !== undefined) userData.isOrganizer = isOrganizer;
    if (searchRadius) userData.searchRadius = searchRadius;
    
    // Create user
    const user = await User.create(userData);
    
    // Generate token
    const token = generateToken(user._id);
    
    console.log('✅ User created successfully:', user.email);
    
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
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  console.log('🔐 Login endpoint hit');
  console.log('📧 Login attempt for:', req.body.email);
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Login validation errors:', errors.array());
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { email, password } = req.body;
    
    // Check for user
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    // Check if user is banned
    if (user.isBanned) {
      console.log('❌ Banned user attempted login:', email);
      return res.status(403).json({ 
        success: false, 
        message: 'Account has been banned', 
        reason: user.banReason 
      });
    }
    
    // Check password using the correct method name
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    // Update last active
    user.lastActive = new Date();
    await user.save();
    
    // Generate token
    const token = generateToken(user._id);
    
    console.log('✅ Login successful:', user.email);
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        age: user.age, // Will be undefined if not set, which is fine
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

// @route   POST /api/auth/logout
// @desc    Logout user (optional - mainly for clearing server-side sessions if needed)
// @access  Private
router.post('/logout', async (req, res) => {
  console.log('🔐 Logout endpoint hit');
  try {
    // In a JWT system, logout is mainly handled client-side
    // But we can update the user's last active time and set offline status
    
    // If you want to track user status, you could update the user here
    // const user = await User.findById(req.user.id);
    // user.isOnline = false;
    // user.lastActive = new Date();
    // await user.save();
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', async (req, res) => {
  try {
    // This would need the protect middleware
    // const user = await User.findById(req.user.id).select('-password');
    
    res.json({
      success: true,
      message: 'This endpoint requires authentication middleware'
    });
  } catch (error) {
    console.error('❌ Get me error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// @route   PUT /api/auth/update-password
// @desc    Update user password (for testing/admin)
// @access  Public (remove this in production)
router.put('/update-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required'
      });
    }

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash the new password
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
  // Temporary - remove after testing
router.get('/list-users', async (req, res) => {
  try {
    const users = await User.find({}).select('email name').limit(5);
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});
// @route   PUT /api/auth/change-password
// @desc    Change current user's password (requires login)
// @access  Private
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});
// @route   PUT /api/auth/admin-reset-password
// @desc    Admin reset any user's password by email (for testing/support)
// @access  Public (should be admin-only in production)
router.put('/admin-reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    
    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with that email'
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        userId: user._id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});
});
module.exports = router;