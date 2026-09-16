// mobile/src/screens/Main/MatchesScreen.js - Matching CreateEventScreen UI
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const { width } = Dimensions.get('window');

// Stock images for each category - Add these files to mobile/assets/stock-images/
const STOCK_IMAGES = {
  tabletop: require('../../../assets/stock-images/tabletop-stock.jpg'),
  cards: require('../../../assets/stock-images/cards-stock.jpg'),
  fantasy: require('../../../assets/stock-images/fantasy-stock.jpg'),
  sports: require('../../../assets/stock-images/sports-stock.jpg'),
  golf: require('../../../assets/stock-images/golf-stock.jpg'),
  health: require('../../../assets/stock-images/health-stock.jpg'),
};

// Helper function to get the display image (same logic as CreateEventScreen)
const getChatDisplayImage = (item) => {
  // For private chats, try to get user photo
  if (item.type === 'private') {
    if (item.image) {
      return { uri: item.image };
    }
    // No stock images for private chats, will show initials
    return null;
  }
  
  // For events/groups: Priority: 1. Event/group photos, 2. Category stock image, 3. Default tabletop
  if (item.image) {
    return { uri: item.image };
  }
  
  if (item.category && STOCK_IMAGES[item.category]) {
    return STOCK_IMAGES[item.category];
  }
  
  // Default fallback
  return STOCK_IMAGES.tabletop;
};

// Match Item Component - Matching CreateEventScreen style
const MatchItem = ({ item, onPress }) => {
  const getCategoryColor = (category) => {
    const colors = {
      sports: '#FF6B35',
      golf: '#228B22', 
      health: '#9370DB',
      fantasy: '#FFD700',
      cards: '#DC143C',
      tabletop: '#8B4513'
    };
    return colors[category] || '#666666';
  };

  const getInitials = (name) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <TouchableOpacity style={styles.matchItem} onPress={() => onPress(item)}>
      <View style={styles.matchHeader}>
        {/* Left Section - Image (same size as events: 50x50) */}
        <View style={styles.leftSection}>
          <View style={styles.imageContainer}>
            {getChatDisplayImage(item) ? (
              <Image 
                source={getChatDisplayImage(item)} 
                style={styles.matchImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.matchImagePlaceholder, { backgroundColor: getCategoryColor(item.category) }]}>
                <Text style={styles.initialsText}>
                  {getInitials(item.name)}
                </Text>
              </View>
            )}
            
            {/* Unread message badge */}
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Center Section - Match Info */}
        <View style={styles.centerSection}>
          <View style={styles.contentRow}>
            <View style={styles.nameSection}>
              {/* Category, role (organizer/owner) and category badges share
                  one row - role used to sit next to the name instead,
                  which read as attached to the title rather than as a
                  status pill alongside the category. */}
              <View style={styles.badgeRow}>
                {item.category && (
                  <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(item.category) }]}>
                    <Text style={styles.categoryText}>
                      {item.category.toUpperCase()}
                    </Text>
                  </View>
                )}
                {(item.role === 'organizer' || item.role === 'owner') && (
                  <View style={styles.roleBadge}>
                    <Ionicons name="star" size={10} color="#FFD700" />
                    <Text style={styles.roleBadgeText}>
                      {item.role === 'organizer' ? 'Organizer' : 'Owner'}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.nameRow}>
                <Text style={styles.matchName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.lifecycleBadge && (
                  <View style={styles.lifecycleBadge}>
                    <Text style={styles.lifecycleBadgeText}>{item.lifecycleBadge}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Right Section - Time and participant count */}
            <View style={styles.rightSection}>
              <Text style={styles.matchTime}>
                {formatTime(item.lastMessageTime)}
              </Text>
              {item.participantCount && (
                <Text style={styles.participantCount}>
                  {item.participantCount} joined
                </Text>
              )}
            </View>
          </View>

          {/* Last message */}
          <Text style={styles.lastMessage} numberOfLines={1} ellipsizeMode="tail">
            {item.lastMessage || 'Chat started!'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function MatchesScreen({ navigation, route }) {
  const [activeTab, setActiveTab] = useState(route.params?.initialTab || 'events');

  // Coming back from a group/event/private chat should land on that same
  // sub-tab, not whatever was last active - useState's initial value only
  // applies on first mount, so a param change on an already-mounted
  // screen needs this to actually switch tabs.
  useFocusEffect(
    useCallback(() => {
      if (route.params?.initialTab) {
        setActiveTab(route.params.initialTab);
      }
    }, [route.params?.initialTab])
  );
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Load matches based on selected tab
  const loadMatches = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      
      let endpoint;
      if (activeTab === 'events') {
        endpoint = '/participations?type=event';
      } else if (activeTab === 'groups') {
        endpoint = '/participations?type=group';
      } else if (activeTab === 'private') {
        endpoint = '/private-connections';
      }

      console.log(`🔍 Loading ${activeTab} from: ${endpoint}`);
      const response = await api.get(endpoint);
      
      if (response.data.success) {
        const rawData = response.data.data || [];
        console.log(`📊 Raw data count for ${activeTab}:`, rawData.length);
        
        // Transform data for consistent display
        const transformedMatches = rawData.map(item => {
          if (activeTab === 'private') {
            // Private connection structure
            return {
              id: item._id,
              type: 'private',
              chatId: item._id,
              name: item.otherUser?.name || 'Private Chat',
              image: item.otherUser?.photos?.[0]?.url || item.otherUser?.photos?.[0],
              category: null, // No category for private chats
              lastMessage: item.lastMessage?.text || 'Say hello!',
              lastMessageTime: item.lastMessage?.createdAt || item.createdAt,
              unreadCount: item.unreadCount || 0,
              participantCount: null
            };
          } else {
            // Event/Group participation structure
            const event = item.event || item.group || item;
            return {
              id: item._id,
              type: activeTab === 'events' ? 'event' : 'group', // Explicit conversion
              chatId: event._id,
              name: event.name,
              image: event.photos?.[0]?.url || event.photos?.[0],
              category: event.category || event.sport || (event.interests && event.interests[0]),
              lastMessage: item.lastMessage?.text || 'Chat started!',
              lastMessageTime: item.lastMessage?.createdAt || item.joinedAt,
              unreadCount: item.unreadCount || 0,
              participantCount: event.currentAttendees || event.currentMembers,
              // 'organizer' or 'owner' (a promoted admin) - see
              // GET /participations, which sets this same field.
              role: item.userRole,
              // 'Closed' (organizer archived it) or 'Expired' (an
              // event's date passed on its own) - the chat itself stays
              // open either way, this is just a status flag on it.
              lifecycleBadge: event.isArchived
                ? 'Closed'
                : (activeTab === 'events' && event.eventDate && new Date(event.eventDate) < new Date())
                  ? 'Expired'
                  : null
            };
          }
        });
        
        console.log(`✅ Transformed ${activeTab} matches:`, transformedMatches.length);
        setMatches(transformedMatches);
      }
    } catch (error) {
      console.error(`❌ Error loading ${activeTab} matches:`, error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view these chats.');
      } else {
        Alert.alert('Error', `Failed to load ${activeTab} chats. Please try again.`);
      }
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Load matches when tab changes or screen focuses
  useFocusEffect(
    useCallback(() => {
      loadMatches();
    }, [loadMatches])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMatches(false);
    setRefreshing(false);
  };

  const handleTabChange = (tab) => {
    if (tab !== activeTab) {
      setActiveTab(tab);
      setMatches([]); // Clear matches when switching tabs
    }
  };

  const handleMatchPress = (match) => {
    console.log('🎯 Opening chat for:', match.name);
    console.log('🐛 DEBUG: Match object:', match);
    
    if (match.type === 'private') {
      // Use separate PrivateChat screen for iPhone Messages style
      navigation.navigate('PrivateChat', { 
        connectionId: match.chatId,
        otherUser: { 
          name: match.name, 
          image: match.image 
        }
      });
    } else {
      // Use ChatScreen for event/group chats (YouTube comment style)
      navigation.navigate('Chat', { 
        chatId: match.chatId,        // ChatScreen expects 'chatId'
        eventId: match.chatId,       // Also pass as eventId for compatibility
        eventName: match.name,
        eventType: match.type        // 'event' or 'group', not 'events'
      });
    }
  };

  const renderTabBar = () => {
    const tabs = [
      { id: 'events', name: 'Events', icon: 'calendar' },
      { id: 'groups', name: 'Groups', icon: 'people' },
      { id: 'private', name: 'Private', icon: 'person' }
    ];

    return (
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              activeTab === tab.id && styles.activeTab
            ]}
            onPress={() => handleTabChange(tab.id)}
          >
            <View style={styles.tabContent}>
              <Ionicons 
                name={tab.icon} 
                size={16} 
                color={activeTab === tab.id ? '#0078FF' : '#666666'} 
              />
              <Text style={[
                styles.tabText,
                activeTab === tab.id && styles.activeTabText
              ]}>
                {tab.name}
              </Text>
            </View>
            {activeTab === tab.id && <View style={styles.activeTabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderEmptyState = () => {
    const emptyText = activeTab === 'private' 
      ? 'No Private Chats' 
      : `No ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Chats`;
    
    const emptySubtext = activeTab === 'private'
      ? 'Connect with people from events to start private conversations'
      : `Join ${activeTab} to start chatting with other participants`;

    return (
      <View style={styles.emptyContainer}>
        <Ionicons 
          name={activeTab === 'private' ? 'person-outline' : 'chatbubbles-outline'}
          size={64} 
          color="#666" 
        />
        <Text style={styles.emptyText}>{emptyText}</Text>
        <Text style={styles.emptySubtext}>{emptySubtext}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderTabBar()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0078FF" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderTabBar()}
      
      <View style={styles.content}>
        {matches.length === 0 ? (
          renderEmptyState()
        ) : (
          <ScrollView
            style={styles.matchesList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0078FF"
                colors={['#0078FF']}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {matches.map((match) => (
              <MatchItem
                key={match.id}
                item={match}
                onPress={handleMatchPress}
              />
            ))}
            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  
  // Tab Bar Styles - Matching CreateEventScreen
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    position: 'relative',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
  activeTabText: {
    color: '#0078FF',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#0078FF',
  },

  content: {
    flex: 1,
  },
  matchesList: {
    flex: 1,
  },
  
  // Loading & Empty States
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Match Item Styles - Matching CreateEventScreen layout
  matchItem: {
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  
  // Left Section - Image (same size as events: 50x50)
  leftSection: {
    alignItems: 'center',
    marginRight: 12,
    width: 50,
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  matchImage: {
    width: 50,
    height: 50,
    borderRadius: 8, // Square like events
  },
  matchImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  
  // Unread Badge
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  unreadText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  
  // Center Section - Match Info
  centerSection: {
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  nameSection: {
    flex: 1,
    paddingRight: 8,
  },
  
  // Category Badge
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  categoryText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  
  // Match Name
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 20,
    flexShrink: 1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFD700',
  },
  lifecycleBadge: {
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lifecycleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999999',
  },
  
  // Right Section - Time and participant count
  rightSection: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    minWidth: 85,
  },
  matchTime: {
    fontSize: 12,
    color: '#0078FF',
    fontWeight: '600',
    marginBottom: 2,
  },
  participantCount: {
    fontSize: 11,
    color: '#999999',
    textAlign: 'right',
  },
  
  // Last Message
  lastMessage: {
    fontSize: 13,
    color: '#CCCCCC',
    lineHeight: 18,
    paddingRight: 16,
  },
  
  bottomSpacer: {
    height: 20,
  },
});