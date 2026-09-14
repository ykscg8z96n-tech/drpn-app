// backend/src/constants/categories.js
// Single source of truth for event/group categories - must match the
// `category` enum on the Event model and the CATEGORIES the mobile app
// hardcodes today (src/screens/Main/SwipeScreen.js and others).

const CATEGORIES_ARRAY = [
  { id: 'sports', name: 'Sports', icon: 'basketball-outline', color: '#FF6B35' },
  { id: 'golf', name: 'Golf', icon: 'golf-outline', color: '#228B22' },
  { id: 'health', name: 'Health', icon: 'body-outline', color: '#9370DB' },
  { id: 'fantasy', name: 'Fantasy', icon: 'trophy-outline', color: '#FFD700' },
  { id: 'cards', name: 'Cards', icon: 'albums-outline', color: '#DC143C' },
  { id: 'tabletop', name: 'Table Top', icon: 'cube-outline', color: '#8B4513' },
];

module.exports = { CATEGORIES_ARRAY };
