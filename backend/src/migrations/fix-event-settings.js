// backend/src/migrations/fix-event-settings.js
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');

async function fixEventSettings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Find all events without settings
    const eventsWithoutSettings = await Event.find({
      $or: [
        { settings: { $exists: false } },
        { settings: null }
      ]
    });
    
    console.log(`Found ${eventsWithoutSettings.length} events without settings`);
    
    // Update each event with default settings
    for (const event of eventsWithoutSettings) {
      event.settings = {
        minParticipants: 2,
        maxParticipants: 10,
        isPrivate: false
      };
      
      await event.save();
      console.log(`Fixed settings for event: ${event.name} (${event._id})`);
    }
    
    // Also check for events with partial settings
    const eventsWithPartialSettings = await Event.find({
      'settings.isPrivate': { $exists: false }
    });
    
    console.log(`Found ${eventsWithPartialSettings.length} events with partial settings`);
    
    for (const event of eventsWithPartialSettings) {
      if (!event.settings) {
        event.settings = {};
      }
      
      // Set defaults for missing fields
      if (event.settings.isPrivate === undefined) {
        event.settings.isPrivate = false;
      }
      if (event.settings.minParticipants === undefined) {
        event.settings.minParticipants = 2;
      }
      if (event.settings.maxParticipants === undefined) {
        event.settings.maxParticipants = 10;
      }
      
      await event.save();
      console.log(`Fixed partial settings for event: ${event.name} (${event._id})`);
    }
    
    console.log('Migration completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
fixEventSettings();