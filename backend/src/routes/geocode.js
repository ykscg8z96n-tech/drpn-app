// backend/src/routes/geocode.js - address autocomplete via OpenStreetMap Nominatim
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Nominatim's usage policy caps free/anonymous use at ~1 request/sec and
// requires a real identifying User-Agent - this serializes outgoing
// requests through a single queue so a burst of keystrokes from any user
// never exceeds that, instead of each request racing out independently.
let queue = Promise.resolve();
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1100;

function throttledFetch(url) {
  const run = queue.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return fetch(url, {
      headers: {
        'User-Agent': 'DRPN-App/1.0 (pre-launch beta; contact via app)'
      }
    });
  });
  // Keep the queue alive even if this particular request fails.
  queue = run.catch(() => {});
  return run;
}

// @route   GET /api/geocode/search
// @desc    Address autocomplete - proxies OpenStreetMap Nominatim so the
//          client never needs its own API key and Nominatim's usage
//          policy (custom User-Agent, rate limit) is enforced in one place.
// @access  Private
router.get('/search', protect, async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (query.length < 3) {
      return res.json({ success: true, data: [] });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`;
    const response = await throttledFetch(url);
    if (!response.ok) {
      return res.status(502).json({ success: false, message: 'Geocoding service unavailable' });
    }

    const results = await response.json();
    const data = results.map(place => {
      const addr = place.address || {};
      const city = addr.city || addr.town || addr.village || addr.hamlet || '';
      // Prefer the short state code embedded in ISO3166-2-lvl4 (e.g.
      // "US-NY" -> "NY") to match the "City, ST" format used elsewhere in
      // the app; fall back to the full state name if that's missing.
      const isoState = addr['ISO3166-2-lvl4']?.split('-')[1];
      const state = isoState || addr.state || addr.region || '';

      return {
        fullAddress: place.display_name,
        city,
        state,
        address: city && state ? `${city}, ${state}` : place.display_name,
        coordinates: [parseFloat(place.lon), parseFloat(place.lat)]
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Geocode search error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
