// backend/src/services/webPush.js
const webpush = require('web-push');
const User = require('../models/User');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Sends to every subscription (device/browser) a user has registered, and
// prunes any that the push service reports as gone (410/404 - the user
// uninstalled, cleared site data, etc) instead of retrying them forever.
async function sendPushToUser(userId, { title, body, url }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const user = await User.findById(userId).select('webPushSubscriptions');
  if (!user || !user.webPushSubscriptions?.length) return;

  const payload = JSON.stringify({ title, body, url });
  const deadEndpoints = [];

  await Promise.all(user.webPushSubscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        payload
      );
    } catch (error) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        deadEndpoints.push(sub.endpoint);
      } else {
        console.error('⚠️ Push send failed:', error.statusCode, error.body || error.message);
      }
    }
  }));

  if (deadEndpoints.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { webPushSubscriptions: { endpoint: { $in: deadEndpoints } } } }
    );
  }
}

module.exports = { sendPushToUser };
