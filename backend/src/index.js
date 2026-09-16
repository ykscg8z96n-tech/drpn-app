// backend/src/index.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

// Import socket handler
const { handleConnection } = require('./socket/socketHandler');
const { corsOptions, socketCorsOrigin } = require('./config/cors');
const { apiLimiter } = require('./middleware/rateLimit');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/drpn');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Safe to start once there's a DB to query - soft-deletes expired
    // events daily (and once on boot), never hard-deletes anything.
    require('./services/eventCleanupService').init();
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

// Initialize database connection
connectDB();

// Create Express app
const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy - trust its
// X-Forwarded-For so req.ip and express-rate-limit see the real client IP
// instead of the proxy's.
app.set('trust proxy', 1);

// Create HTTP server (required for Socket.IO)
const server = http.createServer(app);

// Initialize Socket.IO with the same origin check as the HTTP API
const io = socketIo(server, {
  cors: {
    origin: socketCorsOrigin,
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

// Security headers
app.use(helmet({
  // Cross-origin requests serve API responses & Cloudinary-hosted images,
  // not this server's own pages, so the default restrictive CORP breaks
  // nothing here and CSP isn't relevant to a pure JSON API.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// CORS middleware for HTTP requests
app.use(cors(corsOptions));

// Rate limiting (auth routes have their own, tighter limit - see routes/auth.js)
app.use('/api', apiLimiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/events', require('./routes/events'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/participations', require('./routes/participations'));
app.use('/api/private-connections', require('./routes/private-connections'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/geocode', require('./routes/geocode'));
app.use('/api/push', require('./routes/push'));
app.use('/api/admin', require('./routes/admin'));

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
const shutdown = (signal) => {
  console.log(`🛑 ${signal} received, shutting down gracefully...`);

  server.close(async () => {
    console.log('✅ HTTP server closed');
    try {
      await mongoose.connection.close();
      console.log('✅ Database connection closed');
    } catch (err) {
      console.error('🔴 Error closing database connection:', err);
    }
    io.close(() => {
      console.log('✅ Socket.IO server closed');
      process.exit(0);
    });
  });

  // Force-exit if connections don't close in time (e.g. a stuck socket)
  setTimeout(() => {
    console.error('🔴 Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

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