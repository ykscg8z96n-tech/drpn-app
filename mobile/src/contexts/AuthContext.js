// mobile/src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Render's free tier spins the backend down after ~15 min idle and
  // takes 30-60s to cold-start the next request - long enough that the
  // default request timeout below trips before it ever responds, which
  // otherwise looks exactly like a real login failure. Screens can read
  // this to show "waking up the server" instead of a bare error while
  // signIn retries behind the scenes.
  const [wakingBackend, setWakingBackend] = useState(false);
  // Set only by a fresh signUp() - App.js reads this once, as the Main
  // navigator's initial params, to land a brand new account straight in
  // the bot's welcome chat instead of the normal LFG tab. Not touched by
  // signIn/loadStoredData, so a returning user never sees it.
  const [pendingWelcomeChat, setPendingWelcomeChat] = useState(null);

  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      const storedToken = await AsyncStorage.getItem('userToken');

      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser));
        api.defaults.headers.authorization = `Bearer ${storedToken}`;
      }
    } catch (error) {
      console.error('Error loading stored data:', error);
    } finally {
      setLoading(false);
    }
  };

  const finishSignIn = async (response) => {
    const { token, user } = response.data;
    await AsyncStorage.setItem('userToken', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    api.defaults.headers.authorization = `Bearer ${token}`;
    setUser(user);
  };

  const signIn = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password }, { timeout: 12000 });
      await finishSignIn(response);
      return { success: true };
    } catch (error) {
      // No response at all (as opposed to a 401/400 with a real message)
      // is the signature of a cold backend - the request just times out
      // waiting for the free instance to boot, rather than getting a
      // rejection. Wait for it to actually come up (a cheap /health hit
      // with room for the full cold-start window), then retry the real
      // login once before giving up.
      if (!error.response) {
        setWakingBackend(true);
        try {
          await api.get('/health', { timeout: 60000 });
          const retryResponse = await api.post('/auth/login', { email, password }, { timeout: 15000 });
          await finishSignIn(retryResponse);
          return { success: true };
        } catch (retryError) {
          return {
            success: false,
            message: retryError.response?.data?.message
              || "The server is taking longer than usual to start. Please try again in a moment."
          };
        } finally {
          setWakingBackend(false);
        }
      }
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  };

  const signUp = async (userData) => {
  try {
    const response = await api.post('/auth/register', userData);
    const { token, user } = response.data;

    await AsyncStorage.setItem('userToken', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));

    api.defaults.headers.authorization = `Bearer ${token}`;

    // Best-effort - if this fails, signup still succeeds, the user just
    // lands on the normal LFG tab instead of the welcome chat.
    try {
      const botChatResponse = await api.get('/users/bot-chat');
      setPendingWelcomeChat(botChatResponse.data.data);
    } catch (botError) {
      console.error('Error loading welcome chat:', botError);
    }

    setUser(user);

    return { success: true };
  } catch (error) {
    console.error('Signup error:', error);  // Add this line
    console.error('Error details:', error.response?.data);  // Add this line
    return { 
      success: false, 
      message: error.response?.data?.message || 'Registration failed' 
    };
  }
};

  const signOut = async () => {
    try {
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('user');
      setUser(null);
      setPendingWelcomeChat(null);
      delete api.defaults.headers.authorization;
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    AsyncStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider 
      value={{
        user,
        loading,
        wakingBackend,
        pendingWelcomeChat,
        signIn,
        signUp,
        signOut,
        updateUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};