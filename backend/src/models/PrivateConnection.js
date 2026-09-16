// backend/src/models/PrivateConnection.js - 1-on-1 Chat Access
const mongoose = require('mongoose');

const privateConnectionSchema = new mongoose.Schema({
  // User this connection belongs to
  participant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // The other user in the 1-on-1 chat
  otherUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Original event/group where these users met - null for the bot's
  // welcome/notices thread, which isn't tied to any one event or group
  // (see services/botNotice.js).
  originEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  
  // Connection status
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'blocked'],
    default: 'pending'
  },
  
  // How this connection was initiated
  initiatedBy: {
    type: String,
    enum: ['participant', 'other_user'],
    required: true
  },
  
  // Private chat invite details
  invite: {
    sentAt: {
      type: Date,
      default: Date.now
    },
    message: {
      type: String,
      maxlength: 500
    },
    acceptedAt: Date,
    expiresAt: {
      type: Date,
      default: function() {
        // Invites expire after 7 days
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
    }
  },
  
  // Private chat participation tracking
  chatParticipation: {
    hasJoinedChat: {
      type: Boolean,
      default: false
    },
    joinedChatAt: Date,
    lastReadAt: Date,
    isMuted: {
      type: Boolean,
      default: false
    },
    mutedUntil: Date,
    lastMessageAt: Date,
    // Block functionality
    isBlocked: {
      type: Boolean,
      default: false
    },
    blockedAt: Date
  },
  
  // Connection rating (how was this private chat experience)
  connectionRating: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    ratedAt: Date
  },
  
  // Archive functionality
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date
}, {
  timestamps: true
});

// Indexes for performance
privateConnectionSchema.index({ participant: 1, otherUser: 1 }, { unique: true }); // One connection per pair per direction
privateConnectionSchema.index({ participant: 1, status: 1 });
privateConnectionSchema.index({ participant: 1, 'chatParticipation.lastMessageAt': 1 });
privateConnectionSchema.index({ 'invite.expiresAt': 1 });
privateConnectionSchema.index({ originEvent: 1 });
privateConnectionSchema.index({ isArchived: 1, status: 1 });

// Virtual for checking if connection is active
privateConnectionSchema.virtual('isActive').get(function() {
  return this.status === 'accepted' && !this.isArchived && !this.chatParticipation.isBlocked;
});

// Virtual for checking if invite is still valid
privateConnectionSchema.virtual('isInviteValid').get(function() {
  return this.status === 'pending' && 
         this.invite.expiresAt > new Date() && 
         !this.isArchived;
});

// Virtual for getting chat room identifier
privateConnectionSchema.virtual('chatRoomId').get(function() {
  // Consistent room ID regardless of who initiated
  const userIds = [this.participant.toString(), this.otherUser.toString()].sort();
  return `private-${userIds[0]}-${userIds[1]}`;
});

// Method to accept the private chat invite
privateConnectionSchema.methods.acceptInvite = function() {
  if (this.status !== 'pending' || !this.isInviteValid) {
    throw new Error('Invalid invite');
  }
  
  this.status = 'accepted';
  this.invite.acceptedAt = new Date();
  return this.save();
};

// Method to join private chat
privateConnectionSchema.methods.joinChat = function() {
  this.chatParticipation.hasJoinedChat = true;
  this.chatParticipation.joinedChatAt = new Date();
  return this.save();
};

// Method to update last message time
privateConnectionSchema.methods.updateLastMessage = function() {
  this.chatParticipation.lastMessageAt = new Date();
  return this.save();
};

// Method to mute/unmute chat
privateConnectionSchema.methods.muteChat = function(until = null) {
  this.chatParticipation.isMuted = true;
  this.chatParticipation.mutedUntil = until;
  return this.save();
};

privateConnectionSchema.methods.unmuteChat = function() {
  this.chatParticipation.isMuted = false;
  this.chatParticipation.mutedUntil = null;
  return this.save();
};

// Method to block user
privateConnectionSchema.methods.blockUser = function() {
  this.chatParticipation.isBlocked = true;
  this.chatParticipation.blockedAt = new Date();
  this.status = 'blocked';
  return this.save();
};

// Method to unblock user
privateConnectionSchema.methods.unblockUser = function() {
  this.chatParticipation.isBlocked = false;
  this.chatParticipation.blockedAt = null;
  this.status = 'accepted';
  return this.save();
};

// Method to rate connection
privateConnectionSchema.methods.rateConnection = function(rating, comment = '') {
  this.connectionRating = {
    rating,
    comment,
    ratedAt: new Date()
  };
  return this.save();
};

// Static method to send private chat invite between users who met in event/group
privateConnectionSchema.statics.sendInvite = function(fromUserId, toUserId, originEventId, message = '') {
  return this.create({
    participant: toUserId, // The recipient
    otherUser: fromUserId, // The sender
    originEvent: originEventId,
    status: 'pending',
    initiatedBy: 'other_user', // From recipient's perspective, other user initiated
    invite: {
      sentAt: new Date(),
      message
    }
  });
};

// Static method to get user's private connections. A connection's
// `participant`/`otherUser` fields are fixed at creation time (recipient
// vs sender) and don't mean "me" vs "the other person" - querying by
// `participant` alone missed every chat this user started themselves
// (where they're stored as `otherUser`), and populating the literal
// `otherUser` field would show the viewer their own name/photo on a
// chat they started. Query both directions, then normalize each result
// so `otherUser` always means whoever isn't the viewer.
privateConnectionSchema.statics.getUserConnections = async function(userId, status = 'accepted') {
  const connections = await this.find({
    $or: [{ participant: userId }, { otherUser: userId }],
    status: status,
    isArchived: false,
    'chatParticipation.isBlocked': false
  })
  .populate('participant', 'name photos isOnline lastActive')
  .populate('otherUser', 'name photos isOnline lastActive')
  .populate('originEvent', 'name type')
  .sort('-chatParticipation.lastMessageAt');

  return connections.map((connection) => {
    const obj = connection.toObject();
    const isViewerParticipant = connection.participant._id.toString() === userId.toString();
    obj.otherUser = isViewerParticipant ? connection.otherUser : connection.participant;
    return obj;
  });
};

// Static method to get pending invites for user
privateConnectionSchema.statics.getPendingInvites = function(userId) {
  return this.find({
    participant: userId,
    status: 'pending',
    'invite.expiresAt': { $gt: new Date() },
    isArchived: false
  })
  .populate('otherUser', 'name photos')
  .populate('originEvent', 'name type')
  .sort('-invite.sentAt');
};

// Static method to check if connection exists between two users
privateConnectionSchema.statics.connectionExists = function(user1Id, user2Id) {
  return this.findOne({
    $or: [
      { participant: user1Id, otherUser: user2Id },
      { participant: user2Id, otherUser: user1Id }
    ],
    status: { $in: ['pending', 'accepted'] },
    isArchived: false
  });
};

// Static method to create reciprocal connection when invite is accepted
privateConnectionSchema.statics.createReciprocalConnection = async function(originalConnection) {
  // Create the reciprocal connection for the sender
  return this.create({
    participant: originalConnection.otherUser,
    otherUser: originalConnection.participant,
    originEvent: originalConnection.originEvent,
    status: 'accepted',
    initiatedBy: 'participant', // From sender's perspective, they initiated
    invite: {
      sentAt: originalConnection.invite.sentAt,
      message: originalConnection.invite.message,
      acceptedAt: new Date()
    }
  });
};

// Ensure virtuals are included in JSON output
privateConnectionSchema.set('toJSON', { virtuals: true });
privateConnectionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('PrivateConnection', privateConnectionSchema);