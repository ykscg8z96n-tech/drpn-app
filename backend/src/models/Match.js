// backend/src/models/Match.js
const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  individual: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  acceptedAt: {
    type: Date,
    default: Date.now
  },
  chatEnabled: {
    type: Boolean,
    default: true
  },
  lastMessageAt: Date,
  unreadCount: {
    individual: {
      type: Number,
      default: 0
    },
    organizer: {
      type: Number,
      default: 0
    }
  }
});

// Compound index to ensure unique matches
matchSchema.index({ individual: 1, event: 1 }, { unique: true });

module.exports = mongoose.model('Match', matchSchema);