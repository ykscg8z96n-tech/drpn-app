// backend/src/services/botNotice.js
//
// Shared private-messaging helpers used anywhere the app needs to reach a
// specific user outside their normal event/group chats - system notices
// ("you were removed", "the organizer cancelled this"), and the bot's own
// persistent welcome/rules thread. Pulled out of routes/events.js so
// routes/auth.js can send the welcome message at signup instead of only
// lazily the first time some other notice happens to fire.
const Message = require('../models/Message');
const ChatCounter = require('../models/ChatCounter');
const PrivateConnection = require('../models/PrivateConnection');
const User = require('../models/User');
const { getBotUserId } = require('./botUser');
const { sendPushToUser } = require('./webPush');
const { isUserOnline } = require('../socket/socketHandler');

// Finds or creates an accepted PrivateConnection between two users,
// bypassing POST /private-connections/invite's "both users must be
// participants in the same event" check - the caller already knows
// they're both tied to the same event/group (roster membership,
// organizer/owner relationship), which is a stronger guarantee than
// that check makes anyway.
async function getOrCreatePrivateConnection(fromUserId, toUserId, originEventId) {
  let connection = await PrivateConnection.findOne({
    $or: [
      { participant: fromUserId, otherUser: toUserId },
      { participant: toUserId, otherUser: fromUserId }
    ]
  });
  if (!connection) {
    connection = await PrivateConnection.create({
      participant: toUserId,
      otherUser: fromUserId,
      originEvent: originEventId,
      status: 'accepted',
      initiatedBy: 'other_user',
      invite: { sentAt: new Date(), acceptedAt: new Date() }
    });
  } else if (connection.status !== 'accepted') {
    connection.status = 'accepted';
    connection.invite.acceptedAt = new Date();
    await connection.save();
  }
  return connection;
}

// A card/notification's recipient only needs a push if they don't
// already have a live socket connection that'll show it in real time -
// mirrors the same check in socketHandler.js's message:send.
async function pushIfOffline(userId, payload) {
  if (isUserOnline(userId)) return;
  try {
    await sendPushToUser(userId, payload);
  } catch (error) {
    console.error('⚠️ Push notify failed:', error);
  }
}

// A plain-text private message from one user to another, outside the
// normal send flow - used for system-initiated notices like "you were
// removed from this event" that need to reach a specific person
// directly rather than the event/group's shared chat.
async function postPrivateNotification(fromUserId, toUserId, originEventId, text, req) {
  const connection = await getOrCreatePrivateConnection(fromUserId, toUserId, originEventId);

  const uids = [fromUserId.toString(), toUserId.toString()].sort();
  const chatId = `private-${uids[0]}-${uids[1]}`;
  const seq = await ChatCounter.nextSeq(chatId);
  const message = await Message.create({
    chatType: 'private',
    chatId,
    privateConnection: connection._id,
    sender: fromUserId,
    text,
    messageType: 'text',
    seq
  });
  await message.populate('sender', 'name photos');

  const io = req.app.get('io');
  if (io) {
    io.to(`${message.chatType}:${message.chatId}`).emit('message:new', message);
  }
  await pushIfOffline(toUserId, { title: message.sender?.name || 'DRPN', body: text, url: '/' });
}

// A single persistent bot<->user DM per person, reused for every system
// notice that doesn't belong in any specific event/group chat (an event
// closing early, a group closing, etc) - rather than a one-off private
// chat per notice. getOrCreatePrivateConnection already dedupes by the
// participant pair, so every call here lands in the same thread. The
// first time this fires for a given user, it leads with a welcome +
// rules/verification/premium message, so that context exists before
// the first "orphaned" notice ever shows up with nothing above it.
async function sendBotNotice(toUserId, text, req) {
  const botId = await getBotUserId();
  await ensureWelcomeSent(botId, toUserId, req);
  if (text) {
    await postPrivateNotification(botId, toUserId, null, text, req);
  }
}

async function ensureWelcomeSent(botId, toUserId, req) {
  const uids = [botId.toString(), toUserId.toString()].sort();
  const chatId = `private-${uids[0]}-${uids[1]}`;
  const existingCount = await Message.countDocuments({ chatType: 'private', chatId });
  if (existingCount > 0) return;
  await postPrivateNotification(
    botId,
    toUserId,
    null,
    "Welcome to DRPN! A few quick things:\n\n" +
    "• Be respectful - no harassment, spam, or scams. Violations can get you removed from events, groups, or the app.\n" +
    "• Get Verified from your Profile to build trust with organizers.\n" +
    "• Upgrade to Premium for extra super-swipes and rewinds.\n\n" +
    "I'll drop a note here any time something changes with an event or group you're part of - like an organizer cancelling one.",
    req
  );
}

// Called right after a new account is created so the welcome/rules
// message is there from the very first time someone opens the app,
// instead of only appearing the first time some unrelated notice
// happens to fire.
async function sendWelcomeMessage(toUserId, req) {
  const botId = await getBotUserId();
  await ensureWelcomeSent(botId, toUserId, req);
}

// Posted whenever one user blocks/unblocks/mutes/unmutes another (see
// routes/users.js's /block/:userId and routes/private-connections.js's
// /:id/block - block and mute are the same underlying action under
// different button labels, so both funnel here). Two things happen:
//  1. If the two users already have a private chat, a note goes there
//     too (visible to both, same as the "conversation is blocked"
//     banner already shown) - only into a chat that already exists,
//     never one created just for this.
//  2. The actor always also gets the same note in their own DRPN bot
//     DM, as a standing record of moderation actions they've taken.
// Non-fatal by design (callers wrap this in try/catch) - the block/mute
// itself already succeeded by the time this runs.
async function postModerationNotice(actorId, targetId, verb, req) {
  const [actor, target] = await Promise.all([
    User.findById(actorId).select('name'),
    User.findById(targetId).select('name'),
  ]);
  const text = `${actor?.name || 'A user'} ${verb} ${target?.name || 'a user'}.`;

  const connection = await PrivateConnection.findOne({
    $or: [
      { participant: actorId, otherUser: targetId },
      { participant: targetId, otherUser: actorId }
    ]
  });
  if (connection) {
    const botId = await getBotUserId();
    const uids = [actorId.toString(), targetId.toString()].sort();
    const chatId = `private-${uids[0]}-${uids[1]}`;
    const seq = await ChatCounter.nextSeq(chatId);
    const message = await Message.create({
      chatType: 'private',
      chatId,
      privateConnection: connection._id,
      sender: botId,
      text,
      messageType: 'text',
      seq
    });
    await message.populate('sender', 'name photos');
    const io = req.app.get('io');
    if (io) {
      io.to(`${message.chatType}:${message.chatId}`).emit('message:new', message);
    }
  }

  await sendBotNotice(actorId, text, req);
}

// A plain-text bot announcement into an event/group's own chat - "X
// joined", "X is now an owner", "X stepped down", "X was removed".
// Non-fatal by design (callers wrap this in try/catch): the roster
// change itself already succeeded by the time this runs, so a failure
// posting the announcement shouldn't undo or fail that.
async function postSystemAnnouncement(event, text, req) {
  const botId = await getBotUserId();
  const message = await Message.createEventMessage(event._id, botId, text, event.type);
  await message.populate('sender', 'name photos');
  const io = req.app.get('io');
  if (io) {
    io.to(`${message.chatType}:${message.chatId}`).emit('message:new', message);
  }
}

module.exports = {
  getOrCreatePrivateConnection,
  pushIfOffline,
  postPrivateNotification,
  sendBotNotice,
  sendWelcomeMessage,
  postSystemAnnouncement,
  postModerationNotice
};
