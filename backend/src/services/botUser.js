// backend/src/services/botUser.js
//
// System notices (e.g. "this event is filled") are posted as chat messages
// from a real User account rather than a null/fake sender, so every
// existing message-rendering code path on mobile (which always expects
// message.sender to be a populated user with photos/name) keeps working
// without a special case for bot messages.
const User = require('../models/User');

const BOT_EMAIL = 'bot@drpn.app';
let cachedBotId = null;

async function getBotUserId() {
  if (cachedBotId) return cachedBotId;

  const bot = await User.findOneAndUpdate(
    { email: BOT_EMAIL },
    {
      $setOnInsert: {
        email: BOT_EMAIL,
        name: 'DRPN',
        // Never used to log in - just needs to satisfy the schema.
        password: 'not-a-real-account-' + Math.random().toString(36).slice(2),
        location: { type: 'Point', coordinates: [0, 0] },
        isOrganizer: false
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).select('_id');

  cachedBotId = bot._id;
  return cachedBotId;
}

module.exports = { getBotUserId };
