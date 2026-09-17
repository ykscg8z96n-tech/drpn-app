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
  // Hashed reset token + expiry for the forgot-password email flow.
  // The raw token is only ever emailed to the user, never stored.
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
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
  isAdmin: {
    type: Boolean,
    default: false
  },

  // Expo push tokens, one per device this account is signed into. Used
  // to notify a user of a new message when they have no live socket
  // connection to receive it over (app backgrounded/closed).
  pushTokens: [{
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android', 'web'] },
    updatedAt: { type: Date, default: Date.now }
  }],
  // Web Push subscriptions (browser/PWA push, via the Push API) - a
  // different shape than pushTokens above (which was sized for Expo's
  // native push tokens, unused so far since testing has been entirely
  // through the web app rather than an installed native build).
  webPushSubscriptions: [{
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    },
    createdAt: { type: Date, default: Date.now }
  }],
  isPremium: {
    type: Boolean,
    default: false
  },
  // Set the first time POST /users/premium-trial succeeds, so the
  // one-time free trial can't just be reclaimed once it lapses.
  premiumTrialUsedAt: {
    type: Date
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

// Hash password before saving. The missing `return` here used to be a
// severe bug: every save() of a user document - not just ones that
// changed the password - fell through into re-hashing whatever was
// already in `password` (an existing bcrypt hash) as if it were
// plaintext. Since login itself calls user.save() (to update
// lastActive), an account's password got silently corrupted the moment
// after its first successful login, locking the user out permanently
// even with the correct password.
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
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

// Super like is premium-only - no free daily allowance.
userSchema.methods.canUseSuperLike = function() {
  return this.isPremium && this.premiumExpiresAt && new Date(this.premiumExpiresAt) > new Date();
};

// Rewind is also premium-only, capped at 5/day even for premium.
userSchema.methods.canUseRewind = function() {
  const hasPremium = this.isPremium && this.premiumExpiresAt && new Date(this.premiumExpiresAt) > new Date();
  if (!hasPremium) return false;
  this.resetPremiumLimits();
  return this.premium.rewindsUsed < 5;
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

// A 'pass' swipe is also how leaving or getting kicked from an event/group
// is recorded (see routes/events.js's leave and kick routes) - it's the
// one signal that already exists for "don't show this to me/let me back
// in again", so the group-invite quick-join and invite-code join routes
// check this too, not just the swipe feed's own exclusion query.
userSchema.methods.hasPassedEvent = function(eventId) {
  return this.swipes.some(swipe =>
    swipe.targetId && swipe.targetId.toString() === eventId.toString() && swipe.action === 'pass'
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