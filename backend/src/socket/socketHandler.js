// backend/src/socket/socketHandler.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const ChatCounter = require('../models/ChatCounter');
const Participation = require('../models/Participation');
const { hasChatAccess, checkEventAccess, getPrivateConnection } = require('./chatAccess');
const { sendPushToUser } = require('../services/webPush');

// userId -> { socketId, user, connectedAt }. Fine for a single instance;
// scaling to a second instance needs this behind the Socket.IO Redis
// adapter instead (this Map only exists on one process).
const connectedUsers = new Map();

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token provided'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return next(new Error('User not found'));

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
};

const chatRoom = (chatType, chatId) => `${chatType}:${chatId}`;

const handleConnection = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });

    // Personal room, for future direct-to-user pushes (e.g. "you were
    // accepted") independent of any chat room.
    socket.join(socket.userId);

    socket.emit('connection-confirmed', { userId: socket.userId, timestamp: new Date() });

    socket.on('chat:join', async ({ chatType, chatId } = {}) => {
      try {
        if (!chatType || !chatId) return;
        const allowed = await hasChatAccess(chatType, chatId, socket.userId);
        if (!allowed) {
          socket.emit('message:error', { reason: 'Not authorized for this chat' });
          return;
        }
        socket.join(chatRoom(chatType, chatId));
      } catch (error) {
        console.error('chat:join error:', error);
      }
    });

    socket.on('chat:leave', ({ chatType, chatId } = {}) => {
      if (!chatType || !chatId) return;
      socket.leave(chatRoom(chatType, chatId));
    });

    socket.on('message:send', async ({ chatType, chatId, clientId, text } = {}) => {
      try {
        if (!chatType || !chatId || !text || !text.trim()) {
          socket.emit('message:error', { clientId, reason: 'Invalid message' });
          return;
        }

        // A retried send reuses the same clientId - return the existing
        // message instead of creating a duplicate.
        if (clientId) {
          const existing = await Message.findOne({ clientId }).populate('sender', 'name photos');
          if (existing) {
            socket.emit('message:ack', {
              clientId,
              _id: existing._id,
              seq: existing.seq,
              createdAt: existing.createdAt
            });
            return;
          }
        }

        let message;

        if (chatType === 'event' || chatType === 'group') {
          const event = await checkEventAccess(chatId, socket.userId);
          if (!event) {
            socket.emit('message:error', { clientId, reason: 'Not authorized for this chat' });
            return;
          }

          const seq = await ChatCounter.nextSeq(chatId);
          message = await Message.create({
            chatType,
            chatId,
            event: event._id,
            sender: socket.userId,
            text: text.trim(),
            messageType: 'text',
            clientId,
            seq
          });

          const participation = await Participation.findOne({
            event: event._id,
            participant: socket.userId,
            status: 'accepted',
            isArchived: false
          });
          if (participation) await participation.updateLastMessage();
        } else if (chatType === 'private') {
          const connection = await getPrivateConnection(chatId, socket.userId);
          if (!connection) {
            socket.emit('message:error', { clientId, reason: 'Not authorized for this chat' });
            return;
          }

          const seq = await ChatCounter.nextSeq(chatId);
          message = await Message.create({
            chatType: 'private',
            chatId,
            privateConnection: connection._id,
            sender: socket.userId,
            text: text.trim(),
            messageType: 'text',
            clientId,
            seq
          });

          await connection.updateLastMessage();
        } else {
          socket.emit('message:error', { clientId, reason: 'Unknown chat type' });
          return;
        }

        await message.populate('sender', 'name photos');

        socket.emit('message:ack', {
          clientId,
          _id: message._id,
          seq: message.seq,
          createdAt: message.createdAt
        });
        io.to(chatRoom(chatType, chatId)).emit('message:new', message);

        // Push notify anyone who isn't actively connected to receive this
        // over the socket - that's the entire point of push (reaching
        // someone whose app is backgrounded/closed), not a broadcast to
        // everyone regardless of whether they're already looking at it.
        const senderName = message.sender?.name || 'Someone';
        const preview = text.trim().length > 120 ? `${text.trim().slice(0, 117)}...` : text.trim();
        if (chatType === 'event' || chatType === 'group') {
          const participants = await Participation.getEventParticipants(message.event);
          const recipientIds = participants
            .map(p => (p.participant?._id || p.participant)?.toString())
            .filter(id => id && id !== socket.userId && !isUserOnline(id));
          recipientIds.forEach(id => {
            sendPushToUser(id, {
              title: `${senderName} in ${message.chatId.split('-')[0] === 'group' ? 'your group' : 'your event'}`,
              body: preview,
              url: '/'
            }).catch(err => console.error('⚠️ Push notify (event) failed:', err));
          });
        } else if (chatType === 'private') {
          const connection = await getPrivateConnection(chatId, socket.userId);
          if (connection) {
            const recipientId = [connection.participant?.toString(), connection.otherUser?.toString()]
              .find(id => id && id !== socket.userId);
            if (recipientId && !isUserOnline(recipientId)) {
              sendPushToUser(recipientId, {
                title: senderName,
                body: preview,
                url: '/'
              }).catch(err => console.error('⚠️ Push notify (private) failed:', err));
            }
          }
        }
      } catch (error) {
        // A concurrent retry with the same clientId can race past the
        // existence check above; the unique index catches it here.
        if (error.code === 11000 && error.keyPattern?.clientId && clientId) {
          const existing = await Message.findOne({ clientId }).catch(() => null);
          if (existing) {
            socket.emit('message:ack', { clientId, _id: existing._id, seq: existing.seq, createdAt: existing.createdAt });
            return;
          }
        }
        console.error('message:send error:', error);
        socket.emit('message:error', { clientId, reason: 'Failed to send message' });
      }
    });

    // Reconnect gap-fill: everything the client missed while its socket
    // was down, in one round trip instead of a full history reload.
    socket.on('message:sync', async ({ chatType, chatId, sinceSeq = 0 } = {}) => {
      try {
        if (!chatType || !chatId) return;
        const allowed = await hasChatAccess(chatType, chatId, socket.userId);
        if (!allowed) return;

        const messages = await Message.find({ chatType, chatId, seq: { $gt: sinceSeq } })
          .populate('sender', 'name photos')
          .sort({ seq: 1 })
          .limit(500);

        socket.emit('message:sync-result', { chatType, chatId, messages });
      } catch (error) {
        console.error('message:sync error:', error);
      }
    });

    socket.on('message:read', async ({ chatType, chatId } = {}) => {
      try {
        if (!chatType || !chatId) return;
        await Message.markChatAsRead(chatType, chatId, socket.userId);
      } catch (error) {
        console.error('message:read error:', error);
      }
    });

    socket.on('typing:start', ({ chatType, chatId } = {}) => {
      if (!chatType || !chatId) return;
      socket.to(chatRoom(chatType, chatId)).emit('typing:update', {
        chatId, userId: socket.userId, isTyping: true
      });
    });

    socket.on('typing:stop', ({ chatType, chatId } = {}) => {
      if (!chatType || !chatId) return;
      socket.to(chatRoom(chatType, chatId)).emit('typing:update', {
        chatId, userId: socket.userId, isTyping: false
      });
    });

    socket.on('disconnect', () => {
      connectedUsers.delete(socket.userId);
    });
  });

  io.engine.on('connection_error', (err) => {
    console.error('🔴 Socket.IO connection error:', err);
  });
};

// Whether a user currently has a live socket connection - used to decide
// whether a new message needs a push notification instead.
const isUserOnline = (userId) => connectedUsers.has(userId.toString());

module.exports = { handleConnection, isUserOnline };
