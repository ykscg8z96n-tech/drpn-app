// backend/src/index.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// Import socket handler
const { handleConnection } = require('./socket/socketHandler');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/drpn');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

// Initialize database connection
connectDB();

// Create Express app
const app = express();

// Create HTTP server (required for Socket.IO)
const server = http.createServer(app);

// Initialize Socket.IO with proper CORS configuration
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",        // Web dev server
      "http://localhost:19006",       // Expo web
      "http://localhost:19000",       // Expo dev server
      "exp://localhost:19000",        // Expo protocol
      "exp://172.20.10.2:19000",   
      "http://172.20.10.2:19006",   
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowRequest: (req, callback) => {
    // Additional security check if needed
    callback(null, true);
  }
});

// Make io accessible to routes (important for sending notifications)
app.set('io', io);

// Initialize socket handlers
handleConnection(io);

// CORS middleware for HTTP requests
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:19006",
    "http://localhost:19000",
    "exp://localhost:19000",
    "exp://192.168.1.100:19000",    // Replace with your local IP
    "http://192.168.1.100:19006",   // Replace with your local IP
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (optional, but helpful for debugging)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/events', require('./routes/events'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/participations', require('./routes/participations'));
app.use('/api/private-connections', require('./routes/private-connections'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'DRPN API is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'DRPN API is working!',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔴 Error:', err.message);
  console.error('Stack:', err.stack);
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.method} ${req.originalUrl} not found` 
  });
});

// Socket.IO error handling
io.on('error', (error) => {
  console.error('🔴 Socket.IO Server Error:', error);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    mongoose.connection.close(() => {
      console.log('✅ Database connection closed');
      io.close(() => {
        console.log('✅ Socket.IO server closed');
        process.exit(0);
      });
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    mongoose.connection.close(() => {
      console.log('✅ Database connection closed');
      io.close(() => {
        console.log('✅ Socket.IO server closed');
        process.exit(0);
      });
    });
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🔴 Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔴 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;

// Use server.listen instead of app.listen (important for Socket.IO)
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ================================');
  console.log(`🚀 DRPN Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 Socket.IO server ready for connections`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
  console.log(`🔗 Network: http://0.0.0.0:${PORT}`);
  console.log('🚀 ================================');
  
  // Log Socket.IO configuration
  console.log('📡 Socket.IO Configuration:');
  console.log('   - Transports: websocket, polling');
  console.log('   - CORS enabled for development origins');
  console.log('   - Ping timeout: 60s');
  console.log('   - Ping interval: 25s');
  console.log(`   - Connected clients: ${io.engine.clientsCount}`);
});