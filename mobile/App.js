// mobile/App.js
import './src/utils/webAlertPolyfill';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { SocketProvider } from './src/contexts/SocketContext';

// The page's own background (html/body) is white by default - Expo's web
// reset only sets height, not color. Every screen paints its own dark
// background, but any sliver that isn't covered (a stray gap from a
// Modal's fixed-position overlay animating, a transform-related rendering
// seam, a momentary viewport shift) shows that white through instead of
// blending in. Setting it once here means any such gap reads as "part of
// the dark UI" instead of a visible white/light line at the edge.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.style.backgroundColor = '#000000';
  document.body.style.backgroundColor = '#000000';
}

// Screens
import SplashScreen from './src/screens/SplashScreen';
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';

const Stack = createStackNavigator();

// Lets a shared "…/join/ABC123" link open straight to the join-by-code
// screen with the code pre-filled, instead of landing on the app with no
// indication of what to do next. Only takes effect once the user is
// signed in and the Main stack is mounted - if they aren't logged in yet,
// the link just opens the app normally; there's no persisting it through
// a login redirect yet.
const linking = {
  config: {
    screens: {
      Main: {
        screens: {
          Invite: {
            screens: {
              InviteMain: 'join/:code'
            }
          }
        }
      },
      Auth: {
        screens: {
          ResetPassword: 'reset-password'
        }
      }
    }
  }
};

function RootNavigator() {
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  
  useEffect(() => {
    // Show splash for 3 seconds minimum
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);

  if (loading || showSplash) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SocketProvider>
          <RootNavigator />
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}