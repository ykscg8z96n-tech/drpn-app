// backend/src/routes/users.js - CLEANED FOR DRPN
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Event = require('../models/Event');
const Match = require('../models/Match');
const Participation = require('../models/Participation');
const PrivateConnection = require('../models/PrivateConnection');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { getBotUserId } = require('../services/botUser');
const { getOrCreatePrivateConnection, sendWelcomeMessage, postSystemAnnouncement } = require('../services/botNotice');
const { cancelEventForRoster } = require('../services/eventLifecycle');

// No need for category validation since users don't have preferred categories
// const VALID_CATEGORIES = ['tabletop', 'cards', 'fantasy', 'sports', 'golf', 'health'];

// @route   GET /api/users/bot-chat
// @desc    Ensure the welcome message has been sent and return the
//          connection/bot info needed to open that thread directly (e.g.
//          right after signup, before the user has ever opened Chats).
// @access  Private
router.get('/bot-chat', protect, async (req, res) => {
  try {
    const botId = await getBotUserId();
    await sendWelcomeMessage(req.user.id, req);
    const connection = await getOrCreatePrivateConnection(botId, req.user.id, null);
    const bot = await User.findById(botId).select('name photos');

    res.json({
      success: true,
      data: {
        connectionId: connection._id,
        bot: { _id: bot._id, name: bot.name, photos: bot.photos }
      }
    });
  } catch (error) {
    console.error('❌ Error getting bot chat:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('eventsJoined.eventId', 'name eventDate location')
      .populate('eventsOrganized', 'name eventDate location status');
    
    res.json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [protect,
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('bio').optional().trim().isLength({ max: 500 }),
  body('birthDate').optional().isISO8601().toDate(),
  body('isOrganizer').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const updateFields = {};
    const allowedFields = ['name', 'bio', 'birthDate', 'searchRadius', 'isOrganizer'];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    // location.type ('Point') marks it as GeoJSON for the 2dsphere index -
    // has to be restored explicitly since the client only ever sends the
    // fields it actually collected (coordinates/address/city/state).
    if (req.body.location) {
      updateFields.location = { type: 'Point', ...req.body.location };
    }

    // If birthDate is provided, also calculate and update age
    if (req.body.birthDate) {
      const today = new Date();
      const birth = new Date(req.body.birthDate);
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      updateFields.age = age;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/verify
// @desc    Get verified. No actual verification check yet - clicking
//          the button on the Profile screen just flips it on. Verified
//          status currently gates public event/group creation and
//          private (1:1) chats (see requireVerified middleware).
// @access  Private
router.post('/verify', protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { isVerified: true } },
      { new: true }
    ).select('-password');
    res.json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/my-applications
// @desc    Get events/groups the current user has applied to (any status),
//          so they can see what they're waiting on and withdraw if needed
// @access  Private
router.get('/my-applications', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'eventsJoined.eventId',
      select: 'name type category photos eventDate location capacity currentAttendees groupSize organizer isArchived',
      populate: { path: 'organizer', select: 'name photos bio' }
    });

    const applications = user.eventsJoined
      // A stale eventsJoined entry from earlier testing (e.g. switching
      // an account to organizer after already applying) can leave an
      // application pointing at your own event - applying to something
      // you organize doesn't make sense, and showing it lets you
      // "withdraw" from your own event and confuses the Pending section
      // with a duplicate of the same card already shown as organizer.
      .filter(entry =>
        entry.eventId
        && !entry.eventId.isArchived
        && entry.eventId.organizer?._id?.toString() !== req.user.id
      )
      .map(entry => ({
        event: entry.eventId,
        status: entry.status,
        joinedAt: entry.joinedAt
      }))
      .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));

    res.json({ success: true, data: applications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/users/my-applications/:eventId
// @desc    Withdraw an application - pending or already accepted. Cleans
//          up the applicant entry, this user's eventsJoined record, and
//          (if it had been accepted) the resulting Match/Participation
//          and capacity count, so a withdrawal after acceptance frees the
//          spot back up the same as never having joined.
// @access  Private
router.delete('/my-applications/:eventId', protect, async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const applicantIndex = event.applicants.findIndex(
      app => app.userId.toString() === req.user.id
    );
    if (applicantIndex === -1) {
      return res.status(404).json({ success: false, message: 'No application found for this event' });
    }

    const wasAccepted = event.applicants[applicantIndex].status === 'accepted';
    event.applicants.splice(applicantIndex, 1);
    if (wasAccepted && event.type === 'event') {
      event.currentAttendees = Math.max(0, (event.currentAttendees || 0) - 1);
    }
    await event.save();

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { eventsJoined: { eventId } }
    });

    if (wasAccepted) {
      await Match.deleteOne({ individual: req.user.id, event: eventId });
      await Participation.deleteOne({ event: eventId, participant: req.user.id });
    }

    res.json({ success: true, message: 'Application withdrawn' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/photos
// @desc    Upload user photos
// @access  Private
router.post('/photos', [protect, upload.array('photos', 6)], async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No photos uploaded' });
    }

    const user = await User.findById(req.user.id);
    
    // Process uploaded files
    const newPhotos = req.files.map((file, index) => ({
      url: file.path,
      publicId: file.filename,
      isPrimary: user.photos.length === 0 && index === 0
    }));

    // Add new photos to user
    user.photos.push(...newPhotos);
    
    // Limit to 6 photos max
    if (user.photos.length > 6) {
      user.photos = user.photos.slice(-6);
    }

    await user.save();

    res.json({
      success: true,
      data: user.photos,
      message: 'Photos uploaded successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/users/photos/:photoId
// @desc    Delete a user photo
// @access  Private
router.delete('/photos/:photoId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const photoIndex = user.photos.findIndex(photo => photo._id.toString() === req.params.photoId);
    
    if (photoIndex === -1) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }

    // Remove photo from array
    const removedPhoto = user.photos.splice(photoIndex, 1)[0];
    
    // If this was the primary photo and there are other photos, make the first one primary
    if (removedPhoto.isPrimary && user.photos.length > 0) {
      user.photos[0].isPrimary = true;
    }

    await user.save();

    res.json({
      success: true,
      data: user.photos,
      message: 'Photo deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/photos/:photoId/primary
// @desc    Set a photo as primary
// @access  Private
router.put('/photos/:photoId/primary', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const photoIndex = user.photos.findIndex(photo => photo._id.toString() === req.params.photoId);
    if (photoIndex === -1) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }

    // Several screens read photos[0] directly rather than checking isPrimary
    // (other users' cards, chat headers, pending applications), so the
    // primary photo has to actually be first in the array, not just flagged.
    user.photos.forEach(photo => {
      photo.isPrimary = false;
    });
    const [primaryPhoto] = user.photos.splice(photoIndex, 1);
    primaryPhoto.isPrimary = true;
    user.photos.unshift(primaryPhoto);

    await user.save();

    res.json({
      success: true,
      data: user.photos,
      message: 'Primary photo updated'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/swipe
// @desc    Record a swipe action on an event
// @access  Private
router.post('/swipe', [protect,
  body('eventId').isMongoId().withMessage('Valid event ID required'),
  body('action').isIn(['like', 'pass', 'super_like']).withMessage('Action must be like, pass, or super_like')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { eventId, action } = req.body;
    const user = await User.findById(req.user.id);

    // Verify the event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // 🚫 PREVENT ORGANIZER FROM APPLYING TO THEIR OWN EVENT
    if (event.organizer.toString() === req.user.id) {
      console.log(`❌ Organizer ${req.user.id} tried to swipe on their own event: ${event.name}`);
      return res.status(400).json({
        success: false,
        message: 'You cannot apply to your own event as the organizer'
      });
    }

    // Check if already swiped on this event
    if (user.hasSwipedOnEvent(eventId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Already swiped on this event' 
      });
    }

    // Record the swipe
    user.addSwipe(eventId, action);
    await user.save();

    // If it's a like or super like, add user to event applicants
    let applicationCreated = false;
    if (action === 'like' || action === 'super_like') {
      // Check if user hasn't already applied
      if (!user.hasAppliedToEvent(eventId)) {
        // Add to user's events joined
        user.eventsJoined.push({
          eventId: eventId,
          status: 'pending'
        });
        await user.save();

        // Add to event applicants
        event.applicants.push({
          userId: req.user.id,
          status: 'pending',
          isSuperSwipe: action === 'super_like',
          appliedAt: new Date()
        });
        await event.save();

        applicationCreated = true;
        console.log(`✅ User ${req.user.id} applied to event: ${event.name}`);
      }
    }

    res.json({
      success: true,
      data: {
        swipe: {
          eventId,
          action,
          swipedAt: new Date()
        },
        applicationCreated
      },
      message: `Event ${action}d successfully`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/swipe-history
// @desc    Get user's swipe history
// @access  Private
router.get('/swipe-history', protect, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const user = await User.findById(req.user.id);

    const swipes = user.getRecentSwipes(parseInt(limit));
    
    // Populate event information
    const populatedSwipes = await Promise.all(
      swipes.map(async (swipe) => {
        const event = await Event.findById(swipe.targetId)
          .select('name eventDate location photos')
          .populate('organizer', 'name');
        
        return {
          ...swipe.toObject(),
          event
        };
      })
    );

    res.json({
      success: true,
      data: populatedSwipes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: user.swipes.length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/events
// @desc    Get user's event history (joined and organized)
// @access  Private
router.get('/events', protect, async (req, res) => {
  try {
    const { type = 'all' } = req.query;
    const user = await User.findById(req.user.id)
      .populate('eventsJoined.eventId', 'name eventDate location photos status organizer')
      .populate('eventsOrganized', 'name eventDate location photos status applicants');

    let eventsData = {};

    if (type === 'all' || type === 'joined') {
      eventsData.eventsJoined = user.eventsJoined;
    }

    if (type === 'all' || type === 'organized') {
      eventsData.eventsOrganized = user.eventsOrganized;
    }

    res.json({
      success: true,
      data: eventsData
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/reputation
// @desc    Get user's reputation details
// @access  Private
router.get('/reputation', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    const reputationData = {
      ...user.reputation.toObject(),
      level: user.getReputationLevel(),
      percentage: Math.min(100, Math.max(0, user.reputation.score))
    };

    res.json({
      success: true,
      data: reputationData
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/settings
// @desc    Update user settings
// @access  Private
router.put('/settings', [protect,
  body('pushNotifications').optional().isBoolean(),
  body('emailNotifications').optional().isBoolean(),
  body('showDistance').optional().isBoolean(),
  body('showAge').optional().isBoolean(),
  body('discoverable').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const allowedSettings = [
      'pushNotifications', 'emailNotifications', 'showDistance', 
      'showAge', 'discoverable'
    ];
    
    const updates = {};
    allowedSettings.forEach(setting => {
      if (req.body[setting] !== undefined) {
        updates[`settings.${setting}`] = req.body[setting];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      data: user.settings,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/stats
// @desc    Get user stats and activity
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    const stats = {
      eventActivity: {
        eventsJoined: user.eventsJoined.length,
        eventsOrganized: user.eventsOrganized.length,
        eventsCompleted: user.reputation.eventsCompleted,
        noShows: user.reputation.noShows
      },
      swipeActivity: {
        totalSwipes: user.swipes.length,
        likes: user.swipes.filter(s => s.action === 'like').length,
        passes: user.swipes.filter(s => s.action === 'pass').length,
        superLikes: user.swipes.filter(s => s.action === 'super_like').length
      },
      reputation: {
        score: user.reputation.score,
        level: user.getReputationLevel(),
        positiveReviews: user.reputation.positiveReviews,
        negativeReviews: user.reputation.negativeReviews
      },
      account: {
        isPremium: user.isPremium,
        memberSince: user.createdAt,
        lastActive: user.lastActive,
        isVerified: user.isVerified
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Blocking is handled per-chat via PrivateConnection.blockUser()/unblockUser()
// (see routes/private-connections.js :id/block), not at the User level.

// @route   DELETE /api/users/me
// @desc    Permanently delete the caller's own account. Cascades across
//          every place a user is referenced rather than leaving dangling
//          ObjectIds: events they solely organize get handed off to an
//          existing admin (or archived if there isn't one) so the event
//          doesn't end up with no one able to manage it; everywhere else
//          they're just removed from rosters/admin lists, or their own
//          records (participations, connections, matches) are deleted
//          outright. Chat messages are left as-is - deleting them would
//          gut the remaining participants' history, and the UI already
//          falls back to "Unknown User" for a sender that no longer
//          resolves.
// @access  Private
router.delete('/me', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Every owner has identical rights (see Event.canUserManage) - there's
    // no single "organizer" to hand off, just whichever other owners are
    // still on it.
    const ownedEvents = await Event.find({ admins: userId, isArchived: { $ne: true } });

    for (const event of ownedEvents) {
      const remainingAdmins = event.admins.filter(id => id.toString() !== userId);
      if (remainingAdmins.length > 0) {
        event.admins = remainingAdmins;
        await event.save();
        try {
          await postSystemAnnouncement(
            event,
            `${req.user.name || 'An owner'} is no longer an owner of "${event.name}" - their account was deleted.`,
            req
          );
        } catch (announceError) {
          console.error('⚠️ Failed to post owner-removed announcement:', announceError);
        }
      } else {
        // No one else to hand it to - cancel it the same way DELETE
        // /events/:id does: the roster's own Participation records get
        // archived (drops it from their feed, revokes chat access) and
        // they each get a bot notice, instead of just flipping isArchived
        // and leaving everyone else's chat dangling open to a group/event
        // that no longer has anyone who can manage it.
        await cancelEventForRoster(event, userId, req.user.name, req);
      }
    }

    // Everywhere else this account is just one entry among others -
    // remove it rather than handing anything off.
    await Event.updateMany(
      { admins: userId },
      { $pull: { admins: userId } }
    );
    await Event.updateMany(
      {},
      { $pull: { applicants: { userId }, passedBy: userId, ownerInviteDeclinedBy: userId } }
    );
    await Participation.deleteMany({ participant: userId });
    await PrivateConnection.deleteMany({ $or: [{ participant: userId }, { otherUser: userId }] });
    await Match.deleteMany({ individual: userId });

    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/:id
// @desc    Get another user's public profile (e.g. tapping a name/avatar
//          in a chat). Registered last so it doesn't shadow the specific
//          GET routes above (my-applications, swipe-history, etc).
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name photos bio birthDate isOrganizer');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;