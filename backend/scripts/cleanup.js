// backend/scripts/cleanup.js
// Standalone script for manual event cleanup
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../src/models/Event');
const Match = require('../src/models/Match');
const Message = require('../src/models/Message');

async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`📡 MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

async function showStats() {
  const now = new Date();
  
  console.log('\n📊 Current Database Stats:');
  console.log('─'.repeat(50));
  
  const totalEvents = await Event.countDocuments();
  const activeEvents = await Event.countDocuments({ isActive: true });
  const expiredEvents = await Event.countDocuments({ isActive: false });
  const pastDueEvents = await Event.countDocuments({ 
    type: 'event',
    isActive: true, 
    eventDate: { $lt: now } 
  });
  const futureEvents = await Event.countDocuments({ 
    type: 'event',
    isActive: true, 
    eventDate: { $gte: now } 
  });
  const totalGroups = await Event.countDocuments({ type: 'group' });
  const activeMatches = await Match.countDocuments({ status: 'active' });
  const totalMessages = await Message.countDocuments();

  console.log(`Total Events: ${totalEvents}`);
  console.log(`├─ Active: ${activeEvents}`);
  console.log(`├─ Expired: ${expiredEvents}`);
  console.log(`├─ Past Due: ${pastDueEvents} ⚠️`);
  console.log(`├─ Future: ${futureEvents}`);
  console.log(`└─ Groups: ${totalGroups}`);
  console.log(`Active Matches: ${activeMatches}`);
  console.log(`Total Messages: ${totalMessages}`);

  if (pastDueEvents > 0) {
    console.log('\n⚠️ Events past their date but still active:');
    const pastEvents = await Event.find({ 
      type: 'event',
      isActive: true, 
      eventDate: { $lt: now } 
    }).sort({ eventDate: 1 }).limit(10);

    pastEvents.forEach(event => {
      const daysAgo = Math.floor((now - event.eventDate) / (1000 * 60 * 60 * 24));
      console.log(`   • ${event.name} (${daysAgo} days ago)`);
    });

    if (pastEvents.length === 10) {
      console.log(`   ... and ${pastDueEvents - 10} more`);
    }
  }
}

async function cleanupExpiredEvents(dryRun = true) {
  const now = new Date();
  
  console.log(`\n🧹 ${dryRun ? 'DRY RUN' : 'LIVE'} - Cleaning up expired events...`);
  console.log('─'.repeat(50));

  // Find events that should be expired
  const expiredEvents = await Event.find({
    type: 'event',
    isActive: true,
    eventDate: { $lt: now }
  });

  console.log(`Found ${expiredEvents.length} events to expire`);

  if (expiredEvents.length === 0) {
    console.log('✅ No events need cleanup');
    return 0;
  }

  // Show what will be cleaned
  console.log('\nEvents to expire:');
  expiredEvents.forEach((event, index) => {
    const daysAgo = Math.floor((now - event.eventDate) / (1000 * 60 * 60 * 24));
    console.log(`${index + 1}. ${event.name} (${daysAgo} days ago)`);
  });

  if (!dryRun) {
    // Perform the cleanup
    const result = await Event.updateMany(
      {
        type: 'event',
        isActive: true,
        eventDate: { $lt: now }
      },
      {
        $set: {
          isActive: false,
          expiredAt: now,
          expiredReason: 'manual_script_cleanup'
        }
      }
    );

    console.log(`\n✅ Successfully expired ${result.modifiedCount} events`);
    return result.modifiedCount;
  }

  return expiredEvents.length;
}

async function hardDeleteOldData(daysOld = 30, dryRun = true) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  
  console.log(`\n🗑️ ${dryRun ? 'DRY RUN' : 'LIVE'} - Hard delete data older than ${daysOld} days`);
  console.log(`Cutoff date: ${cutoffDate}`);
  console.log('─'.repeat(50));

  // Find what would be deleted
  const oldEvents = await Event.find({
    isActive: false,
    expiredAt: { $lt: cutoffDate }
  });

  const oldMatches = await Match.find({
    status: 'archived',
    archivedAt: { $lt: cutoffDate }
  });

  console.log(`Events to delete: ${oldEvents.length}`);
  console.log(`Matches to delete: ${oldMatches.length}`);

  if (!dryRun && (oldEvents.length > 0 || oldMatches.length > 0)) {
    console.log('⚠️ This will permanently delete data!');
    
    // Delete old events
    const deletedEvents = await Event.deleteMany({
      isActive: false,
      expiredAt: { $lt: cutoffDate }
    });

    // Delete old matches
    const deletedMatches = await Match.deleteMany({
      status: 'archived',
      archivedAt: { $lt: cutoffDate }
    });

    console.log(`✅ Deleted ${deletedEvents.deletedCount} events and ${deletedMatches.deletedCount} matches`);
    return deletedEvents.deletedCount + deletedMatches.deletedCount;
  }

  return oldEvents.length + oldMatches.length;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'stats';
  const isDryRun = !args.includes('--live');

  console.log('🧹 Event Cleanup Tool');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE MODE'}`);
  console.log('═'.repeat(50));

  await connectDB();

  try {
    switch (command) {
      case 'stats':
        await showStats();
        break;

      case 'cleanup':
        await showStats();
        await cleanupExpiredEvents(isDryRun);
        break;

      case 'hard-delete':
        const daysOld = parseInt(args.find(arg => arg.startsWith('--days='))?.split('=')[1]) || 30;
        await hardDeleteOldData(daysOld, isDryRun);
        break;

      case 'full':
        await showStats();
        const cleaned = await cleanupExpiredEvents(isDryRun);
        if (cleaned > 0) {
          console.log('\nWaiting 2 seconds before hard delete...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          await hardDeleteOldData(30, isDryRun);
        }
        break;

      default:
        console.log('\n📖 Usage:');
        console.log('  npm run cleanup                    # Show stats only');
        console.log('  npm run cleanup stats              # Show stats only');
        console.log('  npm run cleanup cleanup            # Cleanup expired events (dry run)');
        console.log('  npm run cleanup cleanup --live     # Cleanup expired events (live)');
        console.log('  npm run cleanup hard-delete        # Hard delete old data (dry run)');
        console.log('  npm run cleanup hard-delete --live --days=30  # Hard delete (live)');
        console.log('  npm run cleanup full               # Full cleanup (dry run)');
        console.log('  npm run cleanup full --live        # Full cleanup (live)');
        break;
    }

    if (isDryRun && command !== 'stats') {
      console.log('\n💡 This was a dry run. Add --live to actually perform changes.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Interrupted, closing database connection...');
  await mongoose.connection.close();
  process.exit(0);
});

main().catch(console.error);