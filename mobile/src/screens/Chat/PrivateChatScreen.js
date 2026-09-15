// mobile/src/screens/Main/PrivateChatScreen.js - iPhone Messages Style
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

export default function PrivateChatScreen({ route, navigation }) {
  const { connectionId, otherUser } = route.params || {};
  const { user } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [otherUserData, setOtherUserData] = useState(otherUser || null);
  const [chatRoomId, setChatRoomId] = useState(null);
  
  const flatListRef = useRef(null);

  // Load messages
  const loadMessages = useCallback(async (showLoadingSpinner = true) => {
    if (!connectionId || !user?.id) {
      setError('Missing connection information');
      setLoading(false);
      return;
    }

    try {
      if (showLoadingSpinner) {
        setLoading(true);
      }
      setError(null);

      console.log('💬 Loading private messages for connection:', connectionId);

      const endpoint = `/messages/private/${connectionId}`;
      const messagesResponse = await api.get(endpoint);
      
      if (messagesResponse.data.success) {
        console.log('✅ Private messages loaded');
        const loadedMessages = messagesResponse.data.data || [];
        if (messagesResponse.data.chatInfo?.chatRoomId) {
          setChatRoomId(messagesResponse.data.chatInfo.chatRoomId);
        }

        // For iPhone style, newest messages at bottom (traditional chat order)
        setMessages(loadedMessages);
        
        // Auto-scroll to bottom (newest messages) 
        setTimeout(() => {
          if (flatListRef.current && loadedMessages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      } else {
        console.log('ℹ️ API returned success: false');
        setMessages([]);
      }
    } catch (messagesError) {
      console.log(`❌ Failed to load private messages:`, messagesError.response?.status);
      if (messagesError.response?.status === 404) {
        console.log('ℹ️ No messages found - new private chat');
        setMessages([]);
      } else if (showLoadingSpinner) {
        setError(`Failed to load chat: ${messagesError.response?.data?.message || messagesError.message}`);
      }
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      }
    }
  }, [connectionId, user?.id]);

  // Set navigation header
  useEffect(() => {
    navigation.setOptions({
      // A back button only shows automatically if this screen has real
      // navigation history behind it - refreshing the browser while
      // already on this chat (the URL is synced per-screen) leaves React
      // Navigation with just this one route and nothing to go back to,
      // so the default header back button silently doesn't appear. This
      // always has somewhere to go.
      headerLeft: () => (
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MatchesMain')}
        >
          <Ionicons name="chevron-back" size={28} color="#0078FF" />
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          {otherUserData?.image ? (
            <Image source={{ uri: otherUserData.image }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarText}>{getInitials(otherUserData?.name)}</Text>
            </View>
          )}
          <Text style={styles.headerTitleText} numberOfLines={1}>
            {otherUserData?.name || 'Private Chat'}
          </Text>
        </View>
      ),
      headerStyle: {
        backgroundColor: '#000000',
      },
      headerTintColor: '#FFFFFF',
    });
  }, [navigation, otherUserData]);

  // Load messages on focus
  useFocusEffect(
    useCallback(() => {
      if (connectionId) {
        loadMessages();
      }
    }, [loadMessages, connectionId])
  );

  // Live updates: join this chat's canonical room (shared between both
  // participants regardless of which PrivateConnection doc they're on)
  // and append the other person's messages as they arrive. Own sends
  // are skipped since they're already added optimistically below.
  useEffect(() => {
    if (!socket || !chatRoomId) return;

    socket.emit('chat:join', { chatType: 'private', chatId: chatRoomId });

    const handleNewMessage = (message) => {
      if (message.chatId !== chatRoomId) return;
      const senderId = message.sender?._id || message.sender;
      if (senderId === user?.id) return;
      setMessages(prev => [...prev, message]);
      setTimeout(() => {
        if (flatListRef.current) flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
    };
    socket.on('message:new', handleNewMessage);

    return () => {
      socket.emit('chat:leave', { chatType: 'private', chatId: chatRoomId });
      socket.off('message:new', handleNewMessage);
    };
  }, [socket, chatRoomId, user?.id]);

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

    const optimisticMessage = {
      _id: clientId,
      clientId,
      text,
      sender: user,
      createdAt: new Date().toISOString(),
      isOwn: true,
      pending: true,
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setTimeout(() => {
      if (flatListRef.current) flatListRef.current.scrollToEnd({ animated: true });
    }, 100);

    // Prefer the socket path (gets an ack, dedupes retries via clientId) -
    // fall back to REST only if the socket isn't connected or the room id
    // isn't known yet (chatRoomId only arrives after the first load).
    if (socket && socket.connected && chatRoomId) {
      socket.emit('message:send', { chatType: 'private', chatId: chatRoomId, clientId, text });
      return;
    }

    setSending(true);
    try {
      const messageData = {
        text,
        chatType: 'private',
        privateConnectionId: connectionId,
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
      console.error('❌ Error sending private message:', error);
      setMessages(prev => prev.map(m =>
        m.clientId === clientId ? { ...m, failed: true, pending: false } : m
      ));
      Alert.alert('Error', `Failed to send message: ${error.response?.data?.message || error.message}`);
    } finally {
      setSending(false);
    }
  };

  // Format time like iPhone Messages
  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Get user initials
  const getInitials = (name) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  };

  // Render message item (iPhone Messages style)
  const renderMessage = ({ item, index }) => {
    const isOwn = item.sender?._id === user?.id || item.isOwn;
    const senderName = item.sender?.name || 'Unknown User';
    
    // Check if we should show timestamp (show every few messages or if time gap is large)
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const showTimestamp = !previousMessage || 
      new Date(item.createdAt) - new Date(previousMessage.createdAt) > 5 * 60 * 1000; // 5 minutes
    
    return (
      <View style={styles.messageContainer}>
        {/* Timestamp (centered, like iPhone) */}
        {showTimestamp && (
          <View style={styles.timestampContainer}>
            <Text style={styles.timestampText}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        )}

        {/* Message Bubble */}
        <View style={[
          styles.messageBubbleContainer,
          isOwn ? styles.ownMessageContainer : styles.otherMessageContainer
        ]}>
          {/* Show avatar for other user's messages */}
          {!isOwn && (
            <View style={styles.avatarContainer}>
              {item.sender?.photos && item.sender.photos.length > 0 ? (
                <Image 
                  source={{ uri: item.sender.photos[0].url || item.sender.photos[0] }} 
                  style={styles.messageAvatar}
                />
              ) : (
                <View style={styles.messageAvatarPlaceholder}>
                  <Text style={styles.messageAvatarText}>
                    {getInitials(senderName)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Message Bubble */}
          <View style={[
            styles.messageBubble,
            isOwn ? styles.ownMessageBubble : styles.otherMessageBubble,
            item.pending && styles.pendingBubble
          ]}>
            <Text style={[
              styles.messageText,
              isOwn ? styles.ownMessageText : styles.otherMessageText
            ]}>
              {item.text}
            </Text>
            {item.failed && <Text style={styles.failedText}>Failed to send</Text>}
          </View>
        </View>
      </View>
    );
  };

  // Render input area (iPhone Messages style)
  const renderInputArea = () => (
    <View style={styles.inputContainer}>
      <View style={styles.inputWrapper}>
        <View style={styles.textInputContainer}>
          <TextInput
            style={styles.textInput}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Message"
            placeholderTextColor="#999999"
            multiline
            maxLength={1000}
          />
        </View>
        
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!messageText.trim() || sending) && styles.sendButtonDisabled
          ]}
          onPress={sendMessage}
          disabled={!messageText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
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
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item._id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <View style={styles.emptyAvatarContainer}>
              {otherUserData?.image ? (
                <Image 
                  source={{ uri: otherUserData.image }} 
                  style={styles.emptyAvatar}
                />
              ) : (
                <View style={styles.emptyAvatarPlaceholder}>
                  <Text style={styles.emptyAvatarText}>
                    {getInitials(otherUserData?.name)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.emptyStateText}>
              {otherUserData?.name || 'Private Chat'}
            </Text>
            <Text style={styles.emptyStateSubtext}>
              Send a message to start your conversation
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
  
  // Header
  headerBackButton: {
    padding: 4,
    marginLeft: -4,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  headerAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  headerTitleText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    maxWidth: 180,
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

  // Messages List
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexGrow: 1,
  },

  // Message Container (iPhone style)
  messageContainer: {
    marginBottom: 8,
  },
  
  // Timestamp (iPhone style - centered)
  timestampContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  timestampText: {
    fontSize: 12,
    color: '#999999',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  // Message Bubble Container
  messageBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  ownMessageContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
  },

  // Avatar (for other user)
  avatarContainer: {
    marginRight: 8,
  },
  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  messageAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Message Bubble (iPhone style)
  messageBubble: {
    maxWidth: width * 0.75,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  ownMessageBubble: {
    backgroundColor: '#0078FF', // iPhone blue
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#333333', // Dark gray for dark mode
    borderBottomLeftRadius: 4,
  },
  pendingBubble: {
    opacity: 0.5,
  },
  failedText: {
    fontSize: 11,
    color: '#FF3B30',
    marginTop: 2,
  },

  // Message Text
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#FFFFFF',
  },

  // Input Area (iPhone Messages style)
  inputContainer: {
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInputContainer: {
    flex: 1,
    backgroundColor: '#333333',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },
  textInput: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0078FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#666666',
  },

  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyAvatarContainer: {
    marginBottom: 16,
  },
  emptyAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  emptyAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyAvatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
});