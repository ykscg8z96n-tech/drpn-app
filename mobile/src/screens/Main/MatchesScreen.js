// mobile/src/screens/Main/MatchesScreen.js - Matching CreateEventScreen UI
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

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

// Typo-tolerant filter: an exact substring match always passes, and
// otherwise a query passes when its characters appear in order
// somewhere in the text (same idea as a command-palette fuzzy filter).
const fuzzyMatch = (query, text) => {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = (text || '').toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
};

// Match Item Component - Matching CreateEventScreen style. Private chats
// get a circular avatar, events/groups a rounded-square one - shape alone
// hints at the chat type before you even read the section header.
const MatchItem = ({ item, onPress, onLayout }) => {
  const avatarRadius = item.type === 'private' ? 25 : 8;

  return (
    <TouchableOpacity style={styles.matchItem} onPress={() => onPress(item)} onLayout={onLayout}>
      <View style={styles.matchHeader}>
        {/* Left Section - Image (same size as events: 50x50) */}
        <View style={styles.leftSection}>
          <View style={styles.imageContainer}>
            {getChatDisplayImage(item) ? (
              <Image
                source={getChatDisplayImage(item)}
                style={[styles.matchImage, { borderRadius: avatarRadius }]}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.matchImagePlaceholder, { borderRadius: avatarRadius, backgroundColor: getCategoryColor(item.category) }]}>
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
              {/* Category and role (owner) badges share one row - role used
                  to sit next to the name instead, which read as attached
                  to the title rather than as a status pill alongside the
                  category. */}
              <View style={styles.badgeRow}>
                {item.category && (
                  <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(item.category) }]}>
                    <Text style={styles.categoryText}>
                      {item.category.toUpperCase()}
                    </Text>
                  </View>
                )}
                {item.role === 'owner' && (
                  <View style={styles.roleBadge}>
                    <Ionicons name="star" size={10} color="#FFD700" />
                    <Text style={styles.roleBadgeText}>Owner</Text>
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

const transformEventOrGroup = (item, type) => {
  const event = item.event || item.group || item;
  return {
    id: item._id,
    type, // 'event' | 'group'
    chatId: event._id,
    name: event.name,
    image: event.photos?.[0]?.url || event.photos?.[0],
    category: event.category || event.sport || (event.interests && event.interests[0]),
    lastMessage: item.lastMessage?.text || 'Chat started!',
    lastMessageTime: item.lastMessage?.createdAt || item.joinedAt,
    unreadCount: item.unreadCount || 0,
    participantCount: event.currentAttendees || event.currentMembers,
    // 'owner' (any owner has identical rights) - see GET /participations,
    // which sets this same field.
    role: item.userRole,
    // A cancelled event/group is removed from the feed entirely (see GET
    // /participations), so anything still showing here is either active
    // or "completed" - its date passed on its own without anyone
    // cancelling it. The chat stays open either way, this is just a
    // status flag on it.
    lifecycleBadge: (type === 'event' && event.eventDate && new Date(event.eventDate) < new Date())
      ? 'Completed'
      : null
  };
};

const transformPrivate = (item) => ({
  id: item._id,
  type: 'private',
  chatId: item._id,
  name: item.otherUser?.name || 'Private Chat',
  image: item.otherUser?.photos?.[0]?.url || item.otherUser?.photos?.[0],
  category: null,
  lastMessage: item.lastMessage?.text || 'Say hello!',
  lastMessageTime: item.lastMessage?.createdAt || item.createdAt,
  unreadCount: item.unreadCount || 0,
  participantCount: null
});

const SECTIONS_META = [
  { key: 'event', label: 'EVENTS' },
  { key: 'group', label: 'GROUPS' },
  { key: 'private', label: 'PRIVATE' },
];

const SECTION_HEADER_HEIGHT = 34;
const MIN_ROWS_PER_SECTION = 3;
const MAX_ROWS_PER_SECTION = 4;
const FALLBACK_ROW_HEIGHT = 88;

export default function MatchesScreen({ navigation }) {
  const [matchesByType, setMatchesByType] = useState({ event: [], group: [], private: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [areaHeight, setAreaHeight] = useState(0);
  const [rowHeight, setRowHeight] = useState(FALLBACK_ROW_HEIGHT);
  const hasMeasuredRow = useRef(false);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const loadMatches = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      const [eventsRes, groupsRes, privateRes] = await Promise.all([
        api.get('/participations?type=event'),
        api.get('/participations?type=group'),
        api.get('/private-connections'),
      ]);

      // A participation whose event/group was deleted out from under it
      // (or a private connection missing its other user) has nothing
      // meaningful to show - drop it here rather than letting it count
      // toward "this section has chats" while rendering as a blank row.
      const events = (eventsRes.data.success ? eventsRes.data.data : []).map(i => transformEventOrGroup(i, 'event')).filter(m => m.name);
      const groups = (groupsRes.data.success ? groupsRes.data.data : []).map(i => transformEventOrGroup(i, 'group')).filter(m => m.name);
      const privates = (privateRes.data.success ? privateRes.data.data : []).map(transformPrivate).filter(m => m.name);

      setMatchesByType({ event: events, group: groups, private: privates });
    } catch (error) {
      console.error('❌ Error loading chats:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view these chats.');
      } else {
        Alert.alert('Error', 'Failed to load chats. Please try again.');
      }
      setMatchesByType({ event: [], group: [], private: [] });
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleMatchPress = (match) => {
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
        eventType: match.type        // 'event' or 'group'
      });
    }
  };

  // Only the very first row rendered measures itself - row height varies a
  // few px between rows (an unread badge, a completed pill), but this is
  // just an estimate for how many rows fit per section, not a pixel-exact
  // layout, so one measurement is enough and avoids re-measuring on every
  // render.
  const handleFirstRowLayout = (e) => {
    if (hasMeasuredRow.current) return;
    hasMeasuredRow.current = true;
    const h = e.nativeEvent.layout.height;
    if (h) setRowHeight(h);
  };

  const sections = SECTIONS_META
    .map(meta => ({
      ...meta,
      data: matchesByType[meta.key].filter(item => fuzzyMatch(searchQuery, item.name))
    }))
    .filter(section => section.data.length > 0);

  // Split whatever vertical space is available for the sections column
  // evenly between however many sections are actually showing (fewer
  // sections - e.g. a search that only matches Groups - means each
  // remaining section gets more room, up to the 4-row cap), then clamp
  // between 3 and 4 rows.
  const rowsPerSection = (() => {
    if (sections.length === 0 || areaHeight === 0) return MIN_ROWS_PER_SECTION;
    const perSection = (areaHeight - sections.length * SECTION_HEADER_HEIGHT) / sections.length;
    const rows = Math.floor(perSection / rowHeight);
    return Math.max(MIN_ROWS_PER_SECTION, Math.min(MAX_ROWS_PER_SECTION, rows || MIN_ROWS_PER_SECTION));
  })();

  let firstRowRendered = false;

  const renderEmptyState = () => {
    const hasAnyChats = SECTIONS_META.some(meta => matchesByType[meta.key].length > 0);
    const emptyText = searchQuery ? 'No chats match your search' : (hasAnyChats ? 'No results' : 'No chats yet');
    const emptySubtext = searchQuery
      ? `Nothing found for "${searchQuery}"`
      : 'Join an event or group, or start a private chat, to see it here';

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubbles-outline" size={64} color="#666" />
        <Text style={styles.emptyText}>{emptyText}</Text>
        <Text style={styles.emptySubtext}>{emptySubtext}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header - a single title now that every chat type shows in one
          unified feed below, with the accent line spanning the full
          width instead of sitting under one active tab. */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Chats</Text>
      </View>
      <View style={styles.headerAccentLine} />

      {/* Search - fuzzy-matches the name of every event, group and
          private chat across all three sections at once. */}
      <View style={styles.searchBarWrap}>
        <Ionicons name="search" size={18} color="#666666" />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search chats"
          placeholderTextColor="#666666"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color="#666666" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0078FF" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      ) : (
        <View style={styles.sectionsArea} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
          {sections.length === 0 ? (
            renderEmptyState()
          ) : (
            <ScrollView
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#0078FF"
                  colors={['#0078FF']}
                />
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sectionsContent}
            >
              {sections.map((section) => {
                const visibleRows = Math.min(rowsPerSection, section.data.length);
                return (
                  <View key={section.key} style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionHeaderText}>{section.label}</Text>
                      <View style={styles.sectionHeaderLine} />
                    </View>
                    <View style={{ height: visibleRows * rowHeight }}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {section.data.map((item) => {
                          const isFirst = !firstRowRendered;
                          if (isFirst) firstRowRendered = true;
                          return (
                            <MatchItem
                              key={item.id}
                              item={item}
                              onPress={handleMatchPress}
                              onLayout={isFirst ? handleFirstRowLayout : undefined}
                            />
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Header - grey bar like the old tab container, just a title now, with
  // a full-width blue accent line beneath it instead of a per-tab one.
  headerBar: {
    backgroundColor: '#111111',
    paddingVertical: 16,
    paddingHorizontal: 60,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0078FF',
  },
  headerAccentLine: {
    height: 2,
    backgroundColor: '#0078FF',
  },

  // Search bar
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 10,
  },

  sectionsArea: {
    flex: 1,
  },
  sectionsContent: {
    paddingBottom: 20,
  },
  sectionBlock: {
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    color: '#666666',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1A1A1A',
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
  },
  matchImagePlaceholder: {
    width: 50,
    height: 50,
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
});
