// mobile/src/screens/Main/ChatScreen.js - iPhone Messages style, for event/group chats
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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../services/api';
import ProfilePreviewCard from '../../components/ProfilePreviewCard';

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
  const [viewingProfile, setViewingProfile] = useState(null);
  const [startingChat, setStartingChat] = useState(false);

  const flatListRef = useRef(null);
  const finalChatId = chatId || eventId;

  const handleViewProfile = async (senderId) => {
    if (!senderId || senderId === user?.id) return;
    try {
      const response = await api.get(`/users/${senderId}`);
      if (response.data.success) {
        setViewingProfile(response.data.data);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load profile');
    }
  };

  // Starts a private chat with whoever's profile is open, straight from
  // the roster they're already on - no separate request/accept step.
  const handleMessagePrivately = async () => {
    if (!viewingProfile || startingChat) return;
    setStartingChat(true);
    try {
      const response = await api.post('/private-connections/invite', {
        toUserId: viewingProfile._id,
        originEventId: finalChatId,
        message: `Hi ${viewingProfile.name}!`
      });
      if (response.data.success) {
        setViewingProfile(null);
        // ChatScreen (this screen) and PrivateChat both live in the same
        // Chats-tab stack (see MatchesStack in MainNavigator.js), so a
        // direct navigate reaches it - no need to cross tabs like
        // PendingApplicationsScreen (which lives in the Home tab's stack).
        navigation.navigate('PrivateChat', {
          connectionId: response.data.data._id,
          otherUser: { name: viewingProfile.name, image: viewingProfile.photos?.[0]?.url || viewingProfile.photos?.[0] }
        });
      } else {
        Alert.alert('Error', response.data.message || 'Failed to start chat');
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to start private chat');
    } finally {
      setStartingChat(false);
    }
  };

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

      // Load event data first (only on initial load)
      if (showLoadingSpinner && !eventData) {
        try {
          const eventResponse = await api.get(`/events/${finalChatId}`);
          if (eventResponse.data.success) {
            setEventData(eventResponse.data.data);
          }
        } catch (eventError) {
          // Continue anyway - we can still load messages
        }
      }

      const endpoint = `/messages/event/${finalChatId}`;

      try {
        const messagesResponse = await api.get(endpoint);

        if (messagesResponse.data.success) {
          const loadedMessages = messagesResponse.data.data || [];
          // Messages already come back in chronological order - keep it,
          // newest at the bottom like a normal text thread.
          setMessages(loadedMessages);

          setTimeout(() => {
            if (flatListRef.current && loadedMessages.length > 0) {
              flatListRef.current.scrollToEnd({ animated: false });
            }
          }, 100);
        } else {
          setMessages([]);
        }
      } catch (messagesError) {
        if (messagesError.response?.status === 404) {
          // This is normal for new chats with no messages yet
          setMessages([]);
        } else {
          throw messagesError;
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
  }, [finalChatId, user?.id, eventData]);

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
    if (!socket || !finalChatId || !eventType) return;

    const roomChatId = `${eventType}-${finalChatId}`;
    socket.emit('chat:join', { chatType: eventType, chatId: roomChatId });

    const handleNewMessage = (message) => {
      if (message.chatId !== roomChatId) return;
      const senderId = message.sender?._id || message.sender;
      if (senderId === user?.id) return;
      setMessages(prev => [...prev, message]);
      setTimeout(() => {
        if (flatListRef.current) flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
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
    setMessages(prev => [...prev, optimisticMessage]);
    setTimeout(() => {
      if (flatListRef.current) flatListRef.current.scrollToEnd({ animated: true });
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
        eventId: finalChatId,
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

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getInitials = (name) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  };

  const isOrganizer = (userId) => {
    return eventData?.organizer === userId || eventData?.organizer?._id === userId;
  };

  // Render message item (iPhone Messages style)
  const renderMessage = ({ item, index }) => {
    const isOwn = item.sender?._id === user?.id || item.isOwn;
    const isOrganizerMessage = isOrganizer(item.sender?._id);
    const senderName = item.sender?.name || 'Unknown User';

    const previousMessage = index > 0 ? messages[index - 1] : null;
    const showTimestamp = !previousMessage ||
      new Date(item.createdAt) - new Date(previousMessage.createdAt) > 5 * 60 * 1000;
    // Group/event chats have multiple senders - show the name above a
    // bubble whenever the previous message was from someone else.
    const showSenderName = !isOwn && (!previousMessage || (previousMessage.sender?._id || previousMessage.sender) !== (item.sender?._id || item.sender));

    return (
      <View style={styles.messageContainer}>
        {showTimestamp && (
          <View style={styles.timestampContainer}>
            <Text style={styles.timestampText}>{formatTime(item.createdAt)}</Text>
          </View>
        )}

        <View style={[
          styles.messageBubbleContainer,
          isOwn ? styles.ownMessageContainer : styles.otherMessageContainer
        ]}>
          {!isOwn && (
            <TouchableOpacity style={styles.avatarContainer} onPress={() => handleViewProfile(item.sender?._id)}>
              {item.sender?.photos && item.sender.photos.length > 0 ? (
                <Image
                  source={{ uri: item.sender.photos[0].url || item.sender.photos[0] }}
                  style={styles.messageAvatar}
                />
              ) : (
                <View style={[styles.messageAvatarPlaceholder, isOrganizerMessage && styles.organizerAvatar]}>
                  <Text style={styles.messageAvatarText}>{getInitials(senderName)}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          <View style={{ maxWidth: width * 0.75 }}>
            {showSenderName && (
              <TouchableOpacity style={styles.senderRow} onPress={() => handleViewProfile(item.sender?._id)}>
                <Text style={[styles.senderName, isOrganizerMessage && styles.organizerName]}>
                  {senderName}
                </Text>
                {isOrganizerMessage && (
                  <View style={styles.organizerBadge}>
                    <Ionicons name="star" size={10} color="#FFD700" />
                  </View>
                )}
              </TouchableOpacity>
            )}

            <View style={[
              styles.messageBubble,
              isOwn ? styles.ownMessageBubble : styles.otherMessageBubble,
              item.pending && styles.pendingBubble
            ]}>
              <Text style={[styles.messageText, isOwn ? styles.ownMessageText : styles.otherMessageText]}>
                {item.text}
              </Text>
              {item.failed && <Text style={styles.failedText}>Failed to send</Text>}
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Render input area
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

      <Modal
        visible={!!viewingProfile}
        animationType="slide"
        onRequestClose={() => setViewingProfile(null)}
      >
        <View style={styles.profileModalContainer}>
          <TouchableOpacity style={styles.profileCloseButton} onPress={() => setViewingProfile(null)}>
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          {viewingProfile && <ProfilePreviewCard profile={viewingProfile} />}
          {viewingProfile && (
            <TouchableOpacity
              style={styles.messagePrivatelyButton}
              onPress={handleMessagePrivately}
              disabled={startingChat}
            >
              {startingChat ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="chatbubble" size={18} color="white" />
                  <Text style={styles.messagePrivatelyText}>Message Privately</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Modal>
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

  // Timestamp (centered)
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

  // Avatar (for other users)
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
  organizerAvatar: {
    backgroundColor: '#FFD700',
  },
  messageAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Sender name (group/event chats have multiple senders)
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
    marginLeft: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999999',
  },
  organizerName: {
    color: '#FFD700',
  },
  organizerBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 4,
    padding: 2,
  },

  // Message Bubble
  messageBubble: {
    maxWidth: width * 0.75,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  ownMessageBubble: {
    backgroundColor: '#0078FF',
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#333333',
    borderBottomLeftRadius: 4,
  },
  pendingBubble: {
    opacity: 0.5,
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
  failedText: {
    fontSize: 11,
    color: '#FF3B30',
    marginTop: 2,
  },

  // Input Area
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

  // Profile Preview Modal
  profileModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  profileCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 6,
  },
  messagePrivatelyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0078FF',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
  },
  messagePrivatelyText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
