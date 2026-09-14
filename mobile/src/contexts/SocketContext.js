// mobile/src/contexts/SocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '../services/api';
import { USE_MOCK_API } from '../utils/constants';
import { useAuth } from './AuthContext';

const SocketContext = createContext({});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { user, token } = useAuth();

  useEffect(() => {
    let newSocket = null;

    // Only connect if we have a user with an id and a token (skipped entirely
    // in mock demo mode, since there is no live socket server to connect to)
    if (!USE_MOCK_API && user && user.id && token) {
      console.log('🔌 Connecting to socket server');
      
      newSocket = io(API_BASE_URL, {
        auth: { token },
        transports: ['websocket']
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to socket server');
      });

      newSocket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from socket server:', reason);
      });

      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
      });

      setSocket(newSocket);
    }

    // Cleanup function
    return () => {
      if (newSocket) {
        console.log('🔌 Cleaning up socket connection');
        newSocket.disconnect();
      }
      setSocket(null);
    };
  }, [user?.id, token]); // Use optional chaining and only re-run when these change

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};