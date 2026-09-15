// backend/scripts/dedupe.js
// Finds (and optionally removes) duplicate records left over from this
// project's extensive live click-testing:
//   - Duplicate Events: same organizer + name + type (accidental
//     double-submits, retries on a flaky connection, etc.)
//   - Duplicate Participation docs for the same (event, participant) pair
//     - should be impossible now (unique index), but older rows may
//     predate it.
//   - Duplicate PrivateConnection docs between the same two users.
// Defaults to a dry run (report only, no writes) - pass --live to
// actually delete. Always keeps the OLDEST record in each duplicate
// group and removes the rest.
require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../src/models/Event');
const Participation = require('../src/models/Participation');
const PrivateConnection = require('../src/models/PrivateConnection');

async function connectDB() {
  const conn = await mongoose.connect(process.env.MONGODB_URI);
  console.log(`📡 MongoDB Connected: ${conn.connection.host}`);
}

async function findDuplicateEvents() {
  const groups = await Event.aggregate([
    { $match: { isArchived: { $ne: true } } },
    {
      $group: {
        _id: { organizer: '$organizer', name: '$name', type: '$type' },
        ids: { $push: '$_id' },
        names: { $push: '$name' },
        createdAts: { $push: '$createdAt' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);
  return groups;
}

async function findDuplicateParticipations() {
  const groups = await Participation.aggregate([
    {
      $group: {
        _id: { event: '$event', participant: '$participant' },
        ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);
  return groups;
}

async function findDuplicateConnections() {
  const all = await PrivateConnection.find().select('participant otherUser createdAt').lean();
  const byPair = new Map();
  for (const conn of all) {
    const key = [conn.participant.toString(), conn.otherUser.toString()].sort().join(':');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(conn);
  }
  return [...byPair.values()].filter(group => group.length > 1);
}

async function report() {
  console.log('\n📊 Duplicate scan');
  console.log('─'.repeat(50));

  const dupEvents = await findDuplicateEvents();
  const dupEventRecords = dupEvents.reduce((sum, g) => sum + (g.count - 1), 0);
  console.log(`Duplicate Event groups: ${dupEvents.length} (${dupEventRecords} extra records)`);
  dupEvents.slice(0, 15).forEach(g => {
    console.log(`  • "${g._id.name}" (${g._id.type}) x${g.count} - ids: ${g.ids.join(', ')}`);
  });
  if (dupEvents.length > 15) console.log(`  ... and ${dupEvents.length - 15} more groups`);

  const dupParticipations = await findDuplicateParticipations();
  const dupParticipationRecords = dupParticipations.reduce((sum, g) => sum + (g.count - 1), 0);
  console.log(`\nDuplicate Participation pairs: ${dupParticipations.length} (${dupParticipationRecords} extra records)`);

  const dupConnections = await findDuplicateConnections();
  const dupConnectionRecords = dupConnections.reduce((sum, g) => sum + (g.length - 1), 0);
  console.log(`\nDuplicate PrivateConnection pairs: ${dupConnections.length} (${dupConnectionRecords} extra records)`);

  return { dupEvents, dupParticipations, dupConnections };
}

// Keeps the oldest doc in each group (by _id, which is chronological for
// ObjectIds), removes the rest. Events also get related Match/Message/
// Participation cleaned up for the removed ids to avoid orphaned refs.
async function cleanup(dryRun, { dupEvents, dupParticipations, dupConnections }) {
  const Match = require('../src/models/Match');
  const Message = require('../src/models/Message');

  console.log(`\n🧹 ${dryRun ? 'DRY RUN' : 'LIVE'} - Removing duplicates (keeping oldest in each group)`);
  console.log('─'.repeat(50));

  let eventsRemoved = 0;
  for (const g of dupEvents) {
    const sortedIds = [...g.ids].sort((a, b) => a.toString().localeCompare(b.toString()));
    const [, ...toRemove] = sortedIds;
    console.log(`Event "${g._id.name}": keeping ${sortedIds[0]}, removing ${toRemove.join(', ')}`);
    if (!dryRun) {
      await Event.deleteMany({ _id: { $in: toRemove } });
      await Match.deleteMany({ event: { $in: toRemove } });
      await Message.deleteMany({ event: { $in: toRemove } });
      await Participation.deleteMany({ event: { $in: toRemove } });
    }
    eventsRemoved += toRemove.length;
  }

  let participationsRemoved = 0;
  for (const g of dupParticipations) {
    const sortedIds = [...g.ids].sort((a, b) => a.toString().localeCompare(b.toString()));
    const [, ...toRemove] = sortedIds;
    if (!dryRun) {
      await Participation.deleteMany({ _id: { $in: toRemove } });
    }
    participationsRemoved += toRemove.length;
  }

  let connectionsRemoved = 0;
  for (const g of dupConnections) {
    const sorted = [...g].sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    const toRemove = sorted.slice(1).map(c => c._id);
    if (!dryRun) {
      await PrivateConnection.deleteMany({ _id: { $in: toRemove } });
    }
    connectionsRemoved += toRemove.length;
  }

  console.log(`\n${dryRun ? 'Would remove' : 'Removed'}: ${eventsRemoved} events, ${participationsRemoved} participations, ${connectionsRemoved} private connections`);
}

async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes('--live');

  console.log('🧹 Dedupe Tool');
  console.log(`Mode: ${isLive ? 'LIVE MODE' : 'DRY RUN'}`);
  console.log('═'.repeat(50));

  await connectDB();
  try {
    const found = await report();
    await cleanup(!isLive, found);
    if (!isLive) {
      console.log('\n💡 This was a dry run. Add --live to actually delete duplicates.');
    }
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
