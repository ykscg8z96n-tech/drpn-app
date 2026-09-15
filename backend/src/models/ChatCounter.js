// backend/src/models/ChatCounter.js
// One monotonic sequence counter per chat room, keyed by the same
// canonical chatId string every chat type already computes
// (`${eventType}-${eventId}` for event/group, `private-<sortedUid1>-<sortedUid2>`
// for private - see Message.createEventMessage and the shared-room-id
// logic in routes/messages.js and PrivateConnection.chatRoomId).
//
// Lives in its own collection rather than a field on Event or
// PrivateConnection because a private chat is represented by TWO
// PrivateConnection documents (one per participant's direction -
// see PrivateConnection.createReciprocalConnection) sharing one
// canonical room; a counter field on either document would drift out
// of sync with the other. A single row per chatId sidesteps that.
const mongoose = require('mongoose');

const chatCounterSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true
  },
  lastSeq: {
    type: Number,
    default: 0
  }
});

// Atomically allocate the next sequence number for a chat. Upserts on
// first use, so no separate "create the counter" step is needed.
chatCounterSchema.statics.nextSeq = async function (chatId) {
  const doc = await this.findOneAndUpdate(
    { chatId },
    { $inc: { lastSeq: 1 } },
    { new: true, upsert: true }
  );
  return doc.lastSeq;
};

module.exports = mongoose.model('ChatCounter', chatCounterSchema);
