// backend/src/models/Report.js - User-submitted reports of bad behavior
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Where this happened, if applicable (a private chat, an event/group chat)
  context: {
    type: String,
    enum: ['private_chat', 'event_chat', 'group_chat', 'other'],
    default: 'other'
  },
  contextId: {
    type: mongoose.Schema.Types.ObjectId
  },
  reason: {
    type: String,
    enum: ['harassment', 'spam', 'inappropriate_content', 'safety_concern', 'other'],
    required: true
  },
  details: {
    type: String,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['open', 'reviewed', 'dismissed'],
    default: 'open'
  }
}, {
  timestamps: true
});

reportSchema.index({ reportedUser: 1, status: 1 });
reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
