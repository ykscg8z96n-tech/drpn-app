// backend/src/models/Event.js - FINAL CLEAN VERSION FOR DRPN
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  // Basic event info
  type: {
    type: String,
    enum: ['event', 'group'],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  photos: [{
    url: String,
    publicId: String
  }],
  
  // Location (required for all events)
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
  
  // Single category (no user preferences needed)
  category: {
    type: String,
    enum: ['tabletop', 'cards', 'fantasy', 'sports', 'golf', 'health'],
    required: true
  },
  
  // Event specific fields
  eventDate: {
    type: Date,
    required: function() { return this.type === 'event'; }
  },
  capacity: {
    type: Number,
    required: function() { return this.type === 'event'; }
  },
  currentAttendees: {
    type: Number,
    default: 0
  },
  
  // Group specific fields
  groupSize: {
    type: Number,
    required: function() { return this.type === 'group'; }
  },
  meetingFrequency: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly', 'varies'],
    required: function() { return this.type === 'group'; }
  },
  
  // Organizer and admin management
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Status fields
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  },
  archivedAt: {
    type: Date
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  
  // REMOVED: ageRange, genderPreference (dating-specific)
  // REMOVED: complex interests array (replaced with single category)
  
  // Tags for additional filtering (optional, supplements category)
  tags: [{
    type: String,
    trim: true
  }],
  
  // Applicant management (core DRPN functionality)
  applicants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    appliedAt: {
      type: Date,
      default: Date.now
    },
    respondedAt: {
      type: Date
    },
    message: {
      type: String,
      maxlength: 500
    },
    isSuperSwipe: {
      type: Boolean,
      default: false
    },
    inviteCode: {
      type: String,
      uppercase: true // Track which invite code was used
    },
    // Response from organizer
    organizerResponse: {
      type: String,
      maxlength: 500
    }
  }],
  
  // Invite codes for direct joining
  inviteCodes: [{
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    deactivatedAt: {
      type: Date
    },
    usedBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      usedAt: {
        type: Date,
        default: Date.now
      }
    }],
    maxUses: {
      type: Number,
      default: null // null means unlimited
    }
  }],
  
  // Simple rating system (post-event feedback)
  ratings: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  
  // Premium features for organizers
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringSchedule: {
    frequency: String, // 'weekly', 'monthly'
    dayOfWeek: Number, // 0-6
    time: String // "19:00"
  },
  boostLevel: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  }
}, {
  timestamps: true // This adds createdAt and updatedAt automatically
});

// Indexes for performance
eventSchema.index({ location: '2dsphere' });
eventSchema.index({ eventDate: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ 'applicants.userId': 1 });
eventSchema.index({ organizer: 1, isArchived: 1 });
eventSchema.index({ organizer: 1, isActive: 1, isArchived: 1 });
eventSchema.index({ 'inviteCodes.code': 1, 'inviteCodes.isActive': 1 });
eventSchema.index({ isPublic: 1, isActive: 1, isArchived: 1 });
eventSchema.index({ type: 1, isPublic: 1, isActive: 1 });

// Pre-save middleware to update timestamps
eventSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Calculate average rating before saving
eventSchema.pre('save', function(next) {
  if (this.ratings.length > 0) {
    const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
    this.averageRating = sum / this.ratings.length;
  }
  next();
});

// Virtual for getting pending applications
eventSchema.virtual('pendingApplications').get(function() {
  return this.applicants ? this.applicants.filter(app => app.status === 'pending') : [];
});

// Virtual for getting accepted applications
eventSchema.virtual('acceptedApplications').get(function() {
  return this.applicants ? this.applicants.filter(app => app.status === 'accepted') : [];
});

// Virtual for getting rejected applications
eventSchema.virtual('rejectedApplications').get(function() {
  return this.applicants ? this.applicants.filter(app => app.status === 'rejected') : [];
});

// Virtual for getting active invite codes
eventSchema.virtual('activeInviteCodes').get(function() {
  return this.inviteCodes ? this.inviteCodes.filter(code => code.isActive) : [];
});

// Method to check if user has applied
eventSchema.methods.hasUserApplied = function(userId) {
  return this.applicants.some(app => app.userId.toString() === userId.toString());
};

// Method to get user's application status
eventSchema.methods.getUserApplicationStatus = function(userId) {
  const application = this.applicants.find(app => app.userId.toString() === userId.toString());
  return application ? application.status : null;
};

// Method to accept applicant and create chat access
eventSchema.methods.acceptApplicant = function(userId, organizerId, response = '') {
  const application = this.applicants.find(app => app.userId.toString() === userId.toString());
  if (!application) {
    throw new Error('Application not found');
  }
  
  if (application.status !== 'pending') {
    throw new Error('Application already processed');
  }
  
  application.status = 'accepted';
  application.respondedAt = new Date();
  application.organizerResponse = response;
  
  return this.save();
};

// Method to reject applicant
eventSchema.methods.rejectApplicant = function(userId, organizerId, response = '') {
  const application = this.applicants.find(app => app.userId.toString() === userId.toString());
  if (!application) {
    throw new Error('Application not found');
  }
  
  if (application.status !== 'pending') {
    throw new Error('Application already processed');
  }
  
  application.status = 'rejected';
  application.respondedAt = new Date();
  application.organizerResponse = response;
  
  return this.save();
};

// Method to check if user is organizer or admin
eventSchema.methods.canUserManage = function(userId) {
  return this.organizer.toString() === userId.toString() || 
         this.admins.some(adminId => adminId.toString() === userId.toString());
};

// Method to generate unique invite code
eventSchema.methods.generateInviteCode = function(createdBy) {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  this.inviteCodes.push({
    code,
    createdBy,
    isActive: true,
    usedBy: []
  });
  
  return code;
};

// Method to deactivate invite code
eventSchema.methods.deactivateInviteCode = function(code) {
  const inviteCode = this.inviteCodes.find(ic => ic.code === code && ic.isActive);
  if (inviteCode) {
    inviteCode.isActive = false;
    inviteCode.deactivatedAt = new Date();
    return true;
  }
  return false;
};

// Method to check if invite code is valid
eventSchema.methods.isInviteCodeValid = function(code) {
  return this.inviteCodes.some(ic => ic.code === code.toUpperCase() && ic.isActive);
};

// Method to use invite code
eventSchema.methods.useInviteCode = function(code, userId) {
  const inviteCode = this.inviteCodes.find(ic => ic.code === code.toUpperCase() && ic.isActive);
  if (inviteCode) {
    inviteCode.usedBy.push({
      userId,
      usedAt: new Date()
    });
    
    // Check if maxUses is reached
    if (inviteCode.maxUses && inviteCode.usedBy.length >= inviteCode.maxUses) {
      inviteCode.isActive = false;
      inviteCode.deactivatedAt = new Date();
    }
    
    return true;
  }
  return false;
};

// Ensure virtuals are included in JSON output
eventSchema.set('toJSON', { virtuals: true });
eventSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Event', eventSchema);