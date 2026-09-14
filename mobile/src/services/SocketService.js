// mobile/src/services/SocketService.js
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async connect() {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        console.log('No token found, cannot connect to socket');
        return;
      }

      // Replace with your backend URL
      const SOCKET_URL = __DEV__ 
        ? 'http://172.20.10.2:5000'  // Change to your local IP if testing on device
        : 'https://your-production-url.com';

      console.log('Attempting to connect to:', SOCKET_URL);

      this.socket = io(SOCKET_URL, {
        auth: {
          token: token
        },
        transports: ['websocket'],
        upgrade: true,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        timeout: 20000
      });

      this.setupEventListeners();

    } catch (error) {
      console.error('Error connecting to socket:', error);
    }
  }

  setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('✅ Connected to socket server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connect');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from socket server:', reason);
      this.isConnected = false;
      this.emit('disconnect', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔴 Socket connection error:', error.message);
      this.isConnected = false;
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.emit('connect_error', error);
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected to socket server after', attemptNumber, 'attempts');
      this.isConnected = true;
      this.emit('reconnect', attemptNumber);
    });

    // Handle new messages
    this.socket.on('new-message', (message) => {
      console.log('📨 New message received:', message);
      this.emit('new-message', message);
    });

    // Handle new applicants (for organizers)
    this.socket.on('new-applicant', (data) => {
      console.log('👤 New applicant:', data);
      this.emit('new-applicant', data);
    });

    // Handle match accepted (for individuals)
    this.socket.on('match-accepted', (data) => {
      console.log('🎉 Match accepted:', data);
      this.emit('match-accepted', data);
    });

    // Handle typing indicators
    this.socket.on('user-typing', (data) => {
      this.emit('user-typing', data);
    });

    // Handle user join/leave events
    this.socket.on('user-joined', (data) => {
      console.log('👋 User joined:', data.userName);
      this.emit('user-joined', data);
    });

    this.socket.on('user-left', (data) => {
      console.log('👋 User left:', data.userName);
      this.emit('user-left', data);
    });

    // Handle errors
    this.socket.on('error', (error) => {
      console.error('🔴 Socket error:', error);
      this.emit('error', error);
    });
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting from socket server');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
    }
  }

  // Join a match room for real-time messaging
  joinMatch(matchId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('join-match', matchId);
      console.log(`🚪 Joined match room: ${matchId}`);
    } else {
      console.warn('Cannot join match room - socket not connected');
    }
  }

  // Leave a match room
  leaveMatch(matchId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave-match', matchId);
      console.log(`🚪 Left match room: ${matchId}`);
    }
  }

  // Send a message through socket (for real-time delivery)
  sendMessage(matchId, message) {
    if (this.socket && this.isConnected) {
      this.socket.emit('send-message', {
        matchId,
        message
      });
      console.log(`📤 Message sent via socket for match: ${matchId}`);
    } else {
      console.warn('Cannot send message - socket not connected');
    }
  }

  // Start typing indicator
  startTyping(matchId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('typing-start', matchId);
    }
  }

  // Stop typing indicator
  stopTyping(matchId) {
    if (this.socket && this.isConnected) {
      this.socket.emit('typing-stop', matchId);
    }
  }

  // Subscribe to events
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);
  }

  // Unsubscribe from events
  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      const callbacks = this.listeners.get(eventName);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
      
      // Clean up empty listener arrays
      if (callbacks.length === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  // Emit events to listeners
  emit(eventName, data) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in socket listener for ${eventName}:`, error);
        }
      });
    }
  }

  // Check if socket is connected
  isSocketConnected() {
    return this.socket && this.isConnected;
  }

  // Get socket instance (use sparingly)
  getSocket() {
    return this.socket;
  }

  // Force reconnection
  reconnect() {
    if (this.socket) {
      this.socket.connect();
    }
  }

  // Get connection status
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Export singleton instance
export default new SocketService();