// backend/src/socket/chatAccess.js
// Shared access checks for a (chatType, chatId) pair, used by the socket
// handler so a user can't join a room or send into a chat they aren't
// actually part of. Mirrors the equivalent checks already duplicated
// across routes/messages.js and routes/events.js.
const Event = require('../models/Event');
const Participation = require('../models/Participation');
const PrivateConnection = require('../models/PrivateConnection');

// chatId for event/group chats is `${eventType}-${eventId}` (see
// Message.createEventMessage); for private chats it's the canonical
// `private-<sortedUid1>-<sortedUid2>` shared room id.
const parseEventChatId = (chatId) => {
  const match = chatId.match(/^(event|group)-(.+)$/);
  return match ? { eventType: match[1], eventId: match[2] } : null;
};

// Returns the event/group's Event doc if the user may access this chat,
// otherwise null.
const checkEventAccess = async (chatId, userId) => {
  const parsed = parseEventChatId(chatId);
  if (!parsed) return null;

  const event = await Event.findById(parsed.eventId);
  if (!event) return null;

  if (event.canUserManage(userId)) return event;

  const participation = await Participation.findOne({
    event: parsed.eventId,
    participant: userId,
    status: 'accepted',
    isArchived: false
  });

  return participation ? event : null;
};

// Returns true if the user is one of the two participants in this
// private chat's canonical room id.
const checkPrivateAccess = async (chatId, userId) => {
  if (!chatId.startsWith('private-')) return false;

  const connection = await PrivateConnection.findOne({
    $or: [{ participant: userId }, { otherUser: userId }],
    status: 'accepted',
    isArchived: false,
    'chatParticipation.isBlocked': false
  });
  if (!connection) return false;

  const uids = [connection.participant.toString(), connection.otherUser.toString()].sort();
  return chatId === `private-${uids[0]}-${uids[1]}`;
};

// Single entry point: true if userId may join/read/send in this chat.
const hasChatAccess = async (chatType, chatId, userId) => {
  if (chatType === 'event' || chatType === 'group') {
    return !!(await checkEventAccess(chatId, userId));
  }
  if (chatType === 'private') {
    return checkPrivateAccess(chatId, userId);
  }
  return false;
};

module.exports = { hasChatAccess, checkEventAccess, checkPrivateAccess, parseEventChatId };
