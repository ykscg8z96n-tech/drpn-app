// backend/src/config/cors.js
// Allowed origins come from ALLOWED_ORIGINS (comma-separated) so the same
// build can run in dev, staging and prod without code changes. A handful
// of local dev origins are always allowed since they're never reachable
// from outside the developer's machine anyway.

const devOrigins = [
  'http://localhost:3000',
  'http://localhost:19006',
  'http://localhost:19000',
  'exp://localhost:19000',
];

const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...devOrigins, ...configuredOrigins];

// origin is undefined for same-origin/non-browser requests (curl, the
// mobile app's native HTTP client, server-to-server) - always allow those.
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      const err = new Error(`CORS: origin ${origin} not allowed`);
      err.status = 403;
      callback(err);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = { corsOptions, allowedOrigins };
