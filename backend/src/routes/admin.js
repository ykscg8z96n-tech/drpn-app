// backend/src/routes/admin.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Middleware to check if user is admin
const adminOnly = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// @route   GET /api/admin/cleanup/stats
// @desc    Get cleanup statistics
// @access  Private (Admin)
router.get('/cleanup/stats', [protect, adminOnly], async (req, res) => {
  try {
    // Try to import cleanup service, fallback if not available
    let stats = {};
    try {
      const eventCleanupService = require('../services/eventCleanupService');
      stats = await eventCleanupService.getCleanupStats();
    } catch (error) {
      console.warn('Cleanup service not available:', error.message);
      stats = {
        error: 'Cleanup service not initialized',
        message: 'Create eventCleanupService.js in services directory'
      };
    }
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/admin/cleanup/manual
// @desc    Trigger manual cleanup
// @access  Private (Admin)
router.post('/cleanup/manual', [protect, adminOnly], async (req, res) => {
  try {
    const { daysOld = 1, dryRun = true, includeGroups = false } = req.body;
    
    // Try to use cleanup service
    try {
      const eventCleanupService = require('../services/eventCleanupService');
      const result = await eventCleanupService.manualCleanup({
        daysOld: parseInt(daysOld),
        dryRun: Boolean(dryRun),
        includeGroups: Boolean(includeGroups)
      });

      res.json({ 
        success: true, 
        message: dryRun ? 'Dry run completed' : 'Manual cleanup completed',
        affectedCount: result
      });
    } catch (error) {
      console.warn('Cleanup service not available:', error.message);
      res.status(503).json({
        success: false,
        message: 'Cleanup service not available',
        error: 'Create eventCleanupService.js in services directory'
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/admin/cleanup/force
// @desc    Force cleanup of expired events
// @access  Private (Admin)
router.post('/cleanup/force', [protect, adminOnly], async (req, res) => {
  try {
    // Try to use cleanup service
    try {
      const eventCleanupService = require('../services/eventCleanupService');
      await eventCleanupService.cleanupExpiredEvents();
      const stats = await eventCleanupService.getCleanupStats();
      
      res.json({ 
        success: true, 
        message: 'Forced cleanup completed',
        stats 
      });
    } catch (error) {
      console.warn('Cleanup service not available:', error.message);
      res.status(503).json({
        success: false,
        message: 'Cleanup service not available',
        error: 'Create eventCleanupService.js in services directory'
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/admin/stats
// @desc    Get general admin statistics
// @access  Private (Admin)
router.get('/stats', [protect, adminOnly], async (req, res) => {
  try {
    const Event = require('../models/Event');
    const User = require('../models/User');
    const Match = require('../models/Match');
    const Message = require('../models/Message');

    const stats = {
      users: {
        total: await User.countDocuments(),
        organizers: await User.countDocuments({ isOrganizer: true }),
        premium: await User.countDocuments({ 'premium.active': true })
      },
      events: {
        total: await Event.countDocuments(),
        active: await Event.countDocuments({ isActive: true }),
        expired: await Event.countDocuments({ isActive: false }),
        eventType: await Event.countDocuments({ type: 'event', isActive: true }),
        groupType: await Event.countDocuments({ type: 'group', isActive: true })
      },
      matches: {
        total: await Match.countDocuments(),
        active: await Match.countDocuments({ status: 'active' }),
        archived: await Match.countDocuments({ status: 'archived' })
      },
      messages: {
        total: await Message.countDocuments()
      },
      timestamp: new Date()
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;