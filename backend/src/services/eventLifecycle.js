// backend/src/services/eventLifecycle.js
//
// Shared between routes/events.js's own DELETE /:id (a manual cancel) and
// routes/users.js's account-deletion cascade (which has to cancel any
// event/group the deleted account solely owned) - both need the exact
// same roster-facing side effects, not just the Event doc's own flags.
const Event = require('../models/Event');
const Participation = require('../models/Participation');
const { sendBotNotice } = require('./botNotice');

// A manual close always closes the downstream chat for the whole roster,
// unlike a natural date expiry which never touches Participation - that's
// what keeps a chat alive after its event just happens to run out the
// clock. Archiving each accepted member's Participation record both drops
// the event from their feed (GET /participations filters on it) and
// revokes their chat access (messages.js gates send/read the same way).
// `actorId` is excluded from the roster notice/archive since they're the
// one doing the cancelling (or, from the account-deletion path, the
// account that's gone and can't receive anything anyway).
async function cancelEventForRoster(event, actorId, actorName, req) {
  await Event.findByIdAndUpdate(event._id, {
    isActive: false,
    isArchived: true,
    archivedAt: new Date()
  });

  try {
    const rosterIds = event.applicants
      .filter(a => a.status === 'accepted' && a.userId.toString() !== actorId.toString())
      .map(a => a.userId);

    await Participation.updateMany(
      { event: event._id, participant: { $in: rosterIds } },
      { isArchived: true }
    );

    const noun = event.type === 'group' ? 'group' : 'event';
    const noticeText = `${actorName || 'The organizer'} has cancelled the ${noun} "${event.name}"`;
    await Promise.all(rosterIds.map(userId => sendBotNotice(userId, noticeText, req)));
  } catch (notifyError) {
    console.error('⚠️ Failed to close roster chat access / send close notices:', notifyError);
  }
}

module.exports = { cancelEventForRoster };
