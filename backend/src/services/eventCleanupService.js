// backend/src/services/eventCleanupService.js
const Event = require('../models/Event');
const Match = require('../models/Match');
const Message = require('../models/Message');

class EventCleanupService {
  constructor() {
    this.isRunning = false;
  }

  // Initialize the cleanup service
  init() {
    console.log('🧹 Event Cleanup Service initialized');
    
    // Try to import node-cron, but don't fail if it's not installed
    try {
      const cron = require('node-cron');
      
      // Run daily at 2 AM
      cron.schedule('0 2 * * *', () => {
        this.cleanupExpiredEvents();
      });
      
      console.log('📅 Scheduled daily cleanup at 2 AM');
      
      // Run once on startup to clean existing expired events
      setTimeout(() => {
        this.cleanupExpiredEvents();
      }, 5000); // Wait 5 seconds after startup
      
    } catch (error) {
      console.warn('⚠️ node-cron not available. Install with: npm install node-cron');
      console.log('🧹 Cleanup service running without scheduling (manual only)');
    }
  }

  // Main cleanup function
  async cleanupExpiredEvents() {
    if (this.isRunning) {
      console.log('⏳ Cleanup already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🧹 Starting expired event cleanup...');

    try {
      const stats = await this.performCleanup();
      console.log('✅ Cleanup completed:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Perform the actual cleanup
  async performCleanup() {
    const now = new Date();

    // Strategy: Soft delete expired events
    const expiredEvents = await this.softDeleteExpiredEvents(now);

    return {
      expiredEvents,
      timestamp: now
    };
  }

  // Soft delete expired events
  async softDeleteExpiredEvents(now) {
    try {
      // Find events that are past their date and still active
      const expiredEventQuery = {
        type: 'event',
        eventDate: { $lt: now },
        isActive: true
      };

      // Soft delete by setting isActive to false
      const result = await Event.updateMany(
        expiredEventQuery,
        { 
          $set: { 
            isActive: false,
            expiredAt: now,
            expiredReason: 'automatic_cleanup'
          }
        }
      );

      console.log(`📅 Soft deleted ${result.modifiedCount} expired events`);
      return result.modifiedCount;
    } catch (error) {
      console.error('Error in soft delete:', error);
      throw error;
    }
  }

  // Manual cleanup method for admin use
  async manualCleanup(options = {}) {
    const {
      daysOld = 1,
      dryRun = false,
      includeGroups = false
    } = options;

    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    console.log(`🔍 Manual cleanup - ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`📅 Cutoff date: ${cutoffDate}`);

    const query = {
      eventDate: { $lt: cutoffDate },
      isActive: true
    };

    if (!includeGroups) {
      query.type = 'event';
    }

    // Find events that would be affected
    const eventsToExpire = await Event.find(query);
    
    console.log(`📊 Found ${eventsToExpire.length} events to expire`);

    if (!dryRun && eventsToExpire.length > 0) {
      const result = await Event.updateMany(
        query,
        { 
          $set: { 
            isActive: false,
            expiredAt: new Date(),
            expiredReason: 'manual_cleanup'
          }
        }
      );
      console.log(`✅ Manually expired ${result.modifiedCount} events`);
      return result.modifiedCount;
    }

    return eventsToExpire.length;
  }

  // Get cleanup statistics
  async getCleanupStats() {
    const now = new Date();

    const stats = {
      activeEvents: await Event.countDocuments({ isActive: true, type: 'event' }),
      expiredEvents: await Event.countDocuments({ isActive: false, type: 'event' }),
      futureEvents: await Event.countDocuments({ 
        isActive: true, 
        type: 'event', 
        eventDate: { $gte: now } 
      }),
      pastDueEvents: await Event.countDocuments({ 
        isActive: true, 
        type: 'event', 
        eventDate: { $lt: now } 
      }),
      activeGroups: await Event.countDocuments({ isActive: true, type: 'group' }),
      activeMatches: await Match.countDocuments({ status: 'active' }),
      timestamp: now
    };

    return stats;
  }
}

module.exports = new EventCleanupService();