// backend/src/config/cors.js
// Allowed origins come from ALLOWED_ORIGINS (comma-separated) so the same
// build can run in dev, staging and prod without code changes. A handful
// of local dev origins are always allowed since they're never reachable
// from outside the developer's machine anyway. Any *.vercel.app origin is
// also allowed - Vercel mints a new, unpredictable subdomain for every
// preview deployment, so an exact-match allowlist can never keep up with
// those; production and preview builds are both reached this way.

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

const isVercelPreview = (origin) => {
  try {
    return new URL(origin).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin) =>
  !origin || allowedOrigins.includes(origin) || isVercelPreview(origin);

// origin is undefined for same-origin/non-browser requests (curl, the
// mobile app's native HTTP client, server-to-server) - always allow those.
const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
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

// Same check, in the shape Socket.IO's cors.origin option expects.
const socketCorsOrigin = (origin, callback) => {
  callback(null, isAllowedOrigin(origin));
};

module.exports = { corsOptions, allowedOrigins, socketCorsOrigin };
