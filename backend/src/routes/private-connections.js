// backend/src/routes/private-connections.js - Private Chat Management
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const PrivateConnection = require('../models/PrivateConnection');
const Participation = require('../models/Participation');
const Event = require('../models/Event');
const User = require('../models/User');
const Message = require('../models/Message');
const { protect, requireVerified } = require('../middleware/auth');

// @route   POST /api/private-connections/invite
// @desc    Send private chat invite to another user
// @access  Private (verified accounts only)
router.post('/invite', [protect, requireVerified,
  body('toUserId').isMongoId().withMessage('Valid user ID required'),
  body('originEventId').isMongoId().withMessage('Valid event ID required'),
  body('message').optional().trim().isLength({ max: 500 }).withMessage('Message too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { toUserId, originEventId, message = '' } = req.body;

    console.log(`💌 Private invite request: ${req.user.id} → ${toUserId} via event ${originEventId}`);

    // Can't invite yourself
    if (toUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send invite to yourself'
      });
    }

    // Check if both users are part of the same event - either as an
    // accepted participant, or as one of its owners (an owner never gets
    // their own Participation record, since they never had to apply to
    // their own event/group - see Event.canUserManage).
    const event = await Event.findById(originEventId).select('admins');
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const isPartOfEvent = async (userId) => {
      if (event.admins.some(id => id.toString() === userId)) return true;
      const participation = await Participation.findOne({
        event: originEventId,
        participant: userId,
        status: 'accepted'
      });
      return !!participation;
    };

    const [senderIsPart, recipientIsPart] = await Promise.all([
      isPartOfEvent(req.user.id),
      isPartOfEvent(toUserId)
    ]);

    if (!senderIsPart || !recipientIsPart) {
      return res.status(403).json({
        success: false,
        message: 'Both users must be participants in the same event to connect privately'
      });
    }

    // Account-level block (either direction) - separate from
    // PrivateConnection's own block, which only silences an existing
    // thread. This stops a blocked/blocking party from starting a fresh
    // one to route around that.
    const [sender, recipientUser] = await Promise.all([
      User.findById(req.user.id).select('blockedUsers'),
      User.findById(toUserId).select('blockedUsers')
    ]);
    const senderBlocked = sender?.blockedUsers?.some(id => id.toString() === toUserId);
    const recipientBlocked = recipientUser?.blockedUsers?.some(id => id.toString() === req.user.id);
    if (senderBlocked || recipientBlocked) {
      return res.status(403).json({ success: false, message: 'Unable to start a chat with this user' });
    }

    // Already chatting with this person - hand back the existing
    // connection instead of erroring, so tapping "Chat" again just opens
    // the same thread rather than dead-ending.
    const existingConnection = await PrivateConnection.connectionExists(req.user.id, toUserId);
    if (existingConnection) {
      // A connection created before chats started immediately (or
      // through some other still-pending path) would otherwise get
      // handed back as-is - GET /messages/private/:id requires
      // status 'accepted', so opening it would 403 with "Not
      // authorized" despite the connection existing.
      if (existingConnection.status !== 'accepted') {
        existingConnection.status = 'accepted';
        existingConnection.invite.acceptedAt = new Date();
        await existingConnection.save();
      }
      await existingConnection.populate([
        { path: 'otherUser', select: 'name photos' },
        { path: 'originEvent', select: 'name type' }
      ]);
      return res.status(200).json({
        success: true,
        data: existingConnection,
        message: 'Chat already exists'
      });
    }

    // Get recipient info
    const recipient = await User.findById(toUserId).select('name');
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Both people already know each other from a shared event's roster -
    // there's no one to actually review a "request", so start the chat
    // immediately rather than creating a pending invite the recipient has
    // no UI to see or accept (nothing in the app surfaces
    // GET /private-connections/pending). A pending connection here just
    // silently blocked the recipient's side from ever starting the same
    // chat themselves ("Invite already sent").
    const connection = await PrivateConnection.create({
      participant: toUserId,
      otherUser: req.user.id,
      originEvent: originEventId,
      status: 'accepted',
      initiatedBy: 'other_user',
      invite: { sentAt: new Date(), message, acceptedAt: new Date() }
    });

    await connection.populate([
      { path: 'otherUser', select: 'name photos' },
      { path: 'originEvent', select: 'name type' }
    ]);

    console.log(`✅ Private chat started with ${recipient.name}`);

    // TODO: Send push notification to recipient
    // TODO: Emit socket event to recipient

    res.status(201).json({
      success: true,
      data: connection,
      message: `Private chat started with ${recipient.name}`
    });

  } catch (error) {
    console.error('❌ Error sending private invite:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/private-connections
// @desc    Get user's private connections
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    // Default includes 'blocked' alongside 'accepted' - a blocked chat is
    // still yours, just silenced. Excluding it entirely (the old
    // behavior) meant blocking someone made the thread vanish from the
    // list with no way back in to ever unblock them.
    const { status = ['accepted', 'blocked'] } = req.query;

    console.log(`📱 Getting private connections for user ${req.user.id}, status: ${status}`);

    // getUserConnections already returns plain objects with `otherUser`
    // normalized to mean "whoever isn't me", regardless of which raw
    // participant/otherUser field they were originally stored in.
    const connections = await PrivateConnection.getUserConnections(req.user.id, status);

    // Unread counts come from Message's own readBy tracking - the one
    // canonical mechanism (mirrors routes/participations.js).
    const connectionsWithUnread = await Promise.all(connections.map(async (connection) => {
      const uids = [req.user.id, connection.otherUser._id.toString()].sort();
      const chatId = `private-${uids[0]}-${uids[1]}`;
      const unreadCount = await Message.getUnreadCount('private', chatId, req.user.id);
      const lastMsg = await Message.getLastMessage('private', chatId);
      const lastMessage = lastMsg ? { text: lastMsg.text, createdAt: lastMsg.timestamp } : null;
      return { ...connection, unreadCount, lastMessage };
    }));

    res.json({
      success: true,
      data: connectionsWithUnread
    });

  } catch (error) {
    console.error('❌ Error getting private connections:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/private-connections/pending
// @desc    Get pending private chat invites received
// @access  Private
router.get('/pending', protect, async (req, res) => {
  try {
    console.log(`📥 Getting pending invites for user ${req.user.id}`);

    const invites = await PrivateConnection.getPendingInvites(req.user.id);

    res.json({
      success: true,
      data: invites
    });

  } catch (error) {
    console.error('❌ Error getting pending invites:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/private-connections/:id/accept
// @desc    Accept private chat invite
// @access  Private
router.post('/:id/accept', protect, async (req, res) => {
  try {
    const connection = await PrivateConnection.findById(req.params.id)
      .populate('otherUser', 'name photos')
      .populate('originEvent', 'name type');

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Private connection not found'
      });
    }

    // Verify user is the recipient
    if (connection.participant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Check if invite is still valid
    if (!connection.isInviteValid) {
      return res.status(400).json({
        success: false,
        message: 'Invite has expired or is no longer valid'
      });
    }

    // Accept the invite
    await connection.acceptInvite();

    // Create reciprocal connection for the sender
    const reciprocalConnection = await PrivateConnection.createReciprocalConnection(connection);

    console.log(`✅ Private connection accepted between ${req.user.id} and ${connection.otherUser._id}`);

    // TODO: Send notification to sender
    // TODO: Emit socket event

    res.json({
      success: true,
      data: connection,
      message: `Private chat with ${connection.otherUser.name} is now active`
    });

  } catch (error) {
    console.error('❌ Error accepting private invite:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/private-connections/:id/reject
// @desc    Reject private chat invite
// @access  Private
router.post('/:id/reject', protect, async (req, res) => {
  try {
    const connection = await PrivateConnection.findById(req.params.id);

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Private connection not found'
      });
    }

    // Verify user is the recipient
    if (connection.participant.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Mark as expired (soft rejection)
    connection.status = 'expired';
    await connection.save();

    console.log(`❌ Private invite rejected by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Private chat invite declined'
    });

  } catch (error) {
    console.error('❌ Error rejecting private invite:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/private-connections/:id/block
// @desc    Block private connection
// @access  Private
router.post('/:id/block', protect, async (req, res) => {
  try {
    const connection = await PrivateConnection.findOne({
      _id: req.params.id,
      $or: [
        { participant: req.user.id },
        { otherUser: req.user.id }
      ]
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Private connection not found'
      });
    }

    // Block the connection
    await connection.blockUser();

    // Also block the reciprocal connection if it exists
    const reciprocalConnection = await PrivateConnection.findOne({
      participant: connection.otherUser,
      otherUser: connection.participant
    });

    if (reciprocalConnection) {
      await reciprocalConnection.blockUser();
    }

    console.log(`🚫 Private connection blocked by ${req.user.id}`);

    res.json({
      success: true,
      message: 'User blocked successfully'
    });

  } catch (error) {
    console.error('❌ Error blocking connection:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/private-connections/:id/block
// @desc    Unblock private connection
// @access  Private
router.delete('/:id/block', protect, async (req, res) => {
  try {
    const connection = await PrivateConnection.findOne({
      _id: req.params.id,
      $or: [
        { participant: req.user.id },
        { otherUser: req.user.id }
      ]
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Private connection not found'
      });
    }

    // Unblock the connection
    await connection.unblockUser();

    // Also unblock the reciprocal connection if it exists
    const reciprocalConnection = await PrivateConnection.findOne({
      participant: connection.otherUser,
      otherUser: connection.participant
    });

    if (reciprocalConnection) {
      await reciprocalConnection.unblockUser();
    }

    console.log(`✅ Private connection unblocked by ${req.user.id}`);

    res.json({
      success: true,
      message: 'User unblocked successfully'
    });

  } catch (error) {
    console.error('❌ Error unblocking connection:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/private-connections/:id/rate
// @desc    Rate private connection experience
// @access  Private
router.post('/:id/rate', [protect,
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const connection = await PrivateConnection.findOne({
      _id: req.params.id,
      $or: [
        { participant: req.user.id },
        { otherUser: req.user.id }
      ]
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Private connection not found'
      });
    }

    // Check if already rated
    if (connection.connectionRating && connection.connectionRating.rating) {
      return res.status(400).json({
        success: false,
        message: 'Already rated this connection'
      });
    }

    // Add rating
    await connection.rateConnection(req.body.rating, req.body.comment || '');

    console.log(`⭐ Private connection rated: ${req.body.rating}/5`);

    res.json({
      success: true,
      data: connection,
      message: 'Rating submitted successfully'
    });

  } catch (error) {
    console.error('❌ Error rating connection:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add this to backend/src/routes/private-connections.js

// @route   POST /api/private-connections/quick-invite
// @desc    Quick invite from event roster (simplified)
// @access  Private
router.post('/quick-invite', [protect, requireVerified,
  body('toUserId').isMongoId().withMessage('Valid user ID required'),
  body('originEventId').isMongoId().withMessage('Valid event ID required'),
  body('message').optional().trim().isLength({ max: 300 }).withMessage('Message too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { toUserId, originEventId, message = "Hey! Want to chat privately?" } = req.body;

    console.log(`💌 Quick invite: ${req.user.id} → ${toUserId} via event ${originEventId}`);

    // Can't invite yourself
    if (toUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send invite to yourself'
      });
    }

    // Verify both users are participants in the event
    const event = await Event.findById(originEventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Check if current user has access to event (is organizer OR accepted participant)
    const currentUserAccepted = event.applicants.some(
      app => app.userId.toString() === req.user.id && app.status === 'accepted'
    ) || event.organizer.toString() === req.user.id;

    if (!currentUserAccepted) {
      return res.status(403).json({
        success: false,
        message: 'You must be a participant in this event'
      });
    }

    // Check if target user has access to event (is organizer OR accepted participant)
    const targetUserAccepted = event.applicants.some(
      app => app.userId.toString() === toUserId && app.status === 'accepted'
    ) || event.organizer.toString() === toUserId;

    if (!targetUserAccepted) {
      return res.status(403).json({
        success: false,
        message: 'Target user is not a participant in this event'
      });
    }

    // Account-level block (either direction) - see the same check in
    // POST /invite above.
    const [quickSender, quickRecipient] = await Promise.all([
      User.findById(req.user.id).select('blockedUsers'),
      User.findById(toUserId).select('blockedUsers')
    ]);
    const quickSenderBlocked = quickSender?.blockedUsers?.some(id => id.toString() === toUserId);
    const quickRecipientBlocked = quickRecipient?.blockedUsers?.some(id => id.toString() === req.user.id);
    if (quickSenderBlocked || quickRecipientBlocked) {
      return res.status(403).json({ success: false, message: 'Unable to start a chat with this user' });
    }

    // Check if connection already exists (either direction)
    const existingConnection = await PrivateConnection.findOne({
      $or: [
        { participant: req.user.id, otherUser: toUserId, originEvent: originEventId },
        { participant: toUserId, otherUser: req.user.id, originEvent: originEventId }
      ]
    });

    if (existingConnection) {
      let statusMessage = 'Connection already exists';
      if (existingConnection.status === 'pending') {
        statusMessage = 'Invite already sent and pending';
      } else if (existingConnection.status === 'accepted') {
        statusMessage = 'You can already chat with this user';
      } else if (existingConnection.status === 'blocked') {
        statusMessage = 'Unable to connect with this user';
      }
      
      return res.status(400).json({
        success: false,
        message: statusMessage,
        existingStatus: existingConnection.status
      });
    }

    // Create the private connection invite
    // FIXED: Include the required initiatedBy field
    const connection = await PrivateConnection.create({
      participant: toUserId, // Recipient
      otherUser: req.user.id, // Sender
      originEvent: originEventId,
      status: 'pending',
      initiatedBy: 'other_user', // REQUIRED: From recipient's perspective, other user initiated
      invite: {
        sentAt: new Date(),
        message,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      },
      chatParticipation: {
        hasJoinedChat: false,
        lastReadAt: new Date(),
        unreadCount: 0,
        isMuted: false,
        isBlocked: false,
        lastMessageAt: new Date()
      },
      isArchived: false
    });

    // Populate for response
    await connection.populate([
      { path: 'participant', select: 'name photos' },
      { path: 'otherUser', select: 'name photos' },
      { path: 'originEvent', select: 'name type' }
    ]);

    console.log(`✅ Private invite created successfully: ${connection._id}`);
    console.log(`   From: ${req.user.id} (${connection.otherUser.name})`);
    console.log(`   To: ${toUserId} (${connection.participant.name})`);
    console.log(`   Via Event: ${event.name}`);

    // TODO: Send push notification to recipient
    // TODO: Send socket event for real-time notification

    res.status(201).json({
      success: true,
      data: connection,
      message: 'Private chat invite sent successfully!'
    });

  } catch (error) {
    console.error('❌ Error sending quick invite:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
  router.get('/debug/:connectionId', protect, async (req, res) => {
  try {
    const connection = await PrivateConnection.findById(req.params.connectionId)
      .populate('participant otherUser', 'name');
    
    const messages = await Message.find({
      privateConnection: req.params.connectionId
    }).populate('sender', 'name');
    
    res.json({
      success: true,
      connection: connection,
      messages: messages,
      messageCount: messages.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
});

module.exports = router;