// backend/src/models/ChatMembership.js
// Per-user read cursor for a chat, keyed by the same canonical chatId
// Message/ChatCounter use. Replaces the old per-message readBy array
// (which grew one subdocument per participant per message, and made
// unread counts a countDocuments scan per chat on every list render).
// Unread count becomes a single subtraction:
//   unreadCount = chatCounter.lastSeq - membership.lastReadSeq
const mongoose = require('mongoose');

const chatMembershipSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  chatType: {
    type: String,
    enum: ['event', 'group', 'private'],
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  lastReadSeq: {
    type: Number,
    default: 0
  },
  mutedUntil: {
    type: Date,
    default: null
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
});

chatMembershipSchema.index({ user: 1, chatId: 1 }, { unique: true });
chatMembershipSchema.index({ user: 1, chatType: 1 });

// Advance the read cursor - never moves it backwards, so an out-of-order
// ack (e.g. from a slow duplicate request) can't un-read a chat.
chatMembershipSchema.statics.markRead = function (userId, chatType, chatId, seq) {
  return this.findOneAndUpdate(
    { user: userId, chatId },
    {
      $max: { lastReadSeq: seq },
      $setOnInsert: { chatType, joinedAt: new Date() }
    },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('ChatMembership', chatMembershipSchema);
