// backend/src/models/User.js - FINAL CLEANED VERSION FOR DRPN
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic user info
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  birthDate: {
    type: Date
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  age: {
    type: Number,
    min: 18
    // Removed required: true to make age optional
  },
  bio: {
    type: String,
    maxlength: 500
  },
  photos: [{
    url: String,
    publicId: String,
    isPrimary: Boolean
  }],
  
  // Location for finding nearby events
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: String,
    city: String,
    state: String
  },
  
  // User type and permissions
  isOrganizer: {
    type: Boolean,
    default: false
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  premiumExpiresAt: {
    type: Date
  },
  
  // Event-specific tracking
  eventsJoined: [{
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'completed'],
      default: 'pending'
    }
  }],
  
  eventsOrganized: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  
  // Swipe tracking (for events only)
  swipes: [{
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event', // Only events, not users
      required: true
    },
    action: {
      type: String,
      enum: ['like', 'pass', 'super_like'],
      required: true
    },
    swipedAt: {
      type: Date,
      default: Date.now
    },
    message: String // Optional message when applying to event
  }],
  
  // App settings and preferences
  searchRadius: {
    type: Number,
    default: 25, // kilometers
    min: 1,
    max: 100
  },
  settings: {
    notifications: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    },
    privacy: {
      showAge: { type: Boolean, default: true },
      showLocation: { type: Boolean, default: true }
    }
  },
  
  // Premium features usage
  premium: {
    superLikesUsed: { type: Number, default: 0 },
    rewindsUsed: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now }
  },
  
  // User reputation and safety
  reputation: {
    score: { type: Number, default: 5.0, min: 0, max: 5 },
    totalRatings: { type: Number, default: 0 },
    eventCompletionRate: { type: Number, default: 0 }
  },
  
  // Account status
  isVerified: {
    type: Boolean,
    default: false
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: String,
  lastActive: {
    type: Date,
    default: Date.now
  },
  
  // Device and session info
  deviceInfo: {
    platform: String,
    version: String,
    deviceId: String
  }
}, {
  timestamps: true
});

// Create geospatial index for location
userSchema.index({ location: '2dsphere' });

// Index for search optimization
userSchema.index({ email: 1 });
userSchema.index({ isOrganizer: 1 });
userSchema.index({ lastActive: -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Calculate reputation score
userSchema.methods.updateReputation = function() {
  // Simple reputation calculation based on event completion
  const completedEvents = this.eventsJoined.filter(event => event.status === 'completed').length;
  const totalEvents = this.eventsJoined.length;
  
  if (totalEvents > 0) {
    this.reputation.eventCompletionRate = (completedEvents / totalEvents) * 100;
  }
  
  // Base score starts at 5.0, adjustments based on behavior
  let score = 5.0;
  
  // Boost for high completion rate
  if (this.reputation.eventCompletionRate > 80) {
    score += 0.5;
  } else if (this.reputation.eventCompletionRate < 50 && totalEvents > 3) {
    score -= 1.0;
  }
  
  // Cap between 0 and 5
  this.reputation.score = Math.max(0, Math.min(5, score));
};

// Reset premium usage limits daily
userSchema.methods.resetPremiumLimits = function() {
  const today = new Date();
  const lastReset = this.premium.lastResetDate;
  
  // Check if it's a new day
  if (today.toDateString() !== lastReset.toDateString()) {
    this.premium.superLikesUsed = 0;
    this.premium.rewindsUsed = 0;
    this.premium.lastResetDate = today;
  }
};

// Check if user can use super like
userSchema.methods.canUseSuperLike = function() {
  this.resetPremiumLimits();
  
  if (this.isPremium) {
    return true; // Unlimited for premium users
  }
  
  return this.premium.superLikesUsed < 1; // 1 free per day
};

// Check if user can use rewind
userSchema.methods.canUseRewind = function() {
  this.resetPremiumLimits();
  
  if (this.isPremium) {
    return this.premium.rewindsUsed < 5; // 5 per day for premium
  }
  
  return false; // No rewinds for free users
};

// Get user's recent swipes (for preventing duplicates)
userSchema.methods.getRecentSwipes = function(days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return this.swipes.filter(swipe => swipe.swipedAt >= cutoffDate);
};

// Method to check if user has swiped on an event
userSchema.methods.hasSwipedOnEvent = function(eventId) {
  return this.swipes.some(swipe => 
    swipe.targetId && swipe.targetId.toString() === eventId.toString()
  );
};

// Method to add a swipe
userSchema.methods.addSwipe = function(eventId, action) {
  // Remove any existing swipe on this event (shouldn't happen, but safety check)
  this.swipes = this.swipes.filter(swipe => 
    !(swipe.targetId && swipe.targetId.toString() === eventId.toString())
  );
  
  // Add new swipe
  this.swipes.push({
    targetId: eventId,
    targetType: 'event',
    action,
    swipedAt: new Date()
  });
};

// Method to check if user has applied to an event
userSchema.methods.hasAppliedToEvent = function(eventId) {
  return this.eventsJoined.some(event => 
    event.eventId && event.eventId.toString() === eventId.toString()
  );
};

module.exports = mongoose.model('User', userSchema);