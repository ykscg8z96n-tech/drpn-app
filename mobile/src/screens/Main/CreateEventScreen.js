// mobile/src/screens/Create/CreateEventScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Image,
  RefreshControl,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
  Share,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import EventCard from '../../components/EventCard';

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

// Sport utility functions (matching EventCard.js)
const SPORTS_INFO = {
  'Basketball': { icon: 'basketball-outline', color: '#FF6B35' },
  'Football': { icon: 'football-outline', color: '#8B4513' },
  'Soccer': { icon: 'football-outline', color: '#4CAF50' },
  'Tennis': { icon: 'tennis-outline', color: '#FFD700' },
  'Baseball': { icon: 'baseball-outline', color: '#FF4444' },
  'Golf': { icon: 'golf-outline', color: '#2E8B57' },
  'Swimming': { icon: 'water-outline', color: '#00BFFF' },
  'Running': { icon: 'walk-outline', color: '#FF6347' },
  'Cycling': { icon: 'bicycle-outline', color: '#32CD32' },
  'Volleyball': { icon: 'tennisball-outline', color: '#FF69B4' },
  'Hockey': { icon: 'hockey-puck-outline', color: '#4169E1' },
  'Martial Arts': { icon: 'fitness-outline', color: '#8B0000' },
  'Yoga': { icon: 'body-outline', color: '#9370DB' },
  'Rock Climbing': { icon: 'trending-up-outline', color: '#A0522D' },
  'Skiing': { icon: 'snow-outline', color: '#87CEEB' },
  'Surfing': { icon: 'water-outline', color: '#20B2AA' },
  'Other': { icon: 'trophy-outline', color: '#9E9E9E' }
};

const CATEGORY_INFO = {
  sports: { name: 'Sports', icon: 'basketball-outline', color: '#FF6B35' },
  golf: { name: 'Golf', icon: 'golf-outline', color: '#228B22' },
  health: { name: 'Health', icon: 'body-outline', color: '#9370DB' },
  fantasy: { name: 'Fantasy', icon: 'trophy-outline', color: '#FFD700' },
  cards: { name: 'Cards', icon: 'albums-outline', color: '#DC143C' },
  tabletop: { name: 'Table Top', icon: 'cube-outline', color: '#8B4513' },
};

// Events carry `category`; `sport`/`interests` are legacy fields on older records.
const getBadgeInfo = (item) => {
  if (CATEGORY_INFO[item.category]) return CATEGORY_INFO[item.category];
  const sport = item.sport || item.interests?.[0];
  if (sport) return { name: sport, ...SPORTS_INFO[sport] };
  return { name: 'Other', icon: 'trophy-outline', color: '#9E9E9E' };
};

const getBadgeLabel = (item) => getBadgeInfo(item).name;
const getBadgeIcon = (item) => getBadgeInfo(item).icon || 'trophy-outline';
const getBadgeColor = (item) => getBadgeInfo(item).color || '#9E9E9E';

// Helper function to get the display image
const getEventDisplayImage = (item) => {
  // Priority: 1. Event photos, 2. Category stock image, 3. Default tabletop
  if (item.photos && item.photos.length > 0) {
    return { uri: item.photos[0].url };
  }
  
  if (item.category && STOCK_IMAGES[item.category]) {
    return STOCK_IMAGES[item.category];
  }
  
  // Fallback to sport/interest category if no category field
  const sportCategory = item.sport || item.interests?.[0];
  if (sportCategory && STOCK_IMAGES[sportCategory]) {
    return STOCK_IMAGES[sportCategory];
  }
  
  // Default fallback
  return STOCK_IMAGES.tabletop;
};

// Swipeable Event Item Component - KEEPING ORIGINAL IMPLEMENTATION
const SwipeableEventItem = ({ item, onArchive, onEdit, onViewApplicants, onInvite, onWithdraw, onViewDetails, onScrollEnabled, playHint, onHintPlayed }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [isRevealed, setIsRevealed] = useState(false);

  // One-time peek animation showing the row slides to reveal
  // organizer/member actions underneath.
  useEffect(() => {
    if (!playHint) return;
    const peek = (toValue) =>
      Animated.timing(translateX, { toValue, duration: 380, useNativeDriver: false });

    const timer = setTimeout(() => {
      Animated.sequence([
        peek(-90),
        peek(0),
        Animated.delay(260),
        peek(-90),
        peek(0),
      ]).start(() => onHintPlayed?.());
    }, 900);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playHint]);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
    },
    onPanResponderGrant: () => {
      onScrollEnabled(false);
    },
    onPanResponderMove: (evt, gestureState) => {
      if (gestureState.dx < 0) {
        translateX.setValue(Math.max(gestureState.dx, -240));
      } else if (isRevealed) {
        translateX.setValue(Math.min(gestureState.dx - 240, 0));
      }
    },
    onPanResponderRelease: (evt, gestureState) => {
      onScrollEnabled(true);
      
      if (gestureState.dx < -120 && !isRevealed) {
        Animated.spring(translateX, {
          toValue: -240,
          useNativeDriver: false,
        }).start();
        setIsRevealed(true);
      } else if (gestureState.dx > 120 && isRevealed) {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: false,
        }).start();
        setIsRevealed(false);
      } else {
        Animated.spring(translateX, {
          toValue: isRevealed ? -240 : 0,
          useNativeDriver: false,
        }).start();
      }
    },
  });

  const applicants = item.applicants || [];
  const pendingCount = item.pendingApplications?.length ?? applicants.filter(a => a.status === 'pending').length;
  const acceptedCount = item.acceptedApplications?.length
    ?? item.currentAttendees
    ?? applicants.filter(a => a.status === 'accepted').length;
  const isPastEvent = item.type === 'event' && new Date(item.eventDate) < new Date();

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.actionButtons}>
        {item.isPendingApplication ? (
          /* A pending application isn't yours to manage - swiping it
             over only offers backing out of it. */
          <TouchableOpacity
            style={styles.withdrawButton}
            onPress={() => onWithdraw(item)}
          >
            <Ionicons name="close-circle-outline" size={24} color="white" />
            <Text style={styles.actionButtonText}>Withdraw</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Roster always opens the same applicants/members view, whether
                you organize this or just belong to it - organizers additionally
                get a badge showing how many people are still waiting on a
                decision, instead of a separate "Pending" button that hid the
                roster behind it. */}
            <TouchableOpacity
              style={styles.rosterButton}
              onPress={() => onViewApplicants(item)}
            >
              <Ionicons name="people" size={24} color="white" />
              <Text style={styles.actionButtonText}>Roster</Text>
              {item.isMyEvent && pendingCount > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {item.isMyEvent && (
              /* Show the rest only for events/groups user created */
              <>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => onEdit(item)}
                >
                  <Ionicons name="create-outline" size={24} color="white" />
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => onInvite(item)}
                >
                  <Ionicons name="person-add-outline" size={24} color="white" />
                  <Text style={styles.actionButtonText}>Invite</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.archiveButton}
                  onPress={() => onArchive(item)}
                >
                  <Ionicons name="archive-outline" size={24} color="white" />
                  <Text style={styles.archiveButtonText}>Archive</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>

      <Animated.View
        style={[
          styles.eventCard,
          {
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.eventItem}
          activeOpacity={0.8}
          onPress={() => onViewDetails(item)}
        >
          <View style={styles.eventHeader}>
            {/* Left Section - Photo and Capacity with proper spacing */}
            <View style={styles.leftSection}>
              <View style={styles.photoContainer}>
                <Image 
                  source={getEventDisplayImage(item)} 
                  style={styles.eventPhoto}
                  resizeMode="cover"
                />
                
                {/* Notification Badge - NEW */}
                {pendingCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{pendingCount}</Text>
                  </View>
                )}
              </View>
              
              {/* Capacity with forced spacing */}
              <View style={styles.capacityWrapper}>
                <View style={styles.capacityContainer}>
                  <Ionicons name="people-outline" size={14} color="#999" />
                  <Text style={styles.capacityText}>
                    {acceptedCount}/{item.capacity || item.groupSize}
                  </Text>
                </View>
              </View>
            </View>

            {/* Center Section - Sport Badge, Title, and Description (extends to far right) */}
            <View style={styles.centerSection}>
              <View style={styles.contentRow}>
                <View style={styles.titleSection}>
                  <View style={[styles.sportBadge, { backgroundColor: getBadgeColor(item) }]}>
                    <Ionicons name={getBadgeIcon(item)} size={12} color="white" />
                    <Text style={styles.sportBadgeText}>
                      {getBadgeLabel(item)}
                    </Text>
                  </View>
                  
                  <Text style={styles.eventItemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.role && (
                    <View style={styles.roleBadge}>
                      <Ionicons name="star" size={10} color="#FFD700" />
                      <Text style={styles.roleBadgeText}>
                        {item.role === 'organizer' ? 'Organizer' : 'Owner'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Right Section - Date and Location (in content row) */}
                {item.type === 'event' && (
                  <View style={styles.rightSection}>
                    <View style={styles.dateLocationContainer}>
                      <View style={styles.dateContainer}>
                        <Text style={[
                          styles.eventDate,
                          isPastEvent && styles.pastEventDate
                        ]}>
                          {new Date(item.eventDate).toLocaleDateString()}
                        </Text>
                        {isPastEvent && (
                          <Ionicons 
                            name="checkmark-circle" 
                            size={12} 
                            color="#0078FF" 
                            style={styles.pastIcon}
                          />
                        )}
                      </View>
                      <Text style={styles.locationText} numberOfLines={1}>
                        {item.location?.address || 'No location'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Description extends full width */}
              <Text style={styles.eventDescription} numberOfLines={1} ellipsizeMode="tail">
                {item.description}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

export default function CreateEventScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('Events');
  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [swipeHintPlayed, setSwipeHintPlayed] = useState(false);
  const [pendingApplications, setPendingApplications] = useState([]);
  const [detailEvent, setDetailEvent] = useState(null);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    checkOrganizerStatus();
  }, []);

  // Refetch whenever this screen regains focus (e.g. navigating back after
  // creating a new event/group) - otherwise the list only ever loads once
  // on mount and a newly created item silently doesn't appear until the
  // next manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      loadMyEvents();
      loadPendingApplications();
    }, [])
  );

  const checkOrganizerStatus = async () => {
    try {
      const response = await api.get('/users/profile');
      if (!response.data.data.isOrganizer) {
        Alert.alert(
          'Become an Organizer',
          'You need to be an organizer to create events. Would you like to become one?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes', onPress: becomeOrganizer }
          ]
        );
      } else {
        loadMyEvents();
      }
    } catch (error) {
      console.error('Error checking organizer status:', error);
      loadMyEvents();
    }
  };

  const becomeOrganizer = async () => {
    try {
      await api.put('/users/profile', { isOrganizer: true });
      Alert.alert('Success', 'You are now an organizer!');
      loadMyEvents();
    } catch (error) {
      console.error('Error becoming organizer:', error);
      Alert.alert('Error', 'Failed to become organizer. Please try again.');
    }
  };

  const loadMyEvents = async () => {
    try {
      setLoading(true);

      // /participations already returns both events/groups you organize
      // and ones you've joined as a member, in one call - a member needs
      // to see their groups here too (to view the roster), not just ones
      // they organize.
      const response = await api.get('/participations');
      const events = (response.data.data || [])
        .filter(item => {
          if (!item.event || item.event.isArchived) return false;
          // Events (not groups - they have no end date) drop off the
          // Home tab once their date passes, same as an organizer
          // closing one manually - the chat itself (Chats tab, driven
          // by this same /participations data but without this filter)
          // stays open either way.
          if (item.event.type === 'event' && new Date(item.event.eventDate) < new Date()) return false;
          return true;
        })
        .map(item => {
          const isDirectOrganizer = item.event.organizer?._id === user?.id || item.event.organizer === user?.id;
          return {
            ...item.event,
            // An owner (promoted, not just the organizer) gets the same
            // manage capabilities - Edit/Archive/Invite on the swipe row.
            isMyEvent: item.userRole === 'organizer'
              || item.userRole === 'owner'
              || isDirectOrganizer,
            role: item.userRole === 'owner' ? 'owner' : (item.userRole === 'organizer' || isDirectOrganizer) ? 'organizer' : null
          };
        });

      setMyEvents(events);
    } catch (error) {
      console.error('Error loading events:', error);
      setMyEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingApplications = async () => {
    try {
      const response = await api.get('/users/my-applications');
      const pending = (response.data.data || [])
        .filter(app => app.status === 'pending')
        .map(app => ({ ...app.event, isPendingApplication: true }));
      setPendingApplications(pending);
    } catch (error) {
      console.error('Error loading pending applications:', error);
      setPendingApplications([]);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMyEvents();
    await loadPendingApplications();
    setRefreshing(false);
  };

  const handleWithdraw = (event) => {
    Alert.alert(
      'Withdraw Application',
      `Are you sure you want to withdraw your application for "${event.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/users/my-applications/${event._id}`);
              setPendingApplications(prev => prev.filter(e => e._id !== event._id));
              Alert.alert('Success', 'Application withdrawn');
            } catch (error) {
              Alert.alert('Error', 'Failed to withdraw application');
            }
          }
        }
      ]
    );
  };

  const handleViewDetails = (event) => {
    setDetailEvent(event);
  };

  const handleScrollEnabled = (enabled) => {
    setScrollEnabled(enabled);
  };

  const handleArchiveEvent = (event) => {
    Alert.alert(
      'Archive Event',
      `Are you sure you want to archive "${event.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/events/${event._id}`);
              setMyEvents(prev => prev.filter(e => e._id !== event._id));
              Alert.alert('Success', 'Event archived successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to archive event');
            }
          }
        }
      ]
    );
  };

  const handleEditEvent = (event) => {
    navigation.navigate('EditEvent', { event });
  };

  const handleViewApplicants = (event) => {
    navigation.navigate('PendingApplications', { event });
  };

  const handleInvite = async (eventOrGroup) => {
    try {
      const response = await api.post(`/events/${eventOrGroup._id}/invite`);
      const { inviteCode } = response.data.data;
      const label = eventOrGroup.type === 'group' ? 'group' : 'event';
      // The link only actually opens to the join screen on web (see App.js
      // linking config) - still worth including on native as plain text,
      // since most share targets (Messages, email) will still show it.
      const joinLink = Platform.OS === 'web'
        ? `${window.location.origin}/join/${inviteCode}`
        : `https://drpn.app/join/${inviteCode}`;
      // Share.share's separate `url` field already puts the link (and its
      // own rich preview) into the share - repeating it inside `message`
      // as well made Messages show the same link/preview twice, once from
      // each field. The clipboard fallback below has no separate `url`
      // slot, so that one still needs the link spelled out in the text.
      const shareMessage = `Join my ${label} "${eventOrGroup.name}" on DRPN! Code: ${inviteCode}`;

      // navigator.share isn't available on most desktop browsers - check
      // up front rather than relying on Share.share's rejection, since
      // that same rejection also fires when someone just cancels the
      // native share sheet and shouldn't be treated as "unsupported".
      if (Platform.OS === 'web' && !navigator.share) {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(`${shareMessage}\n${joinLink}`);
          Alert.alert('Copied!', 'Invite link copied to your clipboard - paste it wherever you want to share it.');
        }
        return;
      }

      try {
        await Share.share({ message: shareMessage, url: joinLink, title: `Join ${eventOrGroup.name}` });
      } catch (shareError) {
        // Cancelling the share sheet rejects the same way a real failure
        // would (e.g. AbortError on web) - nothing went wrong, so don't
        // show an error for it.
      }
    } catch (error) {
      console.error('Error generating invite code:', error);
      Alert.alert('Error', 'Failed to generate invite code. Please try again.');
    }
  };

  const getFilteredEvents = () => {
    const type = activeTab === 'Events' ? 'event' : 'group';

    // Defensively dedupe by _id - a flaky connection retrying a request,
    // or a stale participation left over from testing, can otherwise
    // surface the same event/group more than once.
    const seenIds = new Set();
    const dedupe = (list) => list.filter(event => {
      if (!event.type || event.type !== type) return false;
      if (seenIds.has(event._id)) return false;
      seenIds.add(event._id);
      return true;
    });

    const items = dedupe(myEvents);
    // A pending application for something you already organize or belong
    // to (e.g. a stale application left over after being accepted) would
    // otherwise show the same card twice - once in the main list, once
    // under Pending.
    const pending = dedupe(pendingApplications);

    if (pending.length === 0) {
      return items;
    }

    return [
      ...items,
      { _id: 'pending-section-header', isSectionHeader: true, sectionTitle: 'Pending' },
      ...pending,
    ];
  };

  const renderTabBar = () => {
    const tabs = ['Events', 'Groups'];

    return (
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && styles.activeTab
            ]}
            onPress={() => {
              if (activeTab === tab) {
                // If clicking the already active tab, navigate to create screen
                const eventType = tab === 'Events' ? 'event' : 'group';
                navigation.navigate('CreateNew', { type: eventType });
              } else {
                // If clicking a different tab, just switch tabs
                setActiveTab(tab);
              }
            }}
          >
            <View style={styles.tabContent}>
              <Text style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText
              ]}>
                {tab}
              </Text>
              {activeTab === tab && (
                <Ionicons 
                  name="add" 
                  size={16} 
                  color="#0078FF" 
                  style={styles.tabPlusIcon}
                />
              )}
            </View>
            {activeTab === tab && <View style={styles.activeTabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderCreateButton = () => {
    const eventType = activeTab === 'Events' ? 'event' : 'group';
    const buttonText = activeTab === 'Events' ? 'Create Event' : 'Create Group';
    
    return (
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('CreateNew', { type: eventType })}
      >
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.createButtonText}>{buttonText}</Text>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    const emptyText = activeTab === 'Events' ? 'No events created yet' : 'No groups created yet';
    const emptySubtext = activeTab === 'Events' 
      ? 'Create your first event to get started!'
      : 'Create your first group to get started!';

    return (
      <View style={styles.emptyContainer}>
        <Ionicons 
          name={activeTab === 'Events' ? 'calendar-outline' : 'people-outline'} 
          size={64} 
          color="#666" 
        />
        <Text style={styles.emptyText}>{emptyText}</Text>
        <Text style={styles.emptySubtext}>{emptySubtext}</Text>
        {renderCreateButton()}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0078FF" />
      </View>
    );
  }

  const filteredEvents = getFilteredEvents();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderTabBar()}
      
      <View style={styles.content}>
        {filteredEvents.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={filteredEvents}
            keyExtractor={(item) => item._id}
            renderItem={({ item, index }) => (
              item.isSectionHeader ? (
                <Text style={styles.sectionHeaderText}>{item.sectionTitle}</Text>
              ) : (
                <SwipeableEventItem
                  item={item}
                  onArchive={handleArchiveEvent}
                  onEdit={handleEditEvent}
                  onViewApplicants={handleViewApplicants}
                  onInvite={handleInvite}
                  onWithdraw={handleWithdraw}
                  onViewDetails={handleViewDetails}
                  onScrollEnabled={handleScrollEnabled}
                  playHint={index === 0 && !swipeHintPlayed}
                  onHintPlayed={() => setSwipeHintPlayed(true)}
                />
              )
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0078FF"
                colors={['#0078FF']}
              />
            }
            scrollEnabled={scrollEnabled}
            style={styles.eventsList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <Modal
        visible={!!detailEvent}
        animationType="slide"
        onRequestClose={() => setDetailEvent(null)}
      >
        <View style={styles.detailModalContainer}>
          <TouchableOpacity
            style={[styles.detailCloseButton, { top: insets.top + 12 }]}
            onPress={() => setDetailEvent(null)}
          >
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          {detailEvent && <EventCard event={detailEvent} />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },

  // Tab Bar Styles
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
  tabPlusIcon: {
    marginLeft: 4,
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
  eventsList: {
    flex: 1,
  },
  
  // Swipeable Event Item Styles
  swipeContainer: {
    backgroundColor: '#000000',
    marginBottom: 1,
    position: 'relative',
  },
  actionButtons: {
    flexDirection: 'row',
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 240,
    backgroundColor: '#000000',
    zIndex: 0,
  },
  rosterButton: {
    backgroundColor: '#0078FF',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  editButton: {
    backgroundColor: '#00B000',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteButton: {
    backgroundColor: '#8B5CF6',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  archiveButton: {
    backgroundColor: '#FF6524',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  withdrawButton: {
    backgroundColor: '#FF3B30',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 240,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  archiveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  pendingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  // Event Card Styles
  eventCard: {
    backgroundColor: '#000000',
    position: 'relative',
    zIndex: 1,
  },
  eventItem: {
    backgroundColor: '#000000',
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },

  // NEW LAYOUT STRUCTURE
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  leftSection: {
    alignItems: 'center',
    marginRight: 12,
    width: 50, // Fixed width for photo
  },
  
  // Photo Container (separate from capacity)
  photoContainer: {
    marginBottom: 12, // Force space between photo and capacity
    position: 'relative',
  },
  eventPhoto: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  eventPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Notification Badge
  notificationBadge: {
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
  notificationBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  
  // Capacity Wrapper (separate container)
  capacityWrapper: {
    width: 50,
    alignItems: 'center',
  },
  capacityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  capacityText: {
    fontSize: 11,
    color: '#999999',
    marginLeft: 3,
    fontWeight: '500',
  },
  
  centerSection: {
    flex: 1, // Take full remaining width
  },
  
  // Content row for title and date/location
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleSection: {
    flex: 1,
    paddingRight: 8,
  },
  rightSection: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    minWidth: 85,
  },
  
  // Event Description (Extends to far right edge)
  eventDescription: {
    fontSize: 13,
    color: '#CCCCCC',
    lineHeight: 18,
    marginTop: 4,
    paddingRight: 16, // Extend to container edge
  },
  
  // Date and Location (In content row)
  dateLocationContainer: {
    alignItems: 'flex-end',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  eventDate: {
    fontSize: 12,
    color: '#0078FF',
    fontWeight: '600',
  },
  pastEventDate: {
    color: '#999999',
  },
  pastIcon: {
    marginLeft: 4,
  },
  locationText: {
    fontSize: 11,
    color: '#999999',
    textAlign: 'right',
    maxWidth: 80,
  },
  
  // Sport Badge
  sportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  sportBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  
  // Event Title
  eventItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFD700',
  },

  // Empty State
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
    marginBottom: 32,
  },

  // Create Button
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0078FF',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 25,
    gap: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  // Pending Section Header
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#000000',
  },

  // Event/Group Detail Modal
  detailModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailCloseButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 6,
  },
});