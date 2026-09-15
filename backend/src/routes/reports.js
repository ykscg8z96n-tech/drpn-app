// backend/src/routes/reports.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Report = require('../models/Report');
const { protect } = require('../middleware/auth');

// @route   POST /api/reports
// @desc    Report another user for bad behavior
// @access  Private
router.post('/', protect, [
  body('reportedUserId').notEmpty(),
  body('reason').isIn(['harassment', 'spam', 'inappropriate_content', 'safety_concern', 'other']),
  body('details').optional().trim().isLength({ max: 1000 }),
  body('context').optional().isIn(['private_chat', 'event_chat', 'group_chat', 'other']),
  body('contextId').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { reportedUserId, reason, details, context, contextId } = req.body;

    if (reportedUserId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot report yourself' });
    }

    await Report.create({
      reporter: req.user.id,
      reportedUser: reportedUserId,
      reason,
      details,
      context: context || 'other',
      contextId
    });

    res.status(201).json({ success: true, message: 'Report submitted' });
  } catch (error) {
    console.error('❌ Report submission error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
