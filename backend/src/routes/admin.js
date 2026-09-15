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

// Shared-secret gate for one-off maintenance endpoints below - separate
// from the isAdmin-flag gate above since no account has that flag set
// yet (nothing ever grants it), and this is meant to be temporary
// tooling, not a permanent admin surface. Fails closed: if the secret
// isn't configured server-side, the routes are unusable no matter what
// header is sent.
const secretGate = (req, res, next) => {
  const configured = process.env.ADMIN_SCRIPT_SECRET;
  if (!configured || req.headers['x-admin-secret'] !== configured) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  next();
};

// Finds duplicate records left over from live click-testing:
//   - Events: same organizer + name + type (accidental double-submits,
//     retries on a flaky connection)
//   - Participation: more than one doc for the same (event, participant)
//     pair - should be impossible now (unique index), older rows may
//     predate it
//   - PrivateConnection: more than one doc between the same two users
async function findDuplicates() {
  const Event = require('../models/Event');
  const Participation = require('../models/Participation');
  const PrivateConnection = require('../models/PrivateConnection');

  const dupEvents = await Event.aggregate([
    { $match: { isArchived: { $ne: true } } },
    {
      $group: {
        _id: { organizer: '$organizer', name: '$name', type: '$type' },
        ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  const dupParticipations = await Participation.aggregate([
    {
      $group: {
        _id: { event: '$event', participant: '$participant' },
        ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  const allConnections = await PrivateConnection.find().select('participant otherUser').lean();
  const byPair = new Map();
  for (const conn of allConnections) {
    const key = [conn.participant.toString(), conn.otherUser.toString()].sort().join(':');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(conn._id);
  }
  const dupConnections = [...byPair.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ _id: key, ids, count: ids.length }));

  return { dupEvents, dupParticipations, dupConnections };
}

// @route   GET /api/admin/dedupe/report
// @desc    Report duplicate Events/Participations/PrivateConnections
//          without deleting anything.
// @access  Private (shared secret via x-admin-secret header)
router.get('/dedupe/report', secretGate, async (req, res) => {
  try {
    const { dupEvents, dupParticipations, dupConnections } = await findDuplicates();
    res.json({
      success: true,
      data: {
        events: { groups: dupEvents.length, extraRecords: dupEvents.reduce((s, g) => s + g.count - 1, 0), sample: dupEvents.slice(0, 20) },
        participations: { groups: dupParticipations.length, extraRecords: dupParticipations.reduce((s, g) => s + g.count - 1, 0) },
        privateConnections: { groups: dupConnections.length, extraRecords: dupConnections.reduce((s, g) => s + g.count - 1, 0) }
      }
    });
  } catch (error) {
    console.error('Error in dedupe report:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/admin/dedupe/cleanup
// @desc    Delete duplicates found by the report above, keeping the
//          oldest record in each group. Dry run unless body.live is true.
// @access  Private (shared secret via x-admin-secret header)
router.post('/dedupe/cleanup', secretGate, async (req, res) => {
  try {
    const Event = require('../models/Event');
    const Participation = require('../models/Participation');
    const PrivateConnection = require('../models/PrivateConnection');
    const Match = require('../models/Match');
    const Message = require('../models/Message');

    const isLive = req.body?.live === true;
    const { dupEvents, dupParticipations, dupConnections } = await findDuplicates();

    const eventGroups = [];
    let eventsRemoved = 0;
    for (const g of dupEvents) {
      const sortedIds = [...g.ids].sort((a, b) => a.toString().localeCompare(b.toString()));
      const [kept, ...toRemove] = sortedIds;
      eventGroups.push({ name: g._id.name, kept, removed: toRemove });
      if (isLive) {
        await Event.deleteMany({ _id: { $in: toRemove } });
        await Match.deleteMany({ event: { $in: toRemove } });
        await Message.deleteMany({ event: { $in: toRemove } });
        await Participation.deleteMany({ event: { $in: toRemove } });
      }
      eventsRemoved += toRemove.length;
    }

    let participationsRemoved = 0;
    for (const g of dupParticipations) {
      const sortedIds = [...g.ids].sort((a, b) => a.toString().localeCompare(b.toString()));
      const toRemove = sortedIds.slice(1);
      if (isLive) await Participation.deleteMany({ _id: { $in: toRemove } });
      participationsRemoved += toRemove.length;
    }

    let connectionsRemoved = 0;
    for (const g of dupConnections) {
      const sortedIds = [...g.ids].sort((a, b) => a.toString().localeCompare(b.toString()));
      const toRemove = sortedIds.slice(1);
      if (isLive) await PrivateConnection.deleteMany({ _id: { $in: toRemove } });
      connectionsRemoved += toRemove.length;
    }

    res.json({
      success: true,
      dryRun: !isLive,
      data: {
        events: { removed: eventsRemoved, groups: eventGroups },
        participationsRemoved,
        connectionsRemoved
      }
    });
  } catch (error) {
    console.error('Error in dedupe cleanup:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/admin/reports
// @desc    List user-submitted reports, newest first. There's no admin
//          dashboard yet - this is the only way to review them for now.
// @access  Private (shared secret via x-admin-secret header)
router.get('/reports', secretGate, async (req, res) => {
  try {
    const Report = require('../models/Report');
    const reports = await Report.find()
      .populate('reporter', 'name email')
      .populate('reportedUser', 'name email')
      .sort('-createdAt')
      .limit(200);

    res.json({ success: true, data: reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;