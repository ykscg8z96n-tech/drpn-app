// mobile/src/screens/Main/ChatScreen.js - YouTube Style with Discord Features
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../services/api';

const { width } = Dimensions.get('window');

export default function ChatScreen({ route, navigation }) {
  const { chatId, eventId, eventName, eventType } = route.params || {};
  const { user } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [lastReadMessageId, setLastReadMessageId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadBanner, setShowUnreadBanner] = useState(false);
  
  const flatListRef = useRef(null);
  const finalChatId = chatId || eventId;

  // Load event data and messages
  const loadMessages = useCallback(async (showLoadingSpinner = true) => {
    if (!finalChatId || !user?.id) {
      setError('Missing chat information');
      setLoading(false);
      return;
    }

    try {
      if (showLoadingSpinner) {
        setLoading(true);
      }
      setError(null);

      console.log('🔍 Loading chat data for:', {
        chatId: finalChatId,
        eventType: eventType,
        eventName: eventName
      });

      // Load event data first (only on initial load)
      if (showLoadingSpinner && !eventData) {
        try {
          const eventResponse = await api.get(`/events/${finalChatId}`);
          if (eventResponse.data.success) {
            setEventData(eventResponse.data.data);
            console.log('✅ Event data loaded:', eventResponse.data.data.name);
          }
        } catch (eventError) {
          console.log('⚠️ Could not load event data:', eventError.response?.status);
          // Continue anyway - we can still load messages
        }
      }

      // Use the correct message endpoints from your backend
      let messagesResponse;
      let endpoint;
      
      if (eventType === 'private') {
        endpoint = `/messages/private/${finalChatId}`;
      } else {
        // For both 'event' and 'group' types, use the event endpoint
        endpoint = `/messages/event/${finalChatId}`;
      }

      try {
        console.log(`🔍 Loading messages from: ${endpoint}`);
        messagesResponse = await api.get(endpoint);
        
        if (messagesResponse.data.success) {
          console.log(`✅ Messages loaded successfully`);
          const loadedMessages = messagesResponse.data.data || [];
          
          // Messages come in chronological order, reverse to show newest at top
          setMessages(loadedMessages.reverse());
          
          // Calculate unread messages (simplified for now)
          setUnreadCount(0); // Will implement proper unread tracking later
          setShowUnreadBanner(false);
          
          // Auto-scroll to top (newest messages) only on initial load or when we have new messages
          if (showLoadingSpinner || loadedMessages.length > messages.length) {
            setTimeout(() => {
              if (flatListRef.current && loadedMessages.length > 0) {
                flatListRef.current.scrollToOffset({ offset: 0, animated: true });
              }
            }, 100);
          }
        } else {
          console.log('ℹ️ API returned success: false');
          setMessages([]);
          setUnreadCount(0);
          setShowUnreadBanner(false);
        }
      } catch (messagesError) {
        console.log(`❌ Failed to load messages:`, messagesError.response?.status);
        if (messagesError.response?.status === 404) {
          // This is normal for new chats with no messages yet
          console.log('ℹ️ No messages found - this might be a new chat');
          setMessages([]);
          setUnreadCount(0);
          setShowUnreadBanner(false);
        } else {
          throw messagesError; // Re-throw other errors
        }
      }
    } catch (error) {
      console.error('❌ Error in loadMessages:', error);
      if (showLoadingSpinner) {
        setError(`Failed to load chat: ${error.response?.data?.message || error.message}`);
      }
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      }
    }
  }, [finalChatId, user?.id, eventType, eventName, eventData, messages.length]);

  // Set navigation header
  useEffect(() => {
    navigation.setOptions({
      title: eventName || 'Chat',
      headerStyle: {
        backgroundColor: '#000000',
      },
      headerTintColor: '#FFFFFF',
      headerTitleStyle: {
        fontWeight: '600',
      },
    });
  }, [navigation, eventName]);

  // Load messages on focus
  useFocusEffect(
    useCallback(() => {
      if (finalChatId) {
        loadMessages();
      }
    }, [loadMessages, finalChatId])
  );

  // Live updates: join this chat's room and append messages from other
  // participants as they arrive, instead of only seeing them on refocus.
  // Own sends are skipped here since they're already added optimistically
  // by sendMessage() below.
  useEffect(() => {
    if (!socket || !finalChatId || !eventType || eventType === 'private') return;

    const roomChatId = `${eventType}-${finalChatId}`;
    socket.emit('chat:join', { chatType: eventType, chatId: roomChatId });

    const handleNewMessage = (message) => {
      if (message.chatId !== roomChatId) return;
      const senderId = message.sender?._id || message.sender;
      if (senderId === user?.id) return;
      setMessages(prev => [message, ...prev]);
    };
    socket.on('message:new', handleNewMessage);

    return () => {
      socket.emit('chat:leave', { chatType: eventType, chatId: roomChatId });
      socket.off('message:new', handleNewMessage);
    };
  }, [socket, finalChatId, eventType, user?.id]);

  // Listen for the ack/error of our own sent messages (see sendMessage).
  useEffect(() => {
    if (!socket) return;

    const handleAck = ({ clientId, _id, seq, createdAt }) => {
      if (!clientId) return;
      setMessages(prev => prev.map(m =>
        m.clientId === clientId ? { ...m, _id, seq, createdAt, pending: false } : m
      ));
    };
    const handleError = ({ clientId, reason }) => {
      if (!clientId) return;
      setMessages(prev => prev.map(m =>
        m.clientId === clientId ? { ...m, failed: true, pending: false } : m
      ));
      Alert.alert('Error', reason || 'Failed to send message');
    };

    socket.on('message:ack', handleAck);
    socket.on('message:error', handleError);
    return () => {
      socket.off('message:ack', handleAck);
      socket.off('message:error', handleError);
    };
  }, [socket]);

  // Send message
  const sendMessage = async () => {
    const text = messageText.trim();
    if (!text || sending) return;

    setMessageText('');

    const clientId = `${user?.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const roomChatId = `${eventType}-${finalChatId}`;

    // Optimistic bubble - reconciled by message:ack (id/seq filled in) or
    // flagged failed by message:error, rather than waiting on a request
    // round trip to show anything.
    const optimisticMessage = {
      _id: clientId,
      clientId,
      text,
      sender: user,
      createdAt: new Date().toISOString(),
      isOwn: true,
      pending: true,
    };
    setMessages(prev => [optimisticMessage, ...prev]);
    setTimeout(() => {
      if (flatListRef.current) {
        flatListRef.current.scrollToOffset({ offset: 0, animated: true });
      }
    }, 100);

    // Prefer the socket path (gets an ack, dedupes retries via clientId) -
    // fall back to REST only if the socket isn't connected.
    if (socket && socket.connected) {
      socket.emit('message:send', { chatType: eventType || 'event', chatId: roomChatId, clientId, text });
      return;
    }

    setSending(true);
    try {
      const messageData = {
        text,
        chatType: eventType || 'event',
        eventId: eventType === 'private' ? undefined : finalChatId,
        privateConnectionId: eventType === 'private' ? finalChatId : undefined,
        clientId,
      };
      const response = await api.post('/messages', messageData);
      if (response.data.success) {
        setMessages(prev => prev.map(m =>
          m.clientId === clientId ? { ...m, _id: response.data.data._id, pending: false } : m
        ));
      } else {
        throw new Error('Server returned success: false');
      }
    } catch (error) {
      console.error('❌ Error sending message:', error);
      setMessages(prev => prev.map(m =>
        m.clientId === clientId ? { ...m, failed: true, pending: false } : m
      ));
      Alert.alert('Error', `Failed to send message: ${error.response?.data?.message || error.message}`);
    } finally {
      setSending(false);
    }
  };

  // Format time like YouTube
  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = (now - date) / (1000 * 60);
    
    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${Math.floor(diffInMinutes)}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    return date.toLocaleDateString();
  };

  // Get user initials
  const getInitials = (name) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  };

  // Check if user is organizer
  const isOrganizer = (userId) => {
    return eventData?.organizer === userId || eventData?.organizer?._id === userId;
  };

  // Render unread messages banner (Discord-style)
  const renderUnreadBanner = () => {
    if (!showUnreadBanner || unreadCount === 0) return null;

    return (
      <View style={styles.unreadBanner}>
        <View style={styles.unreadBannerContent}>
          <Text style={styles.unreadBannerText}>
            {unreadCount} new message{unreadCount !== 1 ? 's' : ''} since {formatTime(new Date())}
          </Text>
          <TouchableOpacity
            style={styles.unreadBannerClose}
            onPress={() => {
              setShowUnreadBanner(false);
              setUnreadCount(0);
            }}
          >
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render message item (YouTube comment style)
  const renderMessage = ({ item, index }) => {
    const isOwn = item.sender?._id === user?.id || item.isOwn;
    const isOrganizerMessage = isOrganizer(item.sender?._id);
    const senderName = item.sender?.name || 'Unknown User';
    
    return (
      <View style={[
        styles.messageContainer,
        isOrganizerMessage && styles.organizerMessageContainer,
        item.pending && styles.pendingMessage
      ]}>
        {/* User Avatar */}
        <View style={styles.avatarContainer}>
          {item.sender?.photos && item.sender.photos.length > 0 ? (
            <Image 
              source={{ uri: item.sender.photos[0].url || item.sender.photos[0] }} 
              style={styles.avatar}
            />
          ) : (
            <View style={[
              styles.avatarPlaceholder,
              isOrganizerMessage && styles.organizerAvatar
            ]}>
              <Text style={styles.avatarText}>
                {getInitials(senderName)}
              </Text>
            </View>
          )}
        </View>

        {/* Message Content */}
        <View style={styles.messageContent}>
          {/* Header: Name, Badge, Time */}
          <View style={styles.messageHeader}>
            <Text style={[
              styles.senderName,
              isOrganizerMessage && styles.organizerName
            ]}>
              {senderName}
            </Text>
            
            {isOrganizerMessage && (
              <View style={styles.organizerBadge}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={styles.organizerBadgeText}>Organizer</Text>
              </View>
            )}
            
            <Text style={styles.messageTime}>
              {item.failed ? 'Failed to send' : formatTime(item.createdAt)}
            </Text>
          </View>

          {/* Message Text */}
          <Text style={[
            styles.messageText,
            isOrganizerMessage && styles.organizerMessageText
          ]}>
            {item.text}
          </Text>

          {/* Message Actions (YouTube-style) */}
          <View style={styles.messageActions}>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="thumbs-up-outline" size={16} color="#CCCCCC" />
              <Text style={styles.actionText}>0</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="thumbs-down-outline" size={16} color="#CCCCCC" />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.replyText}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Render input area
  const renderInputArea = () => (
    <View style={styles.inputContainer}>
      {/* User Avatar */}
      <View style={styles.inputAvatarContainer}>
        {user?.photos && user.photos.length > 0 ? (
          <Image 
            source={{ uri: user.photos[0].url || user.photos[0] }} 
            style={styles.inputAvatar}
          />
        ) : (
          <View style={styles.inputAvatarPlaceholder}>
            <Text style={styles.inputAvatarText}>
              {getInitials(user?.name)}
            </Text>
          </View>
        )}
      </View>

      {/* Input Field */}
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.textInput}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Add a comment..."
          placeholderTextColor="#666666"
          multiline
          maxLength={1000}
        />
        
        {messageText.trim().length > 0 && (
          <TouchableOpacity
            style={styles.sendButton}
            onPress={sendMessage}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#0078FF" />
            ) : (
              <Text style={styles.sendButtonText}>Comment</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0078FF" />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={60} color="#FF3B30" />
        <Text style={styles.errorTitle}>Unable to Load Chat</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadMessages}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {renderUnreadBanner()}
      
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item._id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        inverted={false} // Keep normal order since we're reversing the data
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={60} color="#666666" />
            <Text style={styles.emptyStateText}>
              Welcome to {eventName}!
            </Text>
            <Text style={styles.emptyStateSubtext}>
              Be the first to start the conversation
            </Text>
          </View>
        )}
      />
      
      {renderInputArea()}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  
  // Loading & Error States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#000000',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF3B30',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#0078FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Unread Banner (Discord-style)
  unreadBanner: {
    backgroundColor: '#5865F2',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  unreadBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unreadBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  unreadBannerClose: {
    padding: 4,
  },

  // Messages List
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexGrow: 1,
  },

  // Message Container (YouTube comment style)
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  organizerMessageContainer: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)', // Subtle gold highlight
    marginHorizontal: -8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
  },
  pendingMessage: {
    opacity: 0.5,
  },

  // Avatar
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  organizerAvatar: {
    backgroundColor: '#FFD700',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Message Content
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  senderName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  organizerName: {
    color: '#FFD700',
  },
  organizerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  organizerBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFD700',
  },
  messageTime: {
    fontSize: 12,
    color: '#999999',
    marginLeft: 'auto',
  },

  // Message Text
  messageText: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 8,
  },
  organizerMessageText: {
    // Could add special styling for organizer messages
  },

  // Message Actions (YouTube-style)
  messageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  replyText: {
    fontSize: 12,
    color: '#CCCCCC',
    fontWeight: '500',
  },

  // Input Area (YouTube-style)
  inputContainer: {
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  inputAvatarContainer: {
    marginTop: 4,
  },
  inputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  inputAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  textInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    paddingVertical: 8,
    paddingHorizontal: 0,
    fontSize: 14,
    color: '#FFFFFF',
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#0078FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
});