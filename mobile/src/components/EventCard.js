// mobile/src/components/EventCard.js - FIXED ORGANIZER PHOTO FUNCTIONS
import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import ActionSheet from './ActionSheet';

const { width, height } = Dimensions.get('window');
// Account for: status bar (~44) + header (~40) + action row (~80) + bottom nav (~80) + margins,
// plus +90 (~1.5x the pass button's 60px height) requested on top of that
// fit, then -40 (2x the expand handle's 20px height, too tall at +90),
// then -20 more (1x expand handle height, still overlapping the button
// row at +50) - net +30 over the original baseline. Height only moves
// the card's bottom edge - top position comes from cardVerticalMargin
// in SwipeScreen instead, so trimming this never moves the top down.
// Exported so SwipeScreen can size the Swiper's own card box to match this
// exactly - this component sizes itself regardless of whatever the Swiper
// wrapper's box is, so the two drifting out of sync is what left a gap
// above/below the actual visible card in earlier attempts to resize it
// from the Swiper side alone.
export const CARD_HEIGHT = height - 265 + 90 - 40 - 20;

// Stock images for each category - same as CreateNewScreen.js
const STOCK_IMAGES = {
  tabletop: require('../../assets/stock-images/tabletop-stock.jpg'),
  cards: require('../../assets/stock-images/cards-stock.jpg'),
  fantasy: require('../../assets/stock-images/fantasy-stock.jpg'),
  sports: require('../../assets/stock-images/sports-stock.jpg'),
  golf: require('../../assets/stock-images/golf-stock.jpg'),
  health: require('../../assets/stock-images/health-stock.jpg'),
};

// Categories info - inline for now
const CATEGORIES = {
  tabletop: { id: 'tabletop', name: 'Table Top', icon: 'cube-outline', color: '#8B4513' },
  cards: { id: 'cards', name: 'Cards', icon: 'albums-outline', color: '#DC143C' },
  fantasy: { id: 'fantasy', name: 'Fantasy', icon: 'trophy-outline', color: '#FFD700' },
  sports: { id: 'sports', name: 'Sports', icon: 'basketball-outline', color: '#FF6B35' },
  golf: { id: 'golf', name: 'Golf', icon: 'golf-outline', color: '#228B22' },
  health: { id: 'health', name: 'Health', icon: 'body-outline', color: '#9370DB' }
};

const getCategoryInfo = (categoryId) => {
  return CATEGORIES[categoryId] || { name: 'Other', icon: 'help-outline', color: '#9E9E9E' };
};

// Simple CategoryBadge component - inline (REMOVED ORGANIZER PHOTO FUNCTIONS)
const CategoryBadge = ({ category, size = 'medium' }) => {
  const categoryInfo = getCategoryInfo(category);
  const badgeSize = size === 'small' ? 'small' : 'medium';
  
  return (
    <View style={[
      styles.categoryBadge,
      { backgroundColor: categoryInfo.color },
      badgeSize === 'small' && styles.categoryBadgeSmall
    ]}>
      <Ionicons 
        name={categoryInfo.icon} 
        size={badgeSize === 'small' ? 12 : 16} 
        color="white" 
      />
      <Text style={[
        styles.categoryBadgeText,
        badgeSize === 'small' && styles.categoryBadgeTextSmall
      ]}>
        {categoryInfo.name}
      </Text>
    </View>
  );
};

// Small pill distinguishing an event from a group - the card otherwise
// only implies this through wording buried in the details.
const TypeBadge = ({ type }) => (
  <View style={[styles.typeBadge, type === 'group' ? styles.typeBadgeGroup : styles.typeBadgeEvent]}>
    <Ionicons name={type === 'group' ? 'people' : 'calendar'} size={12} color="white" />
    <Text style={styles.typeBadgeText}>{type === 'group' ? 'Group' : 'Event'}</Text>
  </View>
);

export default function EventCard({ event, distance, onImagePress, onExpandChange, cardHeight, onOrganizerBlocked }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showOrganizerProfile, setShowOrganizerProfile] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showOrganizerOptionsSheet, setShowOrganizerOptionsSheet] = useState(false);
  const [showOrganizerReportSheet, setShowOrganizerReportSheet] = useState(false);
  const { user, updateUser } = useAuth();

  const organizerId = event.organizer?._id || event.organizer?.id;

  const isOrganizerBlocked = () => {
    if (!organizerId) return false;
    return !!user?.blockedUsers?.some(id => (id?._id || id)?.toString?.() === organizerId.toString());
  };

  // Same account-level block as ChatScreen/PendingApplicationsScreen (see
  // backend/src/models/User.js) - blocking an organizer here also excludes
  // their events/groups from the swipe deck going forward (see the
  // GET /events/nearby query on the backend).
  const handleToggleOrganizerBlock = async () => {
    if (!organizerId) return;
    const blocked = isOrganizerBlocked();
    try {
      const response = blocked
        ? await api.delete(`/users/block/${organizerId}`)
        : await api.post(`/users/block/${organizerId}`);
      if (response.data.success) {
        updateUser({ ...user, blockedUsers: response.data.data.blockedUsers });
        Alert.alert(
          blocked ? 'Unblocked' : 'Blocked',
          blocked
            ? `You've unblocked ${event.organizer?.name || 'this user'}.`
            : `You've blocked ${event.organizer?.name || 'this user'}. Their events and groups will no longer show up in your swipe deck.`
        );
        if (!blocked) {
          setShowOrganizerProfile(false);
          // The deck was already fetched with this organizer's cards in it
          // (the backend's GET /events/nearby exclusion only applies to the
          // *next* fetch) - drop them from the current deck now too, so the
          // card doesn't just sit there until the deck happens to reload.
          onOrganizerBlocked?.(organizerId);
        }
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update block status');
    }
  };

  const reportReasons = [
    { label: 'Harassment', value: 'harassment' },
    { label: 'Spam', value: 'spam' },
    { label: 'Inappropriate content', value: 'inappropriate_content' },
    { label: 'Safety concern', value: 'safety_concern' },
    { label: 'Other', value: 'other' },
  ];

  const submitOrganizerReport = async (reason) => {
    try {
      await api.post('/reports', {
        reportedUserId: organizerId,
        reason,
        context: event.type === 'group' ? 'group_chat' : 'event_chat',
        contextId: event._id || event.id,
      });
      Alert.alert('Report Submitted', 'Thanks for letting us know. Our team will review this.');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to submit report');
    }
  };

  const organizerOptionsSheetOptions = [
    {
      text: isOrganizerBlocked() ? 'Unblock User' : 'Block User',
      onPress: handleToggleOrganizerBlock,
      destructive: !isOrganizerBlocked()
    },
    { text: 'Report User', onPress: () => setShowOrganizerReportSheet(true), destructive: true },
  ];

  const organizerReportSheetOptions = reportReasons.map(r => ({ text: r.label, onPress: () => submitOrganizerReport(r.value) }));

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    onExpandChange?.(next);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDistance = (dist) => {
    if (dist < 1000) {
      return `${Math.round(dist)}m`;
    }
    return `${(dist / 1000).toFixed(1)}km`;
  };

  const handleImagePress = () => {
    if (event.photos && event.photos.length > 1) {
      const nextIndex = (currentImageIndex + 1) % event.photos.length;
      setCurrentImageIndex(nextIndex);
    }
    if (onImagePress) {
      onImagePress(currentImageIndex);
    }
  };

  // Updated logic: check for photos first, then use stock images
  const currentPhoto = event.photos && event.photos.length > 0 
    ? { uri: event.photos[currentImageIndex].url }
    : STOCK_IMAGES[event.category] || STOCK_IMAGES.tabletop;

  const formatEventDate = () => {
    if (event.type === 'event' && event.eventDate) {
      return formatDate(event.eventDate);
    } else if (event.type === 'group') {
      return 'Ongoing';
    }
    return 'TBD';
  };

  const getCapacityInfo = () => {
    const current = event.currentAttendees || 0;
    if (event.type === 'event') {
      return `${current}/${event.capacity || 0}`;
    } else if (event.type === 'group') {
      return `${current}/${event.groupSize || 0}`;
    }
    return '';
  };

  const renderOrganizerProfile = () => {
    if (!showOrganizerProfile) return null;
    const canModerate = organizerId && organizerId !== (user?.id || user?._id);

    return (
      <Modal
        visible={showOrganizerProfile}
        animationType="slide"
        onRequestClose={() => setShowOrganizerProfile(false)}
      >
        <View style={styles.profileModalContainer}>
          <TouchableOpacity style={styles.profileCloseButton} onPress={() => setShowOrganizerProfile(false)}>
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          {canModerate && (
            <TouchableOpacity
              style={styles.profileOptionsButton}
              onPress={() => setShowOrganizerOptionsSheet(true)}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="white" />
            </TouchableOpacity>
          )}

          <ScrollView style={styles.modalContent}>
            <ProfilePreviewCard profile={event.organizer} />

            {/* Event organizer stats */}
            <View style={styles.organizerStats}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {event.organizer?.eventsOrganized?.length || 0}
                </Text>
                <Text style={styles.statLabel}>Events Organized</Text>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {event.organizer?.rating?.toFixed(1) || 'New'}
                </Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>
          </ScrollView>

          {/* Nested inside this Modal, not as a sibling of the card - a
              separate top-level Modal opened while this pageSheet-style one
              is already showing gets queued behind it on iOS/Android until
              this one closes, which made Block/Report appear to do nothing
              until you closed the profile first. */}
          <ActionSheet
            visible={showOrganizerOptionsSheet}
            options={organizerOptionsSheetOptions}
            onClose={() => setShowOrganizerOptionsSheet(false)}
          />
          <ActionSheet
            visible={showOrganizerReportSheet}
            title="Why are you reporting this user?"
            options={organizerReportSheetOptions}
            onClose={() => setShowOrganizerReportSheet(false)}
          />
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.card, cardHeight != null && { height: cardHeight }]}>
      {/* Main Image */}
      <TouchableOpacity 
        style={styles.imageContainer}
        onPress={handleImagePress}
        activeOpacity={0.9}
      >
        <Image source={currentPhoto} style={styles.eventImage} />
        
        {/* Gradient overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.gradient}
        />

        {/* Photo indicators for event photos */}
        {event.photos && event.photos.length > 1 && (
          <View style={styles.photoIndicators}>
            {event.photos.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.photoIndicator,
                  index === currentImageIndex && styles.activePhotoIndicator
                ]}
              />
            ))}
          </View>
        )}

        {/* Category + Type Badges */}
        <View style={styles.categoryContainer}>
          <CategoryBadge category={event.category} size="small" />
          <TypeBadge type={event.type} />
        </View>

        {/* Distance Badge */}
        {distance && (
          <View style={styles.distanceContainer}>
            <View style={styles.distanceBadge}>
              <Ionicons name="location" size={12} color="white" />
              <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Content - kept short on purpose; the rest lives in the
          expandable details panel below so it never gets clipped */}
      <View style={styles.content}>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {event.name}
        </Text>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={16} color="#C7C4C4" />
            <Text style={styles.infoText} numberOfLines={1}>{formatEventDate()}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="people-outline" size={16} color="#C7C4C4" />
            <Text style={styles.infoText}>{getCapacityInfo()}</Text>
          </View>
        </View>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color="#C7C4C4" />
          <Text style={styles.locationText} numberOfLines={1}>
            {event.location?.city && event.location?.state
              ? `${event.location.city}, ${event.location.state}`
              : event.location?.address || 'Location TBD'
            }
          </Text>
        </View>
      </View>

      {/* Expand handle - reveals the full details panel below */}
      <TouchableOpacity style={styles.expandHandle} onPress={toggleExpanded} activeOpacity={0.8}>
        <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={20} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Details panel - a real Modal rather than an overlay inside the
          card. The deck-swiper's disableXSwipe props only stop a swipe
          from completing, not the drag itself, so a same-tree overlay
          still fights the swiper's gesture responder for a scroll
          touch. A Modal renders on its own layer above everything,
          completely outside the swiper's gesture tree, so the card is
          genuinely frozen and the scroll is never contested. */}
      <Modal
        visible={expanded}
        transparent
        animationType="slide"
        onRequestClose={toggleExpanded}
      >
        <TouchableOpacity style={styles.detailsOverlay} activeOpacity={1} onPress={toggleExpanded}>
          <TouchableOpacity style={styles.detailsPanel} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.expandHandleModal} onPress={toggleExpanded}>
              <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.eventTitle}>{event.name}</Text>
              <Text style={styles.detailsDescription}>{event.description}</Text>

              <TouchableOpacity style={styles.organizerContainer} onPress={() => setShowOrganizerProfile(true)}>
                <View style={styles.organizerInfo}>
                  {event.organizer?.photos && event.organizer.photos.length > 0 && event.organizer.photos[0] ? (
                    <Image
                      source={{ uri: event.organizer.photos[0].url }}
                      style={styles.organizerPhoto}
                    />
                  ) : (
                    <View style={styles.organizerPhotoPlaceholder}>
                      <Text style={styles.organizerInitial}>
                        {(event.organizer?.name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.organizerName}>
                    by {event.organizer?.name || 'Unknown'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={16} color="#C7C4C4" />
                <Text style={styles.locationText}>
                  {event.location?.address || event.location?.city || 'Location TBD'}
                </Text>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Render organizer profile modal */}
      {renderOrganizerProfile()}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: width - 40,
    height: CARD_HEIGHT,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  imageContainer: {
    height: '70%',
    position: 'relative',
  },
  eventImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  photoIndicators: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  photoIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  activePhotoIndicator: {
    backgroundColor: 'white',
  },
  categoryContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    gap: 6,
  },
  distanceContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  distanceText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    lineHeight: 28,
  },
  eventDescription: {
    fontSize: 16,
    color: '#C7C4C4',
    lineHeight: 22,
    marginBottom: 16,
  },
  organizerContainer: {
    marginBottom: 16,
  },
  organizerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  organizerPhoto: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  organizerPhotoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#666666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  organizerInitial: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  organizerName: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  infoText: {
    color: '#C7C4C4',
    fontSize: 14,
    fontWeight: '500',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  locationText: {
    color: '#C7C4C4',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },

  // Category Badge Styles
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  categoryBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 3,
  },
  categoryBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryBadgeTextSmall: {
    fontSize: 10,
  },

  // Organizer Profile Modal Styles - mirrors ChatScreen's profile modal
  // (same ProfilePreviewCard, same floating close/options buttons) so the
  // profile view looks and behaves the same everywhere it's shown.
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
  profileOptionsButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 6,
  },
  modalContent: {
    flex: 1,
  },
  organizerStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    paddingVertical: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },

  // Type Badge (Event vs Group)
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 3,
  },
  typeBadgeEvent: {
    backgroundColor: 'rgba(0, 120, 255, 0.85)',
  },
  typeBadgeGroup: {
    backgroundColor: 'rgba(155, 89, 182, 0.85)',
  },
  typeBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },

  // Expand handle + details panel
  expandHandle: {
    position: 'absolute',
    bottom: 4,
    left: '50%',
    marginLeft: -18,
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  detailsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  detailsPanel: {
    // Grows to fit the content (a short description sits low, a long one
    // pushes higher) instead of always claiming a fixed chunk of the
    // screen, capping out near full-screen and scrolling internally past
    // that rather than overflowing.
    maxHeight: '92%',
    backgroundColor: 'rgba(15, 15, 15, 0.94)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  expandHandleModal: {
    alignSelf: 'center',
    width: 36,
    height: 20,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsScroll: {
    flex: 1,
    padding: 20,
  },
  detailsDescription: {
    fontSize: 16,
    color: '#E5E5E5',
    lineHeight: 22,
    marginBottom: 16,
  },
});