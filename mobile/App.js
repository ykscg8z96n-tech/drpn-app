// mobile/App.js
import './src/utils/webAlertPolyfill';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { SocketProvider } from './src/contexts/SocketContext';

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