// mobile/src/contexts/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const signIn = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;

      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));

      api.defaults.headers.authorization = `Bearer ${token}`;
      setUser(user);

      return { success: true };
    } catch (error) {
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