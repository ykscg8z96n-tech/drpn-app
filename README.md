# DRPN

An app for finding and joining local pickup sports, fitness, and group activities — swipe to discover events, chat with organizers and other attendees, and manage your own events as an organizer.

## Repo layout

- `mobile/` — Expo / React Native app (Expo 53, React Native 0.79, React Navigation 7). Auth, event discovery (swipe), matches/chats, event creation and management, join-by-code, profile.
- `backend/` — Express / MongoDB / Socket.IO API.

## Live demo

The `mobile/` app is deployed to Vercel as a static web build, running against a **mock API** so it works standalone with no backend required — a click-through demo of the UI/UX.

- Mock data and endpoint handlers live in `mobile/src/services/mockData.js` and `mobile/src/services/mockApi.js` (via `axios-mock-adapter`), toggled by `USE_MOCK_API` in `mobile/src/utils/constants.js`.
- Log in with any email/password — auth is mocked.
- All demo events, chats, and profile data are fixtures; nothing persists or hits a real server.

## Running the mobile app locally

```bash
cd mobile
npm install
npm start          # Expo dev server (scan the QR code, or press i / a / w)
npm run web         # web only, via Expo
npm run build:web   # static export to mobile/dist (what Vercel deploys)
```

To point the app at a real backend instead of the mock API, set `USE_MOCK_API = false` in `mobile/src/utils/constants.js` and update `API_URL` / `SOCKET_URL` there to your backend's address.

## Running the backend locally

```bash
cd backend
npm install
npm run dev   # nodemon, requires MongoDB + a .env (see backend/.env)
```

## Deploying the mobile web build to Vercel

Vercel is configured to build from this repo with:

- **Root Directory**: `mobile`
- **Build Command**: `npm run build:web`
- **Output Directory**: `dist`
- **Framework Preset**: Other

Pushes to `main` redeploy automatically once the repo is connected in the Vercel dashboard.
