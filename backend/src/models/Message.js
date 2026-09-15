// backend/src/models/Message.js - Updated for 3-Chat System
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Chat type - determines which collection to reference
  chatType: {
    type: String,
    enum: ['event', 'group', 'private'],
    required: true
  },
  
  // Chat identifier - points to the actual chat room
  chatId: {
    type: String,
    required: true
  },
  
  // For event/group chats - reference to the event
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: function() {
      return this.chatType === 'event' || this.chatType === 'group';
    }
  },
  
  // For private chats - reference to the private connection
  privateConnection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrivateConnection',
    required: function() {
      return this.chatType === 'private';
    }
  },
  
  // Message sender
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Client-minted UUID, set before the request is sent. Lets the sender
  // match the server's broadcast echo back to its own optimistic bubble
  // (so it renders once, not twice) and makes retries idempotent - a
  // retried send reuses the same clientId, and the unique index below
  // turns a duplicate insert into a harmless no-op instead of a second
  // message. Sparse because older messages predate this field.
  clientId: {
    type: String,
    index: { unique: true, sparse: true }
  },

  // Per-chat monotonic order, allocated from ChatCounter at send time.
  // Timestamps alone aren't a safe sort/pagination key - two messages
  // can land in the same millisecond.
  seq: {
    type: Number
  },

  // Not written by anything yet - reserved so a later reply-threading
  // feature doesn't need a schema migration.
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },

  // Not written by anything yet - reserved for media-in-chat.
  attachments: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },

  // Message content
  text: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true
  },
  
  // Message type for future features
  messageType: {
    type: String,
    enum: ['text', 'image', 'system'],
    default: 'text'
  },
  
  // System message data (for join/leave notifications, etc.)
  systemMessage: {
    type: {
      type: String,
      enum: ['user_joined', 'user_left', 'event_updated', 'connection_established', 'event_invite', 'owner_invite']
    },
    data: mongoose.Schema.Types.Mixed
  },
  
  // Read status tracking for all participants
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Legacy read field for backward compatibility
  read: {
    type: Boolean,
    default: false
  },
  
  // Message timestamp
  timestamp: {
    type: Date,
    default: Date.now
  },
  
  // Edited message tracking
  edited: {
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: Date,
    originalText: String
  },
  
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'failed'],
    default: 'sent'
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
messageSchema.index({ chatType: 1, chatId: 1, timestamp: -1 });
messageSchema.index({ chatType: 1, chatId: 1, seq: 1 });
messageSchema.index({ chatType: 1, event: 1, timestamp: -1 });
messageSchema.index({ chatType: 1, privateConnection: 1, timestamp: -1 });
messageSchema.index({ sender: 1, timestamp: -1 });
messageSchema.index({ 'readBy.user': 1 });

// Virtual for getting chat room identifier
messageSchema.virtual('roomId').get(function() {
  return this.chatId;
});

// Method to mark message as read by a user
messageSchema.methods.markAsRead = function(userId) {
  // Check if user already marked as read
  const existingRead = this.readBy.find(read => read.user.toString() === userId.toString());
  
  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to check if message is read by a user
messageSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(read => read.user.toString() === userId.toString());
};

// Method to edit message
messageSchema.methods.editMessage = function(newText) {
  this.edited.originalText = this.text;
  this.text = newText;
  this.edited.isEdited = true;
  this.edited.editedAt = new Date();
  return this.save();
};

// Static method to create event/group chat message
messageSchema.statics.createEventMessage = async function(eventId, senderId, text, eventType = 'event', clientId = null) {
  const ChatCounter = require('./ChatCounter');
  const chatId = `${eventType}-${eventId}`;
  const seq = await ChatCounter.nextSeq(chatId);
  return this.create({
    chatType: eventType, // 'event' or 'group'
    chatId,
    event: eventId,
    sender: senderId,
    text: text,
    messageType: 'text',
    clientId,
    seq
  });
};

// Static method to create system message
messageSchema.statics.createSystemMessage = function(chatType, chatId, systemType, data, eventId = null, privateConnectionId = null) {
  const messageData = {
    chatType,
    chatId,
    sender: null, // System messages have no sender
    text: '', // System messages use systemMessage.data for content
    messageType: 'system',
    systemMessage: {
      type: systemType,
      data: data
    }
  };
  
  if (eventId) messageData.event = eventId;
  if (privateConnectionId) messageData.privateConnection = privateConnectionId;
  
  return this.create(messageData);
};

// Static method to get messages for event/group chat
messageSchema.statics.getEventMessages = function(eventId, eventType = 'event', limit = 50, before = null) {
  const query = {
    chatType: eventType,
    event: eventId
  };
  
  if (before) {
    query.timestamp = { $lt: before };
  }
  
  return this.find(query)
    .populate('sender', 'name photos')
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to get messages for private chat
messageSchema.statics.getPrivateMessages = function(privateConnectionId, limit = 50, before = null) {
  const query = {
    chatType: 'private',
    privateConnection: privateConnectionId
  };
  
  if (before) {
    query.timestamp = { $lt: before };
  }
  
  return this.find(query)
    .populate('sender', 'name photos')
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to get unread count for user in specific chat
messageSchema.statics.getUnreadCount = function(chatType, chatId, userId) {
  return this.countDocuments({
    chatType,
    chatId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId }
  });
};

// Static method to mark all messages as read for user in chat
messageSchema.statics.markChatAsRead = function(chatType, chatId, userId) {
  return this.updateMany(
    {
      chatType,
      chatId,
      sender: { $ne: userId },
      'readBy.user': { $ne: userId }
    },
    {
      $push: {
        readBy: {
          user: userId,
          readAt: new Date()
        }
      }
    }
  );
};

// Ensure virtuals are included in JSON output
messageSchema.set('toJSON', { virtuals: true });
messageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Message', messageSchema);