// backend/src/socket/socketHandler.js (Update your existing file with this)
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Event = require('../models/Event');

// Store connected users
const connectedUsers = new Map();

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.error('Socket authentication failed: No token provided');
      return next(new Error('No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      console.error('Socket authentication failed: User not found');
      return next(new Error('User not found'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    console.log(`✅ Socket authenticated for user: ${user.name} (${user._id})`);
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Authentication failed'));
  }
};

const handleConnection = (io) => {
  // Apply authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`🔗 User ${socket.user.name} connected (Socket ID: ${socket.id})`);
    
    // Store connected user
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });

    // Join user to their personal room (for notifications)
    socket.join(socket.userId);
    console.log(`👤 User ${socket.userId} joined personal room`);

    // Emit connection confirmation
    socket.emit('connection-confirmed', {
      userId: socket.userId,
      timestamp: new Date()
    });

    // Handle joining match rooms
    socket.on('join-match', async (matchId) => {
      try {
        console.log(`🚪 User ${socket.userId} attempting to join match room: ${matchId}`);
        
        // Verify user has access to this match
        const match = await Match.findById(matchId)
          .populate('event', 'organizer admins');
        
        if (!match) {
          console.error(`❌ Match not found: ${matchId}`);
          socket.emit('error', { message: 'Match not found' });
          return;
        }

        // Check if user is part of this match
        const hasAccess = await verifyMatchAccess(match, socket.userId);
        if (!hasAccess) {
          console.error(`🚫 User ${socket.userId} not authorized for match ${matchId}`);
          socket.emit('error', { message: 'Not authorized for this match' });
          return;
        }

        socket.join(`match-${matchId}`);
        console.log(`✅ User ${socket.userId} joined match room: ${matchId}`);
        
        // Notify other participants in the match
        socket.to(`match-${matchId}`).emit('user-joined', {
          userId: socket.userId,
          userName: socket.user.name,
          timestamp: new Date()
        });

        // Confirm room join to the user
        socket.emit('match-joined', {
          matchId: matchId,
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Error joining match room:', error);
        socket.emit('error', { message: 'Failed to join match room' });
      }
    });

    // Handle leaving match rooms
    socket.on('leave-match', (matchId) => {
      socket.leave(`match-${matchId}`);
      console.log(`🚪 User ${socket.userId} left match room: ${matchId}`);
      
      // Notify other participants
      socket.to(`match-${matchId}`).emit('user-left', {
        userId: socket.userId,
        userName: socket.user.name,
        timestamp: new Date()
      });

      // Confirm room leave to the user
      socket.emit('match-left', {
        matchId: matchId,
        timestamp: new Date()
      });
    });

    // Handle real-time message sending
    socket.on('send-message', async (data) => {
      try {
        const { matchId, message } = data;
        console.log(`📤 User ${socket.userId} sending message to match ${matchId}`);
        
        // Verify match access
        const match = await Match.findById(matchId)
          .populate('event', 'organizer admins');
        
        if (!match) {
          console.error(`❌ Match not found: ${matchId}`);
          socket.emit('error', { message: 'Match not found' });
          return;
        }

        const hasAccess = await verifyMatchAccess(match, socket.userId);
        if (!hasAccess) {
          console.error(`🚫 User ${socket.userId} not authorized for match ${matchId}`);
          socket.emit('error', { message: 'Not authorized' });
          return;
        }

        // Create message in database
        const newMessage = await Message.create({
          match: matchId,
          sender: socket.userId,
          text: message.text
        });

        // Populate sender info
        await newMessage.populate('sender', 'name photos');

        // Update match last message time and unread counts
        match.lastMessageAt = new Date();
        if (socket.userId === match.individual.toString()) {
          match.unreadCount.organizer += 1;
        } else {
          match.unreadCount.individual += 1;
        }
        await match.save();

        console.log(`📨 Message created and broadcasting to match-${matchId}`);

        // Broadcast to match room (including sender for confirmation)
        io.to(`match-${matchId}`).emit('new-message', newMessage);
        
        console.log(`✅ Message sent successfully in match ${matchId}`);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing-start', (matchId) => {
      console.log(`⌨️ User ${socket.userId} started typing in match ${matchId}`);
      socket.to(`match-${matchId}`).emit('user-typing', {
        userId: socket.userId,
        userName: socket.user.name,
        isTyping: true,
        timestamp: new Date()
      });
    });

    socket.on('typing-stop', (matchId) => {
      console.log(`⌨️ User ${socket.userId} stopped typing in match ${matchId}`);
      socket.to(`match-${matchId}`).emit('user-typing', {
        userId: socket.userId,
        userName: socket.user.name,
        isTyping: false,
        timestamp: new Date()
      });
    });

    // Handle user status updates
    socket.on('update-status', (status) => {
      console.log(`📊 User ${socket.userId} updated status to: ${status}`);
      
      // Update user status in connected users map
      if (connectedUsers.has(socket.userId)) {
        const userData = connectedUsers.get(socket.userId);
        userData.status = status;
        userData.lastActivity = new Date();
        connectedUsers.set(socket.userId, userData);
      }
      
      // Broadcast status to relevant rooms (matches, etc.)
      socket.broadcast.emit('user-status-update', {
        userId: socket.userId,
        status: status,
        timestamp: new Date()
      });
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 User ${socket.userId} disconnected: ${reason}`);
      
      // Remove from connected users
      connectedUsers.delete(socket.userId);
      
      // Get all rooms this user was in
      const rooms = Array.from(socket.rooms);
      
      // Notify all match rooms this user was in
      rooms.forEach(room => {
        if (room.startsWith('match-')) {
          socket.to(room).emit('user-left', {
            userId: socket.userId,
            userName: socket.user.name,
            reason: 'disconnected',
            timestamp: new Date()
          });
        }
      });

      console.log(`👋 User ${socket.userId} cleanup completed`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`🔴 Socket error for user ${socket.userId}:`, error);
      
      // Log error details for debugging
      console.error('Error details:', {
        userId: socket.userId,
        socketId: socket.id,
        error: error.message || error,
        timestamp: new Date()
      });
    });

    // Handle custom events for debugging
    socket.on('debug-info', () => {
      socket.emit('debug-response', {
        userId: socket.userId,
        socketId: socket.id,
        rooms: Array.from(socket.rooms),
        connectedUsers: connectedUsers.size,
        timestamp: new Date()
      });
    });
  });

  // Global connection error handler
  io.engine.on('connection_error', (err) => {
    console.error('🔴 Socket.IO connection error:', err);
  });
};

// Helper function to verify match access
const verifyMatchAccess = async (match, userId) => {
  try {
    if (!match.event) {
      console.error('Match has no associated event');
      return false;
    }
    
    const isIndividual = match.individual.toString() === userId;
    const isOrganizer = match.event.organizer.toString() === userId;
    const isAdmin = match.event.admins && match.event.admins.includes(userId);
    
    const hasAccess = isIndividual || isOrganizer || isAdmin;
    
    console.log(`🔍 Access check for match ${match._id}:`, {
      userId,
      isIndividual,
      isOrganizer,
      isAdmin,
      hasAccess
    });
    
    return hasAccess;
  } catch (error) {
    console.error('Error verifying match access:', error);
    return false;
  }
};

// Function to send notification to user if they're online
const sendNotificationToUser = (io, userId, eventName, data) => {
  console.log(`📢 Sending notification to user ${userId}: ${eventName}`);
  
  if (connectedUsers.has(userId)) {
    io.to(userId).emit(eventName, {
      ...data,
      timestamp: new Date()
    });
    console.log(`✅ Notification sent to online user ${userId}`);
    return true;
  } else {
    console.log(`⚠️ User ${userId} is offline, notification not sent`);
    return false;
  }
};

// Function to get online users
const getOnlineUsers = () => {
  return Array.from(connectedUsers.entries()).map(([userId, data]) => ({
    userId,
    socketId: data.socketId,
    user: {
      id: data.user._id,
      name: data.user.name,
      email: data.user.email
    },
    connectedAt: data.connectedAt,
    lastActivity: data.lastActivity || data.connectedAt,
    status: data.status || 'online'
  }));
};

// Function to check if user is online
const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

// Function to get connection stats
const getConnectionStats = () => {
  return {
    totalConnections: connectedUsers.size,
    onlineUsers: getOnlineUsers(),
    timestamp: new Date()
  };
};

// Function to broadcast to all connected users
const broadcastToAll = (io, eventName, data) => {
  console.log(`📡 Broadcasting ${eventName} to all connected users`);
  io.emit(eventName, {
    ...data,
    timestamp: new Date()
  });
};

// Function to broadcast to users in a specific room
const broadcastToRoom = (io, room, eventName, data) => {
  console.log(`📡 Broadcasting ${eventName} to room: ${room}`);
  io.to(room).emit(eventName, {
    ...data,
    timestamp: new Date()
  });
};

// Function to send match notification
const sendMatchNotification = (io, userId, matchData) => {
  return sendNotificationToUser(io, userId, 'match-accepted', matchData);
};

// Function to send applicant notification
const sendApplicantNotification = (io, organizerId, applicantData) => {
  return sendNotificationToUser(io, organizerId, 'new-applicant', applicantData);
};

module.exports = {
  handleConnection,
  sendNotificationToUser,
  sendMatchNotification,
  sendApplicantNotification,
  getOnlineUsers,
  isUserOnline,
  getConnectionStats,
  broadcastToAll,
  broadcastToRoom
};