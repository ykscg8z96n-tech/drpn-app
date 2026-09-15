// mobile/src/utils/webAlertPolyfill.js
//
// react-native-web's Alert.alert is a complete no-op (see
// node_modules/react-native-web/src/exports/Alert) - it doesn't show
// anything and never calls a button's onPress. Every confirm/cancel flow
// built on Alert.alert (there are a dozen call sites across the app)
// silently hangs on web: a screen that awaits the user's choice before
// continuing - e.g. CreateEventScreen's "become an organizer?" prompt
// before loadMyEvents() runs - never gets an answer, so it never
// proceeds. This replaces Alert.alert with a real implementation on web,
// using the browser's built-in alert()/confirm(), so every existing call
// site starts working without being rewritten individually.
//
// Import this once, for its side effect, before any screen that might
// call Alert.alert mounts (see App.js).
import { Platform, Alert } from 'react-native';

if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actionable = (buttons || []).filter((b) => b.style !== 'cancel');
    const cancelButton = (buttons || []).find((b) => b.style === 'cancel');

    // No buttons, or a single non-cancel button: an informational alert.
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    // Two-plus buttons: window.confirm only gives a yes/no answer, so
    // this covers the common confirm/cancel shape exactly and picks the
    // first non-cancel action for anything with more choices than that.
    const confirmed = window.confirm(text);
    if (confirmed) {
      (actionable[0] || buttons[buttons.length - 1])?.onPress?.();
    } else {
      cancelButton?.onPress?.();
    }
  };
}
