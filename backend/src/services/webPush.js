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
// prunes any that are permanently dead instead of retrying them forever:
// 410/404 (the user uninstalled, cleared site data, etc) or a
// VapidPkHashMismatch (the subscription was created against a VAPID key
// this server no longer uses, e.g. after rotating a misconfigured key -
// browsers tie a subscription to the public key it was created with, so
// there's no fixing that subscription short of the client re-subscribing).
async function sendPushToUser(userId, { title, body, url }) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('🔔 Push skipped: VAPID keys not configured on this server');
    return false;
  }

  const user = await User.findById(userId).select('webPushSubscriptions');
  if (!user || !user.webPushSubscriptions?.length) {
    console.log(`🔔 Push skipped: user ${userId} has no registered subscriptions`);
    return false;
  }

  const payload = JSON.stringify({ title, body, url });
  const deadEndpoints = [];
  let sentCount = 0;

  await Promise.all(user.webPushSubscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        payload
      );
      sentCount++;
    } catch (error) {
      const isVapidMismatch = /VapidPkHashMismatch/i.test(error.body || '');
      if (error.statusCode === 410 || error.statusCode === 404 || isVapidMismatch) {
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

  return sentCount > 0;
}

module.exports = { sendPushToUser };
