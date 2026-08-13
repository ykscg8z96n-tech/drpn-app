// backend/src/routes/messages.js - Updated for 3-Chat System
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Participation = require('../models/Participation');
const PrivateConnection = require('../models/PrivateConnection');
const Event = require('../models/Event');
const { protect } = require('../middleware/auth');

// @route   POST /api/messages
// @desc    Send a message to any chat type (event/group/private)
// @access  Private
router.post('/', [protect,
  body('text').notEmpty().trim().isLength({ max: 1000 }).withMessage('Message text is required and must be under 1000 characters'),
  body('chatType').isIn(['event', 'group', 'private']).withMessage('Chat type must be event, group, or private'),
  body('eventId').optional().isMongoId().withMessage('Valid event ID required for event/group chats'),
  body('privateConnectionId').optional().isMongoId().withMessage('Valid private connection ID required for private chats')
], async (req, res) => {
  try {
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

    const { text, chatType, eventId, privateConnectionId } = req.body;
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
        event.type
      );

      // Update participation chat tracking (only for participants)
      if (hasParticipation) {
        await participation.updateLastMessage();
      }

      console.log(`✅ ${chatType} message sent to ${event.name} by ${accessType}`);

    } else if (chatType === 'private') {
      // Private chat message
      if (!privateConnectionId) {
        return res.status(400).json({
          success: false,
          message: 'Private connection ID required for private chats'
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

      // Create private message with shared room ID
      message = await Message.create({
        chatType: 'private',
        chatId: sharedRoomId, // Use shared room ID
        privateConnection: privateConnectionId,
        sender: req.user.id,
        text: text,
        messageType: 'text'
      });

      // Update connection chat tracking
      await connection.updateLastMessage();

      console.log('✅ Private message sent to shared room');
    }

    // Populate sender info
    await message.populate('sender', 'name photos');

    // Emit socket event
    const io = req.app.get('io');
    if (message.chatId) {
      io.to(message.chatId).emit('new-message', message);
    }

    res.status(201).json({
      success: true,
      data: message,
      message: 'Message sent successfully'
    });

  } catch (error) {
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

    // Update participation if user is participant
    if (hasParticipation) {
      try {
        await participation.markChatRead();
      } catch (partError) {
        console.log(`⚠️ Participation update error (non-critical):`, partError.message);
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

    // Find the connection the user has access to
    const connection = await PrivateConnection.findOne({
      _id: req.params.connectionId,
      $or: [
        { participant: req.user.id },
        { otherUser: req.user.id }
      ],
      status: 'accepted',
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

    // Update connection unread count
    try {
      await connection.markChatRead();
    } catch (connectionError) {
      console.log('⚠️ Connection update error (non-critical):', connectionError.message);
    }

    const otherUser = connection.participant._id.toString() === req.user.id 
      ? connection.otherUser 
      : connection.participant;

    res.json({
      success: true,
      data: messages.reverse(), // Return in chronological order
      chatInfo: {
        otherUser: {
          name: otherUser.name,
          photos: otherUser.photos
        },
        chatRoomId: sharedRoomId, // Use shared room ID for new messages
        connectionId: req.params.connectionId
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

    // Mark messages as read
    await Message.markChatAsRead(chatType, chatId, req.user.id);

    // Update participation/connection unread count
      if (chatType === 'event' || chatType === 'group') {
      // Event/Group chat message
      if (!eventId) {
        return res.status(400).json({
          success: false,
          message: 'Event ID required for event/group chats'
        });
      }

      console.log(`📨 Sending ${chatType} message to event ${eventId}, user: ${req.user.id}`);

      // Get the event to check access
      const event = await Event.findById(eventId);
      
      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      // Check if user has access - either as participant OR organizer
      let hasAccess = false;
      let accessType = '';

      // Check if user is organizer or admin
      if (event.canUserManage(req.user.id)) {
        hasAccess = true;
        accessType = 'organizer';
        console.log(`✅ User has organizer access to send message to: ${event.name}`);
      } else {
        // Check if user is a participant
        const participation = await Participation.findOne({
          event: eventId,
          participant: req.user.id,
          status: 'accepted',
          isArchived: false
        });

        if (participation) {
          hasAccess = true;
          accessType = 'participant';
          console.log(`✅ User has participant access to send message to: ${event.name}`);
          
          // Update participation chat tracking for participants
          await participation.updateLastMessage();
        }
      }

      if (!hasAccess) {
        console.log(`❌ User ${req.user.id} cannot send message to event ${eventId}`);
        return res.status(403).json({
          success: false,
          message: 'Not authorized - you must be a participant or organizer'
        });
      }

      // Create event/group message
      message = await Message.createEventMessage(
        eventId,
        req.user.id,
        text,
        event.type
      );

      console.log(`✅ ${chatType} message sent to ${event.name} by ${accessType}`);

    } else if (chatType === 'private') {
      const connectionId = chatId.replace('private-', '');
      const connection = await PrivateConnection.findOne({
        $or: [
          { participant: req.user.id, _id: connectionId },
          { otherUser: req.user.id, participant: { $ne: req.user.id } }
        ]
      });
      if (connection) {
        await connection.markChatRead();
      }
    }

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
    // Get event/group chat unread counts
    const participations = await Participation.find({
      participant: req.user.id,
      status: 'accepted',
      isArchived: false
    }).populate('event', 'name type');

    const eventUnread = participations.reduce((total, p) => {
      return total + (p.chatParticipation.unreadCount || 0);
    }, 0);

    // Get private chat unread counts
    const privateConnections = await PrivateConnection.find({
      participant: req.user.id,
      status: 'accepted',
      isArchived: false,
      'chatParticipation.isBlocked': false
    });

    const privateUnread = privateConnections.reduce((total, c) => {
      return total + (c.chatParticipation.unreadCount || 0);
    }, 0);

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