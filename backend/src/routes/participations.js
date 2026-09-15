// backend/src/routes/participations.js - Event & Group Participation Management
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Participation = require('../models/Participation');
const Event = require('../models/Event');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');

// @route   GET /api/participations
// @desc    Get user's participations AND organized events (with proper filtering)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { type } = req.query; // 'event' or 'group' filter
    
    console.log(`📋 Getting participations + organized events for user ${req.user.id}, type: ${type || 'all'}`);
    
    // Get participations (events/groups user joined)
    let participationQuery = {
      participant: req.user.id,
      status: 'accepted',
      isArchived: false
    };

    // .lean() - this handler only reads fields off these (no instance
    // methods called), and a plain object lets the ad-hoc unreadCount
    // field below actually show up in the JSON response, unlike a real
    // Mongoose document which only serializes schema-defined paths.
    let participations = await Participation.find(participationQuery)
      .populate({
        path: 'event',
        populate: {
          path: 'organizer',
          select: 'name photos'
        }
      })
      .sort('-chatParticipation.lastMessageAt')
      .lean();

    // Get organized events (events/groups user created)
    let organizedEventsQuery = {
      organizer: req.user.id,
      isArchived: false,
      isActive: true
    };

    // Apply type filter if specified
    if (type === 'event' || type === 'group') {
      organizedEventsQuery.type = type;
    }

    const organizedEvents = await Event.find(organizedEventsQuery)
      .populate('organizer', 'name photos')
      .sort('-createdAt');

    // Events/groups this user was promoted to owner of (but doesn't
    // organize) - they get the same manage capabilities (edit, archive,
    // invite) as the organizer, so they need the same 'isMyEvent' signal
    // on the client. A plain Participation record (from accepting the
    // roster application) doesn't carry that - owner status lives only
    // on Event.admins.
    const ownedEventsQuery = {
      admins: req.user.id,
      organizer: { $ne: req.user.id },
      isArchived: false,
      isActive: true
    };
    if (type === 'event' || type === 'group') {
      ownedEventsQuery.type = type;
    }
    const ownedEvents = await Event.find(ownedEventsQuery)
      .populate('organizer', 'name photos')
      .sort('-createdAt');

    console.log(`✅ Found ${participations.length} participations + ${organizedEvents.length} organized events + ${ownedEvents.length} owned events`);

    // Filter participations by type if specified
    if (type === 'event' || type === 'group') {
      participations = participations.filter(p => p.event && p.event.type === type);
    }

    // Transform organized events to match participation format
    const transformedOrganizedEvents = organizedEvents.map(event => ({
      _id: event._id,
      event: event,
      userRole: 'organizer',
      status: 'accepted',
      isArchived: false,
      chatParticipation: {
        hasJoinedChat: true,
        unreadCount: 0,
        lastMessageAt: event.updatedAt
      }
    }));

    const transformedOwnedEvents = ownedEvents.map(event => ({
      _id: event._id,
      event: event,
      userRole: 'owner',
      status: 'accepted',
      isArchived: false,
      chatParticipation: {
        hasJoinedChat: true,
        unreadCount: 0,
        lastMessageAt: event.updatedAt
      }
    }));

    // Combine and dedupe by event ID - stale/duplicate Participation
    // records (created before the unique event+participant index was in
    // place) or a participation that happens to point at your own
    // organized event would otherwise render the same event/group
    // multiple times in a row.
    // Organized/owned entries first - the dedupe below keeps whichever
    // copy of an event it sees first, and a plain Participation record
    // for an event this user also owns wouldn't carry userRole: 'owner',
    // losing the "can manage this" signal on the client if it won out.
    const combined = [...transformedOrganizedEvents, ...transformedOwnedEvents, ...participations];
    const seenEventIds = new Set();
    const allItems = combined.filter(item => {
      const eventId = item.event?._id?.toString();
      if (!eventId || seenEventIds.has(eventId)) return false;
      seenEventIds.add(eventId);
      return true;
    });

    // Sort by last activity
    allItems.sort((a, b) => {
      const aTime = a.chatParticipation?.lastMessageAt || a.event?.updatedAt || a.createdAt;
      const bTime = b.chatParticipation?.lastMessageAt || b.event?.updatedAt || b.createdAt;
      return new Date(bTime) - new Date(aTime);
    });

    // Unread counts are computed from Message's own readBy tracking (the
    // one canonical mechanism - see Message.getUnreadCount/markChatAsRead),
    // exposed as a plain `unreadCount` (mobile's MatchesScreen reads
    // item.unreadCount).
    await Promise.all(allItems.map(async (item) => {
      const eventDoc = item.event;
      if (!eventDoc) return;
      const chatId = `${eventDoc.type}-${eventDoc._id}`;
      item.unreadCount = await Message.getUnreadCount(eventDoc.type, chatId, req.user.id);
    }));

    console.log(`📊 Total ${type || 'all'} items for user: ${allItems.length}`);

    res.json({
      success: true,
      data: allItems
    });
  } catch (error) {
    console.error('❌ Error getting participations:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/participations/:id
// @desc    Get single participation details
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const participation = await Participation.findById(req.params.id)
      .populate('participant', 'name photos')
      .populate({
        path: 'event',
        populate: {
          path: 'organizer',
          select: 'name photos'
        }
      })
      .populate('acceptedBy', 'name');
    
    if (!participation) {
      return res.status(404).json({
        success: false,
        message: 'Participation not found'
      });
    }
    
    // Verify user owns this participation
    if (participation.participant._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    res.json({
      success: true,
      data: participation
    });
  } catch (error) {
    console.error('❌ Error getting participation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/participations/:id/join-chat
// @desc    Join event/group chat
// @access  Private
router.post('/:id/join-chat', protect, async (req, res) => {
  try {
    const participation = await Participation.findById(req.params.id)
      .populate('event', 'name type');
    
    if (!participation) {
      return res.status(404).json({
        success: false,
        message: 'Participation not found'
      });
    }
    
    // Verify user owns this participation
    if (participation.participant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    // Check if user can join chat
    if (!participation.canJoinChat) {
      return res.status(400).json({
        success: false,
        message: 'Cannot join chat - participation not active'
      });
    }
    
    // Mark as joined
    await participation.joinChat();
    
    console.log(`💬 User ${req.user.id} joined ${participation.event.type} chat for event ${participation.event._id}`);
    
    res.json({
      success: true,
      data: {
        chatRoomId: participation.chatRoomId,
        eventName: participation.event.name,
        eventType: participation.event.type
      },
      message: `Joined ${participation.event.type} chat successfully`
    });
  } catch (error) {
    console.error('❌ Error joining chat:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/participations/:id/check-in
// @desc    Check in to event
// @access  Private
router.post('/:id/check-in', protect, async (req, res) => {
  try {
    const participation = await Participation.findById(req.params.id)
      .populate('event', 'name eventDate type');
    
    if (!participation) {
      return res.status(404).json({
        success: false,
        message: 'Participation not found'
      });
    }
    
    // Verify user owns this participation
    if (participation.participant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    // Check if already checked in
    if (participation.eventParticipation.checkedIn) {
      return res.status(400).json({
        success: false,
        message: 'Already checked in'
      });
    }
    
    // For events, check if it's the event day (allow check-in 2 hours before)
    if (participation.event.type === 'event') {
      const eventDate = new Date(participation.event.eventDate);
      const now = new Date();
      const twoHoursBefore = new Date(eventDate.getTime() - 2 * 60 * 60 * 1000);
      
      if (now < twoHoursBefore) {
        return res.status(400).json({
          success: false,
          message: 'Check-in not available yet - opens 2 hours before event'
        });
      }
    }
    
    // Check in
    await participation.checkIn();
    
    console.log(`✅ User ${req.user.id} checked in to ${participation.event.type}: ${participation.event.name}`);
    
    res.json({
      success: true,
      data: participation,
      message: `Checked in to ${participation.event.name} successfully`
    });
  } catch (error) {
    console.error('❌ Error checking in:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/participations/:id/complete
// @desc    Mark event/group participation as completed
// @access  Private
router.post('/:id/complete', protect, async (req, res) => {
  try {
    const participation = await Participation.findById(req.params.id)
      .populate('event', 'name type');
    
    if (!participation) {
      return res.status(404).json({
        success: false,
        message: 'Participation not found'
      });
    }
    
    // Verify user owns this participation
    if (participation.participant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    // Mark as completed
    await participation.completeEvent();
    
    console.log(`🎉 User ${req.user.id} completed ${participation.event.type}: ${participation.event.name}`);
    
    res.json({
      success: true,
      data: participation,
      message: `${participation.event.type === 'event' ? 'Event' : 'Group meeting'} marked as completed`
    });
  } catch (error) {
    console.error('❌ Error completing participation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/participations/:id/rate
// @desc    Rate event/group participation
// @access  Private
router.post('/:id/rate', [protect,
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const participation = await Participation.findById(req.params.id)
      .populate('event', 'name type');
    
    if (!participation) {
      return res.status(404).json({
        success: false,
        message: 'Participation not found'
      });
    }
    
    // Verify user owns this participation
    if (participation.participant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    // Check if already rated
    if (participation.eventRating && participation.eventRating.rating) {
      return res.status(400).json({
        success: false,
        message: 'Already rated this participation'
      });
    }
    
    // Add rating
    await participation.rateEvent(req.body.rating, req.body.comment || '');
    
    console.log(`⭐ User ${req.user.id} rated ${participation.event.type} "${participation.event.name}": ${req.body.rating}/5`);
    
    res.json({
      success: true,
      data: participation,
      message: 'Rating submitted successfully'
    });
  } catch (error) {
    console.error('❌ Error rating participation:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/participations/:id/mute
// @desc    Mute/unmute event/group chat
// @access  Private
router.post('/:id/mute', protect, async (req, res) => {
  try {
    const { until } = req.body; // Optional date to mute until
    
    const participation = await Participation.findById(req.params.id)
      .populate('event', 'name type');
    
    if (!participation) {
      return res.status(404).json({
        success: false,
        message: 'Participation not found'
      });
    }
    
    // Verify user owns this participation
    if (participation.participant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    const muteUntil = until ? new Date(until) : null;
    await participation.muteChat(muteUntil);
    
    console.log(`🔇 User ${req.user.id} muted chat for ${participation.event.name}`);
    
    res.json({
      success: true,
      data: participation,
      message: 'Chat muted successfully'
    });
  } catch (error) {
    console.error('❌ Error muting chat:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/participations/:id/mute
// @desc    Unmute event/group chat
// @access  Private
router.delete('/:id/mute', protect, async (req, res) => {
  try {
    const participation = await Participation.findById(req.params.id)
      .populate('event', 'name type');
    
    if (!participation) {
      return res.status(404).json({
        success: false,
        message: 'Participation not found'
      });
    }
    
    // Verify user owns this participation
    if (participation.participant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    await participation.unmuteChat();
    
    console.log(`🔊 User ${req.user.id} unmuted chat for ${participation.event.name}`);
    
    res.json({
      success: true,
      data: participation,
      message: 'Chat unmuted successfully'
    });
  } catch (error) {
    console.error('❌ Error unmuting chat:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/participations/event/:eventId/participants
// @desc    Get all participants for an event (for organizers)
// @access  Private
router.get('/event/:eventId/participants', protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    
    // Check if user can manage this event
    if (!event.canUserManage(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    const participants = await Participation.getEventParticipants(req.params.eventId);
    
    res.json({
      success: true,
      data: participants
    });
  } catch (error) {
    console.error('❌ Error getting participants:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;