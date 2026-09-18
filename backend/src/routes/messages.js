// backend/src/routes/messages.js - Updated for 3-Chat System
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const ChatCounter = require('../models/ChatCounter');
const Participation = require('../models/Participation');
const PrivateConnection = require('../models/PrivateConnection');
const Event = require('../models/Event');
const { protect } = require('../middleware/auth');
const { isUserOnline } = require('../socket/socketHandler');
const { sendPushToUser } = require('../services/webPush');

// @route   POST /api/messages
// @desc    Send a message to any chat type (event/group/private)
// @access  Private
router.post('/', [protect,
  body('text').notEmpty().trim().isLength({ max: 1000 }).withMessage('Message text is required and must be under 1000 characters'),
  body('chatType').isIn(['event', 'group', 'private']).withMessage('Chat type must be event, group, or private'),
  body('eventId').optional().isMongoId().withMessage('Valid event ID required for event/group chats'),
  body('privateConnectionId').optional().isMongoId().withMessage('Valid private connection ID required for private chats'),
  body('clientId').optional().isString()
], async (req, res) => {
  try {
    // A retried send reuses the same clientId - return the message that
    // already exists instead of creating a duplicate.
    if (req.body.clientId) {
      const existing = await Message.findOne({ clientId: req.body.clientId })
        .populate('sender', 'name photos');
      if (existing) {
        return res.status(200).json({ success: true, data: existing, message: 'Message already sent' });
      }
    }
    console.log('💬 Send message request:', {
      chatType: req.body.chatType,
      eventId: req.body.eventId,
      privateConnectionId: req.body.privateConnectionId,
      text: req.body.text?.substring(0, 50) + '...'
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { text, chatType, eventId, privateConnectionId, clientId } = req.body;
    let message;

    if (chatType === 'event' || chatType === 'group') {
      // Event/Group chat message
      if (!eventId) {
        return res.status(400).json({
          success: false,
          message: 'Event ID required for event/group chats'
        });
      }

      console.log(`📨 SEND MESSAGE: Event ${eventId}, User ${req.user.id}`);

      // Get the event
      const event = await Event.findById(eventId);
      
      if (!event) {
        console.log(`❌ Event not found: ${eventId}`);
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      console.log(`📋 Event: ${event.name}, Organizer: ${event.organizer}`);

      // Check if user is organizer (SAME CHECK AS GET ROUTE)
      const isOrganizer = event.organizer.toString() === req.user.id;
      console.log(`👤 User ${req.user.id} is organizer: ${isOrganizer}`);

      // Check for participation
      const participation = await Participation.findOne({
        event: eventId,
        participant: req.user.id,
        status: 'accepted',
        isArchived: false
      });

      const hasParticipation = !!participation;
      console.log(`👥 User ${req.user.id} has participation: ${hasParticipation}`);

      // ALLOW ACCESS if user is organizer OR has participation
      if (!isOrganizer && !hasParticipation) {
        console.log(`🚫 SEND ACCESS DENIED - Not organizer and no participation`);
        return res.status(403).json({
          success: false,
          message: 'Not authorized - you must be organizer or participant'
        });
      }

      const accessType = isOrganizer ? 'organizer' : 'participant';
      console.log(`✅ SEND ACCESS GRANTED as ${accessType}`);

      // Create event/group message
      message = await Message.createEventMessage(
        eventId,
        req.user.id,
        text,
        event.type,
        clientId
      );

      // Update participation chat tracking (only for participants)
      if (hasParticipation) {
        await participation.updateLastMessage();
      }

      console.log(`✅ ${chatType} message sent to ${event.name} by ${accessType}`);

      // Push notify offline participants - this is the only place a
      // message actually gets created (the client sends over REST, not
      // the socket), so this is where push needs to happen too.
      const allParticipants = await Participation.getEventParticipants(eventId);
      const offlineRecipientIds = allParticipants
        .map(p => (p.participant?._id || p.participant)?.toString())
        .filter(id => id && id !== req.user.id && !isUserOnline(id));
      const preview = text.trim().length > 120 ? `${text.trim().slice(0, 117)}...` : text.trim();
      console.log(`🔔 Push check (${chatType}): ${offlineRecipientIds.length} offline recipient(s) of ${allParticipants.length} total`);
      offlineRecipientIds.forEach(id => {
        sendPushToUser(id, {
          title: `${req.user.name} in ${chatType === 'group' ? 'your group' : 'your event'}`,
          body: preview,
          url: '/'
        }).then(sent => console.log(`🔔 Push to ${id}: ${sent ? 'sent' : 'skipped (no subscription/VAPID)'}`))
          .catch(err => console.error('⚠️ Push notify (event) failed:', err));
      });

    } else if (chatType === 'private') {
      // Private chat message
      if (!privateConnectionId) {
        return res.status(400).json({
          success: false,
          message: 'Private connection ID required for private chats'
        });
      }

      // Private (1:1) chats need the sender verified - no roster or
      // shared-event context to fall back on if abused, unlike event/group
      // chats. Doesn't apply to the bot's own notices, which are created
      // directly (services/botNotice.js), not through this route.
      if (!req.user.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Get verified from your Profile to use private chats'
        });
      }

      console.log(`💬 Sending private message via connection: ${privateConnectionId}, user: ${req.user.id}`);

      // Verify user has access to this private chat
      const connection = await PrivateConnection.findOne({
        _id: privateConnectionId,
        $or: [
          { participant: req.user.id },
          { otherUser: req.user.id }
        ],
        status: 'accepted',
        isArchived: false
      });

      if (!connection) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized - private connection not found or blocked'
        });
      }

      // FIXED: Create shared room ID for consistent messaging
      const userId1 = connection.participant.toString();
      const userId2 = connection.otherUser.toString();
      const sortedUserIds = [userId1, userId2].sort();
      const sharedRoomId = `private-${sortedUserIds[0]}-${sortedUserIds[1]}`;

      console.log(`🏠 Sending to shared room: ${sharedRoomId}`);

      const privateSeq = await ChatCounter.nextSeq(sharedRoomId);

      // Create private message with shared room ID
      message = await Message.create({
        chatType: 'private',
        chatId: sharedRoomId, // Use shared room ID
        privateConnection: privateConnectionId,
        sender: req.user.id,
        text: text,
        messageType: 'text',
        clientId,
        seq: privateSeq
      });

      // Update connection chat tracking
      await connection.updateLastMessage();

      console.log('✅ Private message sent to shared room');

      // Push notify the recipient if they're offline - same reasoning
      // as the event/group branch above.
      const recipientId = [userId1, userId2].find(id => id !== req.user.id);
      const recipientOnline = recipientId && isUserOnline(recipientId);
      console.log(`🔔 Push check (private): recipient=${recipientId} online=${recipientOnline}`);
      if (recipientId && !recipientOnline) {
        const preview = text.trim().length > 120 ? `${text.trim().slice(0, 117)}...` : text.trim();
        sendPushToUser(recipientId, {
          title: req.user.name,
          body: preview,
          url: '/'
        }).then(sent => console.log(`🔔 Push to ${recipientId}: ${sent ? 'sent' : 'skipped (no subscription/VAPID)'}`))
          .catch(err => console.error('⚠️ Push notify (private) failed:', err));
      }
    }

    // Populate sender info
    await message.populate('sender', 'name photos');

    // Emit to the same room the socket handler uses (chatType:chatId -
    // see socket/socketHandler.js) so clients get this over the socket
    // whether the send came in over REST or the socket itself.
    const io = req.app.get('io');
    if (message.chatId) {
      io.to(`${message.chatType}:${message.chatId}`).emit('message:new', message);
    }

    res.status(201).json({
      success: true,
      data: message,
      message: 'Message sent successfully'
    });

  } catch (error) {
    // Two concurrent retries with the same clientId can both pass the
    // initial existence check and then race to insert - the unique
    // index catches it here as a duplicate-key error. Treat that as
    // success (the message did send) rather than a server error.
    if (error.code === 11000 && error.keyPattern?.clientId) {
      const existing = await Message.findOne({ clientId: req.body.clientId })
        .populate('sender', 'name photos');
      if (existing) {
        return res.status(200).json({ success: true, data: existing, message: 'Message already sent' });
      }
    }
    console.error('❌ Error sending message:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/messages/event/:eventId
// @desc    Get messages for event/group chat
// @access  Private
router.get('/event/:eventId', protect, async (req, res) => {
  try {
    const { limit = 50, before } = req.query;
    const eventId = req.params.eventId;
    const userId = req.user.id;

    console.log(`🔍 MESSAGES: Event ${eventId}, User ${userId}`);

    // Get the event first
    const event = await Event.findById(eventId);
    
    if (!event) {
      console.log(`❌ Event not found: ${eventId}`);
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    console.log(`📋 Event: ${event.name}, Organizer: ${event.organizer}`);

    // Check if user is organizer (SIMPLE CHECK)
    const isOrganizer = event.organizer.toString() === userId;
    console.log(`👤 User ${userId} is organizer: ${isOrganizer}`);

    // Check for participation
    const participation = await Participation.findOne({
      event: eventId,
      participant: userId,
      status: 'accepted',
      isArchived: false
    });
    
    const hasParticipation = !!participation;
    console.log(`👥 User ${userId} has participation: ${hasParticipation}`);

    // ALLOW ACCESS if user is organizer OR has participation
    if (!isOrganizer && !hasParticipation) {
      console.log(`🚫 ACCESS DENIED - Not organizer and no participation`);
      return res.status(403).json({
        success: false,
        message: 'Not authorized - you must be organizer or participant'
      });
    }

    const accessType = isOrganizer ? 'organizer' : 'participant';
    console.log(`✅ ACCESS GRANTED as ${accessType}`);

    // Get messages
    const messages = await Message.getEventMessages(
      eventId,
      event.type,
      parseInt(limit),
      before ? new Date(before) : null
    );

    console.log(`📨 Found ${messages.length} messages`);

    // Try to mark as read (don't fail if this errors)
    try {
      await Message.markChatAsRead(
        event.type,
        `${event.type}-${eventId}`,
        userId
      );
    } catch (markError) {
      console.log(`⚠️ Mark read error (non-critical):`, markError.message);
    }

    // An event-invite card's accept/pass buttons need to reflect this
    // viewer's actual status (already joined, already passed, or it's
    // their own event) - computed here rather than trusted from the
    // client, and against the invited event (not this group chat's own
    // event/organizer).
    const inviteMessages = messages.filter(m => m.systemMessage?.type === 'event_invite');
    if (inviteMessages.length) {
      const invitedEventIds = [...new Set(inviteMessages.map(m => m.systemMessage.data.eventId?.toString()))];
      const invitedEvents = await Event.find({ _id: { $in: invitedEventIds } })
        .select('organizer applicants passedBy');
      const invitedEventsById = new Map(invitedEvents.map(e => [e._id.toString(), e]));

      for (const message of inviteMessages) {
        const invitedEvent = invitedEventsById.get(message.systemMessage.data.eventId?.toString());
        let viewerStatus = null;
        if (invitedEvent) {
          if (invitedEvent.organizer.toString() === userId) {
            viewerStatus = 'own';
          } else if (invitedEvent.applicants.some(a => a.userId.toString() === userId && a.status === 'accepted')) {
            viewerStatus = 'joined';
          } else if (invitedEvent.passedBy.some(id => id.toString() === userId)) {
            viewerStatus = 'passed';
          }
        }
        message.systemMessage.data.viewerStatus = viewerStatus;
      }
    }

    res.json({
      success: true,
      data: messages.reverse(),
      chatInfo: {
        eventName: event.name,
        eventType: event.type,
        chatRoomId: `${event.type}-${eventId}`,
        userRole: accessType
      }
    });

  } catch (error) {
    console.error('❌ Messages route error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/messages/private/:connectionId
// @desc    Get messages for private chat (FIXED ObjectId issue)
// @access  Private
router.get('/private/:connectionId', protect, async (req, res) => {
  try {
    console.log(`💬 Getting private messages for connection: ${req.params.connectionId}, user: ${req.user.id}`);
    
    const { limit = 50, before } = req.query;

    // Find the connection the user has access to - 'blocked' is allowed
    // here too so a blocked chat's history stays readable (and the
    // blocked note below can render); sending is separately blocked
    // further down and in the socket handler regardless of this check.
    const connection = await PrivateConnection.findOne({
      _id: req.params.connectionId,
      $or: [
        { participant: req.user.id },
        { otherUser: req.user.id }
      ],
      status: { $in: ['accepted', 'blocked'] },
      isArchived: false
    }).populate('otherUser participant', 'name photos');

    console.log(`🔍 Connection found:`, connection ? 'YES' : 'NO');
    
    if (!connection) {
      console.log(`❌ Authorization failed - connection not found or user not authorized`);
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    console.log(`✅ User ${req.user.id} authorized for connection ${req.params.connectionId}`);

    // FIXED: Get the actual ObjectId values, not the populated objects
    const userId1 = connection.participant._id ? connection.participant._id.toString() : connection.participant.toString();
    const userId2 = connection.otherUser._id ? connection.otherUser._id.toString() : connection.otherUser.toString();
    const sortedUserIds = [userId1, userId2].sort();
    const sharedRoomId = `private-${sortedUserIds[0]}-${sortedUserIds[1]}`;
    
    console.log(`🏠 Generated shared room ID: ${sharedRoomId}`);
    console.log(`👥 Between users: ${userId1} and ${userId2}`);

    // Get all connection IDs between these two users
    const allConnections = await PrivateConnection.find({
      $or: [
        { participant: userId1, otherUser: userId2 },
        { participant: userId2, otherUser: userId1 }
      ]
    }).distinct('_id');

    console.log(`🔗 Found ${allConnections.length} connections between users`);

    // Get messages from all possible sources
    const messages = await Message.find({
      chatType: 'private',
      $or: [
        { chatId: sharedRoomId },
        { chatId: `private-${req.params.connectionId}` },
        { privateConnection: { $in: allConnections } }
      ]
    })
    .populate('sender', 'name photos')
    .sort({ timestamp: -1 })
    .limit(parseInt(limit));

    console.log(`📊 Found ${messages.length} messages`);

    // Mark messages as read for this user
    try {
      await Message.markChatAsRead(
        'private',
        sharedRoomId,
        req.user.id
      );
    } catch (markError) {
      console.log('⚠️ Mark read error (non-critical):', markError.message);
    }

    const otherUser = connection.participant._id.toString() === req.user.id
      ? connection.otherUser
      : connection.participant;

    // An owner-invite card's accept/decline buttons need to reflect
    // whether it's actually been responded to. POST /accept-owner-invite
    // and /decline-owner-invite stamp systemMessage.data.responseStatus
    // directly onto the message when they know its id - trust that over
    // re-deriving status from Event.admins/ownerInviteDeclinedBy, which
    // is fragile if this event/group's name is shared by more than one
    // document or admin status later changes for an unrelated reason
    // (e.g. stepping down). Older cards from before that existed fall
    // back to the Event-based check.
    const ownerInviteMessages = messages.filter(m => m.systemMessage?.type === 'owner_invite');
    const legacyOwnerInviteMessages = ownerInviteMessages.filter(m => !m.systemMessage.data.responseStatus);
    if (legacyOwnerInviteMessages.length) {
      const invitedEventIds = [...new Set(legacyOwnerInviteMessages.map(m => m.systemMessage.data.eventId?.toString()))];
      const invitedEvents = await Event.find({ _id: { $in: invitedEventIds } })
        .select('admins ownerInviteDeclinedBy');
      const invitedEventsById = new Map(invitedEvents.map(e => [e._id.toString(), e]));

      for (const message of legacyOwnerInviteMessages) {
        const invitedEvent = invitedEventsById.get(message.systemMessage.data.eventId?.toString());
        const invitedUserId = message.systemMessage.data.invitedUserId?.toString();
        let status = 'pending';
        if (invitedEvent && invitedUserId) {
          if (invitedEvent.admins.some(id => id.toString() === invitedUserId)) {
            status = 'accepted';
          } else if (invitedEvent.ownerInviteDeclinedBy.some(id => id.toString() === invitedUserId)) {
            status = 'declined';
          }
        }
        message.systemMessage.data.status = status;
      }
    }
    for (const message of ownerInviteMessages) {
      if (message.systemMessage.data.responseStatus) {
        message.systemMessage.data.status = message.systemMessage.data.responseStatus;
      }
    }

    res.json({
      success: true,
      data: messages.reverse(), // Return in chronological order
      chatInfo: {
        otherUser: {
          _id: otherUser._id,
          name: otherUser.name,
          photos: otherUser.photos
        },
        chatRoomId: sharedRoomId, // Use shared room ID for new messages
        connectionId: req.params.connectionId,
        isBlocked: connection.chatParticipation.isBlocked
      }
    });

  } catch (error) {
    console.error('❌ Error getting private messages:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/messages/read
// @desc    Mark messages as read
// @access  Private
router.post('/read', [protect,
  body('chatType').isIn(['event', 'group', 'private']).withMessage('Valid chat type required'),
  body('chatId').notEmpty().withMessage('Chat ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { chatType, chatId } = req.body;

    await Message.markChatAsRead(chatType, chatId, req.user.id);

    res.json({
      success: true,
      message: 'Messages marked as read'
    });

  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/messages/unread-count
// @desc    Get unread message counts for all chats
// @access  Private
router.get('/unread-count', protect, async (req, res) => {
  try {
    // chatParticipation.unreadCount is never incremented by anything -
    // compute real counts from Message's own readBy tracking instead,
    // same as GET /participations and GET /private-connections do.
    const participations = await Participation.find({
      participant: req.user.id,
      status: 'accepted',
      isArchived: false
    }).populate('event', 'type');

    const eventUnread = (await Promise.all(participations.map(p => {
      if (!p.event) return 0;
      const chatId = `${p.event.type}-${p.event._id}`;
      return Message.getUnreadCount(p.event.type, chatId, req.user.id, p.acceptedAt);
    }))).reduce((total, count) => total + count, 0);

    // Get private chat unread counts
    const privateConnections = await PrivateConnection.find({
      $or: [{ participant: req.user.id }, { otherUser: req.user.id }],
      status: 'accepted',
      isArchived: false,
      'chatParticipation.isBlocked': false
    });

    const privateUnread = (await Promise.all(privateConnections.map(c => {
      const uids = [c.participant.toString(), c.otherUser.toString()].sort();
      const chatId = `private-${uids[0]}-${uids[1]}`;
      return Message.getUnreadCount('private', chatId, req.user.id);
    }))).reduce((total, count) => total + count, 0);

    res.json({
      success: true,
      data: {
        events: eventUnread,
        private: privateUnread,
        total: eventUnread + privateUnread
      }
    });

  } catch (error) {
    console.error('❌ Error getting unread counts:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;