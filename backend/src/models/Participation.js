// backend/src/models/Participation.js - Event & Group Chat Access
const mongoose = require('mongoose');

const participationSchema = new mongoose.Schema({
  // Event or Group this participation belongs to
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  
  // User participating in the event/group
  participant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Participation status
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'cancelled'],
    default: 'accepted' // Most participations are created when organizer accepts
  },
  
  // How this participation was created
  joinMethod: {
    type: String,
    enum: ['swipe_application', 'invite_code', 'direct_invite'],
    required: true
  },
  
  // Original application details (if from swipe)
  originalApplication: {
    appliedAt: Date,
    message: String,
    isSuperSwipe: {
      type: Boolean,
      default: false
    }
  },
  
  // Invite code used (if applicable)
  inviteCodeUsed: {
    type: String,
    uppercase: true
  },
  
  // When user was accepted into event/group
  acceptedAt: {
    type: Date,
    default: Date.now
  },
  
  // Who accepted this user (organizer or admin)
  acceptedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Event/Group participation tracking
  eventParticipation: {
    checkedIn: {
      type: Boolean,
      default: false
    },
    checkedInAt: Date,
    noShow: {
      type: Boolean,
      default: false
    },
    leftEarly: {
      type: Boolean,
      default: false
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date
  },
  
  // Group chat participation tracking for THIS USER in THIS EVENT/GROUP
  chatParticipation: {
    hasJoinedChat: {
      type: Boolean,
      default: false
    },
    joinedChatAt: Date,
    lastReadAt: Date,
    unreadCount: {
      type: Number,
      default: 0
    },
    isMuted: {
      type: Boolean,
      default: false
    },
    mutedUntil: Date,
    lastMessageAt: Date // When last message was sent in this chat
  },
  
  // User rating for this specific event/group (after completion)
  eventRating: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    ratedAt: Date
  },
  
  // Admin notes about this participant
  organizerNotes: {
    type: String,
    maxlength: 500
  },
  
  // Archive functionality
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,
  
  // When participation expires (for time-sensitive events)
  expiresAt: Date
}, {
  timestamps: true
});

// Indexes for performance
participationSchema.index({ event: 1, participant: 1 }, { unique: true }); // One participation per user per event
participationSchema.index({ event: 1, status: 1 });
participationSchema.index({ participant: 1, status: 1 });
participationSchema.index({ event: 1, 'chatParticipation.hasJoinedChat': 1 });
participationSchema.index({ 'chatParticipation.unreadCount': 1 });
participationSchema.index({ 'chatParticipation.lastMessageAt': 1 });
participationSchema.index({ isArchived: 1, status: 1 });

// Virtual for checking if participation is active
participationSchema.virtual('isActive').get(function() {
  return this.status === 'accepted' && !this.isArchived;
});

// Virtual for checking if user can join event/group chat
participationSchema.virtual('canJoinChat').get(function() {
  return this.status === 'accepted' && !this.isArchived;
});

// Virtual for getting chat room identifier
participationSchema.virtual('chatRoomId').get(function() {
  // Will populate event to determine type
  return `${this.event.type}-${this.event._id}`;
});

// Method to mark user as checked in to event/group
participationSchema.methods.checkIn = function() {
  this.eventParticipation.checkedIn = true;
  this.eventParticipation.checkedInAt = new Date();
  this.eventParticipation.noShow = false;
  return this.save();
};

// Method to mark user as no-show
participationSchema.methods.markNoShow = function() {
  this.eventParticipation.noShow = true;
  this.eventParticipation.checkedIn = false;
  return this.save();
};

// Method to complete event/group participation
participationSchema.methods.completeEvent = function() {
  this.eventParticipation.completed = true;
  this.eventParticipation.completedAt = new Date();
  return this.save();
};

// Method to join event/group chat
participationSchema.methods.joinChat = function() {
  this.chatParticipation.hasJoinedChat = true;
  this.chatParticipation.joinedChatAt = new Date();
  return this.save();
};

// Method to update unread count
participationSchema.methods.updateUnreadCount = function(count) {
  this.chatParticipation.unreadCount = Math.max(0, count);
  return this.save();
};

// Method to mark chat as read
participationSchema.methods.markChatRead = function() {
  this.chatParticipation.lastReadAt = new Date();
  this.chatParticipation.unreadCount = 0;
  return this.save();
};

// Method to update last message time
participationSchema.methods.updateLastMessage = function() {
  this.chatParticipation.lastMessageAt = new Date();
  return this.save();
};

// Method to mute/unmute chat
participationSchema.methods.muteChat = function(until = null) {
  this.chatParticipation.isMuted = true;
  this.chatParticipation.mutedUntil = until;
  return this.save();
};

participationSchema.methods.unmuteChat = function() {
  this.chatParticipation.isMuted = false;
  this.chatParticipation.mutedUntil = null;
  return this.save();
};

// Method to rate event/group
participationSchema.methods.rateEvent = function(rating, comment = '') {
  this.eventRating = {
    rating,
    comment,
    ratedAt: new Date()
  };
  return this.save();
};

// Static method to get all participants for an event/group (for group chat)
participationSchema.statics.getEventParticipants = function(eventId) {
  return this.find({
    event: eventId,
    status: 'accepted',
    isArchived: false
  }).populate('participant', 'name photos isOnline lastActive');
};

// Static method to get user's active events/groups
participationSchema.statics.getUserActiveParticipations = function(userId, eventType = null) {
  const query = {
    participant: userId,
    status: 'accepted',
    isArchived: false
  };
  
  let populateQuery = {
    path: 'event',
    populate: {
      path: 'organizer',
      select: 'name photos'
    }
  };
  
  // Filter by event type if specified
  if (eventType === 'event' || eventType === 'group') {
    populateQuery.match = { type: eventType };
  }
  
  return this.find(query)
    .populate(populateQuery)
    .sort('-chatParticipation.lastMessageAt');
};

// Static method to create participation from accepted application
participationSchema.statics.createFromApplication = function(eventId, userId, acceptedBy, applicationData) {
  return this.create({
    event: eventId,
    participant: userId,
    status: 'accepted',
    joinMethod: 'swipe_application',
    acceptedBy: acceptedBy,
    originalApplication: applicationData,
    acceptedAt: new Date()
  });
};

// Ensure virtuals are included in JSON output
participationSchema.set('toJSON', { virtuals: true });
participationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Participation', participationSchema);