// backend/src/routes/geocode.js - address autocomplete via Google Places API (New)
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// @route   GET /api/geocode/search
// @desc    Address/POI autocomplete - proxies Google Places Autocomplete
//          (New) so the client never needs its own API key. Returns bare
//          predictions (placeId + display text) only, not coordinates -
//          those cost a separate, pricier Place Details call, so they're
//          only fetched once via GET /place/:placeId when someone
//          actually picks a suggestion, not on every keystroke.
// @access  Private
router.get('/search', protect, async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (query.length < 3) {
      return res.json({ success: true, data: [] });
    }
    if (!GOOGLE_PLACES_API_KEY) {
      console.error('❌ GOOGLE_PLACES_API_KEY is not set');
      return res.status(503).json({ success: false, message: 'Address search is not configured' });
    }

    // sessionToken groups every autocomplete keystroke plus the eventual
    // Place Details call into one billable "session" instead of billing
    // each request separately - the mobile client mints one per search
    // and reuses it until a suggestion is picked (see
    // AddressAutocompleteInput.js). Falling back to an unscoped request
    // if it's missing still works, just without the pricing benefit.
    const body = {
      input: query,
      // Forces Latin-script/English results (e.g. "Riyadh" not "الرياض")
      // instead of each place's native-script name.
      languageCode: 'en',
      ...(req.query.sessionToken ? { sessionToken: req.query.sessionToken } : {})
    };

    // Optional soft bias toward wherever the caller already is (device
    // location, or profile/browse location) - a circle bias nudges
    // results without excluding a real match further away.
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: 50000.0 // meters - a soft "nearby" bias, not a hard filter
        }
      };
    }

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error('❌ Google Autocomplete error:', response.status, await response.text());
      return res.status(502).json({ success: false, message: 'Address search unavailable' });
    }

    const result = await response.json();
    const data = (result.suggestions || [])
      .filter(s => s.placePrediction)
      .map(s => ({
        placeId: s.placePrediction.placeId,
        fullAddress: s.placePrediction.text?.text || ''
      }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Geocode search error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/geocode/place/:placeId
// @desc    Resolve a chosen autocomplete suggestion to a full address +
//          coordinates. Pass the same sessionToken used for the search
//          calls that led here to close out that billing session.
// @access  Private
router.get('/place/:placeId', protect, async (req, res) => {
  try {
    const { placeId } = req.params;
    if (!GOOGLE_PLACES_API_KEY) {
      console.error('❌ GOOGLE_PLACES_API_KEY is not set');
      return res.status(503).json({ success: false, message: 'Address search is not configured' });
    }

    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
    url.searchParams.set('languageCode', 'en');
    if (req.query.sessionToken) {
      url.searchParams.set('sessionToken', req.query.sessionToken);
    }

    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        // Field mask keeps this call in the cheaper "Basic" data tier -
        // only ask for what's actually used below.
        'X-Goog-FieldMask': 'formattedAddress,addressComponents,location'
      }
    });

    if (!response.ok) {
      console.error('❌ Google Place Details error:', response.status, await response.text());
      return res.status(502).json({ success: false, message: 'Address lookup unavailable' });
    }

    const place = await response.json();
    const components = place.addressComponents || [];
    const findComponent = (type) => components.find(c => c.types?.includes(type))?.shortText || '';
    const city = findComponent('locality') || findComponent('postal_town') || findComponent('sublocality') || '';
    const state = findComponent('administrative_area_level_1') || '';

    res.json({
      success: true,
      data: {
        fullAddress: place.formattedAddress || '',
        city,
        state,
        address: city && state ? `${city}, ${state}` : (place.formattedAddress || ''),
        coordinates: [place.location?.longitude, place.location?.latitude]
      }
    });
  } catch (error) {
    console.error('❌ Geocode place error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
