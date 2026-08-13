// backend/scripts/resetDb.js
const mongoose = require('mongoose');
const path = require('path');

// Load .env from the backend directory (one level up from scripts)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Event = require('../src/models/Event');
const Match = require('../src/models/Match');
const Message = require('../src/models/Message');
const User = require('../src/models/User');

async function resetDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dating-app';
    console.log('Connecting to:', mongoUri);
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    // Clear collections
    await Event.deleteMany({});
    await Match.deleteMany({});
    await Message.deleteMany({});
    
    // Reset user swipes
    await User.updateMany({}, { $set: { swipes: [] } });
    
    console.log('Database reset complete');
    console.log('- Events cleared');
    console.log('- Matches cleared'); 
    console.log('- Messages cleared');
    console.log('- User swipes reset');
    console.log('- Users preserved');
    
    process.exit(0);
  } catch (error) {
    console.error('Reset failed:', error);
    process.exit(1);
  }
}

resetDatabase();