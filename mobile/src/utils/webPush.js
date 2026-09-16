// mobile/src/utils/webPush.js - Web Push subscription (web platform only).
// Native builds have no equivalent yet (this app has never been tested
// as an installed native app, only through the web build) - every
// function here is a no-op off web.
import { Platform } from 'react-native';
import api from '../services/api';

// The Push API wants the VAPID public key as a Uint8Array, but servers
// hand it out as a URL-safe base64 string - this is the standard
// conversion (from the Web Push / web.dev docs).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported() {
  return (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

// Subscribes the current viewer to push and registers it with the
// backend. Safe to call every app load - re-subscribing with an
// already-subscribed registration just returns the existing
// subscription rather than creating a duplicate, and the backend
// dedupes by endpoint regardless.
export async function registerForPushNotifications() {
  if (!isPushSupported()) return;

  try {
    if (Notification.permission === 'denied') return;
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const { data } = await api.get('/push/vapid-public-key');
      if (!data.publicKey) return;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }

    const json = subscription.toJSON();
    await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  } catch (error) {
    // Notification permission dialogs can be dismissed, denied, or
    // unsupported in this particular browser context (e.g. Safari
    // outside of an installed PWA) - none of that should be treated as
    // an app error, just silently skip push for this session.
    console.warn('Push registration skipped:', error.message);
  }
}
