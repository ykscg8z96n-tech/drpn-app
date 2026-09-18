// backend/src/utils/slack.js
//
// Growth notifications (new signups, etc.) posted to a Slack incoming
// webhook. Silently no-ops if SLACK_GROWTH_WEBHOOK isn't set, so this is
// safe to call in environments (local dev, tests) that don't have it
// configured.
const notifyGrowth = async (text) => {
  if (!process.env.SLACK_GROWTH_WEBHOOK) return;

  try {
    await fetch(process.env.SLACK_GROWTH_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error('❌ Slack notification failed:', error);
  }
};

module.exports = { notifyGrowth };
