// backend/src/routes/push.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// @route   GET /api/push/vapid-public-key
// @desc    The public key the client needs to create a Push subscription.
// @access  Public (it's public by design - the private key never leaves the server)
router.get('/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ success: false, message: 'Push notifications not configured' });
  }
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

// @route   POST /api/push/subscribe
// @desc    Register a Web Push subscription for the current user.
// @access  Private
router.post('/subscribe', protect, [
  body('endpoint').notEmpty(),
  body('keys.p256dh').notEmpty(),
  body('keys.auth').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { endpoint, keys } = req.body;
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { webPushSubscriptions: { endpoint } } }
    );
    await User.updateOne(
      { _id: req.user.id },
      { $push: { webPushSubscriptions: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Push subscribe error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/push/subscribe
// @desc    Remove a Web Push subscription (e.g. notifications turned off).
// @access  Private
router.delete('/subscribe', protect, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'endpoint is required' });
    }
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { webPushSubscriptions: { endpoint } } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Push unsubscribe error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
