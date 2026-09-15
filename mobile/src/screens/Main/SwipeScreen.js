// mobile/src/screens/Main/SwipeScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Modal,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import api from '../../services/api';
import EventCard from '../../components/EventCard';
import { useAuth } from '../../contexts/AuthContext';
import { useFilter } from '../../contexts/FilterContext';
import { USE_MOCK_API } from '../../utils/constants';
import LocationFilterModal from '../../components/LocationFilterModal';

const DEMO_LOCATION = { latitude: 30.2672, longitude: -97.7431 };

const { height: windowHeight, width: windowWidth } = Dimensions.get('window');

// Categories with your established colors - REORDERED
const CATEGORIES = [
  { id: 'sports', name: 'Sports', icon: 'basketball-outline', color: '#FF6B35' },
  { id: 'golf', name: 'Golf', icon: 'golf-outline', color: '#228B22' },
  { id: 'health', name: 'Health', icon: 'body-outline', color: '#9370DB' },
  { id: 'fantasy', name: 'Fantasy', icon: 'trophy-outline', color: '#FFD700' },
  { id: 'cards', name: 'Cards', icon: 'albums-outline', color: '#DC143C' },
  { id: 'tabletop', name: 'Table Top', icon: 'cube-outline', color: '#8B4513' }
];

export default function SwipeScreen({ navigation }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cardIndex, setCardIndex] = useState(0);
  const [userLocation, setUserLocation] = useState(null);
  const [cardExpanded, setCardExpanded] = useState(false);
  const swiperRef = useRef(null);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const {
    selectedFilter,
    selectedTypeFilter,
    showFilterDrawer,
    openFilterDrawer,
    closeFilterDrawer,
    selectFilter,
    clearFilter,
    selectTypeFilter,
    browseLocation,
    setBrowseLocation,
    clearBrowseLocation,
    showLocationFilter,
    openLocationFilter,
    closeLocationFilter,
  } = useFilter();
  const slideAnim = useRef(new Animated.Value(200)).current;
  const swipeHintX = useRef(new Animated.Value(0)).current;
  const swipeHintRotate = useRef(new Animated.Value(0)).current;
  const swipeHintOpacity = useRef(new Animated.Value(0)).current;
  const filterPulse = useRef(new Animated.Value(1)).current;
  const filterCalloutOpacity = useRef(new Animated.Value(0)).current;
  const hasPlayedHint = useRef(false);

  useEffect(() => {
    if (user) {
      getCurrentLocation();
    } else {
      setEvents([]);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if ((browseLocation || userLocation) && user) {
      fetchNearbyEvents();
    }
  }, [userLocation, browseLocation, user, selectedFilter, selectedTypeFilter]);

  // Play a one-time "these are swipeable / this is filterable" hint once
  // the first batch of cards has loaded.
  useEffect(() => {
    if (hasPlayedHint.current || loading || events.length === 0) return;
    hasPlayedHint.current = true;

    const wiggle = (value, distance) =>
      Animated.sequence([
        Animated.timing(value, { toValue: distance, duration: 260, useNativeDriver: true }),
        Animated.timing(value, { toValue: -distance, duration: 420, useNativeDriver: true }),
        Animated.timing(value, { toValue: distance * 0.5, duration: 320, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]);

    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(swipeHintOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.parallel([
          wiggle(swipeHintX, 26),
          wiggle(swipeHintRotate, 1),
        ]),
        Animated.timing(swipeHintOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        Animated.sequence([
          Animated.timing(filterCalloutOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(filterPulse, { toValue: 1.25, duration: 220, useNativeDriver: true }),
            Animated.timing(filterPulse, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.timing(filterPulse, { toValue: 1.25, duration: 220, useNativeDriver: true }),
            Animated.timing(filterPulse, { toValue: 1, duration: 220, useNativeDriver: true }),
          ]),
          Animated.delay(400),
          Animated.timing(filterCalloutOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [loading, events.length]);

  // Handle filter drawer opening
  useEffect(() => {
    if (showFilterDrawer) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Start from underneath the nav menu
      slideAnim.setValue(Platform.OS === 'ios' ? 238 : 200); // Height of drawer + nav menu
    }
  }, [showFilterDrawer]);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (USE_MOCK_API) {
          setUserLocation(DEMO_LOCATION);
          return;
        }
        Alert.alert('Permission Denied', 'Location permission is required to find nearby events.');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      if (USE_MOCK_API) {
        setUserLocation(DEMO_LOCATION);
        return;
      }
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get your location.');
      setLoading(false);
    }
  };

  const fetchNearbyEvents = async () => {
    // A browse-location override (picking somewhere other than "near me")
    // takes priority over the device's live GPS location, so it's used
    // even before the device location has resolved.
    const effectiveLocation = browseLocation
      ? { latitude: browseLocation.latitude, longitude: browseLocation.longitude }
      : userLocation;
    if (!user || !effectiveLocation) return;

    try {
      setLoading(true);

      const params = {
        latitude: effectiveLocation.latitude,
        longitude: effectiveLocation.longitude,
        radius: (browseLocation?.radiusKm || user.searchRadius || 25) * 1000, // km to meters
        limit: 20,
      };

      // Add category filter if selected
      if (selectedFilter) {
        params.category = selectedFilter;
      }
      if (selectedTypeFilter) {
        params.type = selectedTypeFilter;
      }

      console.log('🔍 Fetching events with location:', params);
      
      const response = await api.get('/events/nearby', { params });
      setEvents(response.data.data);
      // cardIndex from the previous (possibly filtered) list can point
      // past the end of this new one - the swiper library has no bounds
      // check for that and crashes hard on the next render.
      setCardIndex(0);

    } catch (error) {
      console.error('Error fetching events:', error);
      Alert.alert('Error', 'Failed to fetch nearby events.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterSelect = (categoryId) => {
    selectFilter(categoryId);
    setCardIndex(0); // Reset to first card
  };

  const handleClearFilter = () => {
    clearFilter();
    setCardIndex(0); // Reset to first card
  };

  const onSwipe = async (direction, eventId) => {
    try {
      console.log('🎯 Attempting swipe:', { direction, eventId, action: direction === 'right' ? 'like' : 'pass' });
      
      const response = await api.post('/users/swipe', {
        eventId: eventId,
        action: direction === 'right' ? 'like' : 'pass'
      });
      
      console.log('✅ Swipe successful:', response.data);
      
      // Show success message for applications
      if (direction === 'right') {
        Alert.alert(
          'Application Sent! 🎉', 
          'Your application has been sent to the organizer. You\'ll be notified when they respond!',
          [{ text: 'Got it!', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('❌ Error recording swipe:', error);
      Alert.alert('Error', 'Failed to submit application. Please try again.');
    }
  };

  const onSwiped = (cardIndex) => {
    setCardIndex(cardIndex + 1);
  };

  const onSwipedAll = () => {
    Alert.alert('No more events!', 'Check back later for new events.');
  };

  const handleSuperLike = async () => {
  if (!user.premium?.active && user.premium?.superLikesUsed >= 1) {
    Alert.alert('Premium Feature', 'Upgrade to premium for unlimited super likes!');
    return;
  }

  if (events[cardIndex]) {
    try {
      await api.post('/users/swipe', {
        eventId: events[cardIndex]._id,
        action: 'super_like'
      });
      
      console.log('✅ Super like sent for event:', events[cardIndex]._id);
      
      // Show success message for super like
      Alert.alert(
        'Super Application Sent! ⚡', 
        'Your priority application has been sent! This will appear at the top of the organizer\'s list.',
        [{ text: 'Awesome!', style: 'default' }]
      );
      
      swiperRef.current?.swipeTop();
    } catch (error) {
      console.error('Error sending super like:', error);
      console.error('Error details:', error.response?.data);
      Alert.alert('Error', 'Failed to send super like');
    }
  }
};

  const handleRewind = async () => {
    if (!user.premium?.active) {
      Alert.alert('Premium Feature', 'Upgrade to premium to rewind swipes!');
      return;
    }
    Alert.alert('Rewind', 'Rewind feature coming soon!');
  };

  // Show loading only if we have a user but are still loading
  if (loading && user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0078FF" />
        <Text style={styles.loadingText}>Finding events near you...</Text>
      </View>
    );
  }

  // If no user, show a login prompt
  if (!user) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="log-in-outline" size={64} color="#666161" />
        <Text style={styles.emptyText}>Please log in</Text>
        <Text style={styles.emptySubtext}>Log in to discover events near you</Text>
      </View>
    );
  }

  if (!userLocation && !browseLocation) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="location-outline" size={64} color="#666161" />
        <Text style={styles.emptyText}>Location access required</Text>
        <Text style={styles.emptySubtext}>Enable location to find nearby events</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={getCurrentLocation}>
          <Text style={styles.refreshButtonText}>Enable Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Once cardIndex reaches the end of the list, react-native-deck-swiper
  // has no bounds checking of its own for further interaction (a button
  // press, a stray gesture) - it throws, and with no error boundary that
  // tears down the whole page to a blank white screen. Unmounting the
  // Swiper and showing the same empty state used for a genuinely empty
  // list sidesteps that entirely, rather than trying to guard every way
  // of poking a swiper that has nothing left to show.
  if (events.length === 0 || cardIndex >= events.length) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color="#666161" />
          <Text style={styles.emptyText}>
            {selectedFilter ? 'No events found in this category' : 'No events found nearby'}
          </Text>
          <Text style={styles.emptySubtext}>
            {browseLocation
              ? `Nothing within ${browseLocation.radiusKm}km of ${browseLocation.label}`
              : (selectedFilter ? 'Try a different category or check back later!' : 'Try creating one or check back later!')}
          </Text>
          {selectedFilter && (
            <TouchableOpacity style={styles.refreshButton} onPress={handleClearFilter}>
              <Text style={styles.refreshButtonText}>Clear Filter</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.locationLink} onPress={openLocationFilter}>
            <Ionicons name="location-outline" size={16} color="#0078FF" />
            <Text style={styles.locationLinkText}>
              {browseLocation ? 'Change browse location' : 'Browse events somewhere else'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Drawer */}
        <Modal
          visible={showFilterDrawer}
          transparent={true}
          animationType="none"
          onRequestClose={closeFilterDrawer}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={closeFilterDrawer}
          >
            <Animated.View 
              style={[
                styles.filterDrawer,
                {
                  transform: [{ translateY: slideAnim }]
                }
              ]}
            >
              <TouchableOpacity 
                activeOpacity={1}
                style={styles.drawerContent}
                onPress={(e) => e.stopPropagation()}
              >
                {/* Row 1: type filter */}
                <View style={styles.filterRow}>
                  <View style={styles.lfgSection}>
                    <View style={styles.lfgItem}>
                      <Ionicons name="funnel" size={24} color="#0078FF" />
                      <Text style={styles.lfgText}>Filter</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.typeFilterRow}>
                    {[
                      { id: null, label: 'All' },
                      { id: 'event', label: 'Events' },
                      { id: 'group', label: 'Groups' },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.label}
                        style={[
                          styles.typeFilterButton,
                          selectedTypeFilter === opt.id && styles.typeFilterButtonActive
                        ]}
                        onPress={() => selectTypeFilter(opt.id)}
                      >
                        <Text style={[
                          styles.typeFilterButtonText,
                          selectedTypeFilter === opt.id && styles.typeFilterButtonTextActive
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Row 2: categories, full width */}
                <View style={styles.filterRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoriesContainer}
                  contentContainerStyle={{ alignItems: 'center' }}
                >
                  <TouchableOpacity
                    style={styles.categoryItem}
                    onPress={handleClearFilter}
                  >
                    <Ionicons
                      name="grid-outline"
                      size={20}
                      color={!selectedFilter ? '#0078FF' : '#FFFFFF'}
                    />
                    <Text style={[
                      styles.categoryText,
                      { color: !selectedFilter ? '#0078FF' : '#FFFFFF' }
                    ]}>
                      All
                    </Text>
                  </TouchableOpacity>

                  {CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryItem,
                        selectedFilter === category.id && {
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: 8,
                          paddingHorizontal: 8,
                        }
                      ]}
                      onPress={() => handleFilterSelect(category.id)}
                    >
                      <Ionicons
                        name={category.icon}
                        size={20}
                        color={category.color}  // Always use category color
                      />
                      <Text style={[
                        styles.categoryText,
                        {
                          color: selectedFilter === category.id ? category.color : '#FFFFFF',
                          fontWeight: selectedFilter === category.id ? '600' : '500'
                        }
                      ]}>
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}

                </ScrollView>
                </View>

                {/* Row 3: browse location */}
                <View style={styles.filterRow}>
                  <TouchableOpacity style={styles.locationFilterRow} onPress={openLocationFilter}>
                    <Ionicons name="location-outline" size={18} color={browseLocation ? '#0078FF' : '#FFFFFF'} />
                    <Text style={[styles.locationFilterRowText, browseLocation && { color: '#0078FF' }]} numberOfLines={1}>
                      {browseLocation ? `${browseLocation.label} · ${browseLocation.radiusKm}km` : 'Near me'}
                    </Text>
                    {browseLocation && (
                      <TouchableOpacity onPress={clearBrowseLocation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={16} color="#999999" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>

        <LocationFilterModal
          visible={showLocationFilter}
          onClose={closeLocationFilter}
          onApply={(location) => { setBrowseLocation(location); closeLocationFilter(); }}
          initialLocation={browseLocation}
          deviceLocation={userLocation}
        />
      </View>
    );
  }

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {browseLocation && (
          <TouchableOpacity style={styles.locationBanner} onPress={openLocationFilter}>
            <Ionicons name="location" size={14} color="#0078FF" />
            <Text style={styles.locationBannerText} numberOfLines={1}>
              Browsing {browseLocation.label} · {browseLocation.radiusKm}km
            </Text>
            <TouchableOpacity onPress={clearBrowseLocation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#999999" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        <Animated.View
          style={[
            styles.swiperContainer,
            {
              transform: [
                { translateX: swipeHintX },
                {
                  rotate: swipeHintRotate.interpolate({
                    inputRange: [-1, 1],
                    outputRange: ['-4deg', '4deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.swipeHintBadgeLeft, { opacity: swipeHintOpacity }]}
          >
            <Ionicons name="close" size={18} color="#FFFFFF" />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[styles.swipeHintBadgeRight, { opacity: swipeHintOpacity }]}
          >
            <Ionicons name="heart" size={18} color="#FFFFFF" />
          </Animated.View>
          <Swiper
            ref={swiperRef}
            cards={events}
            renderCard={(event) => <EventCard event={event} onExpandChange={setCardExpanded} />}
            onSwiped={onSwiped}
            onSwipedAll={onSwipedAll}
            cardIndex={cardIndex}
            backgroundColor="transparent"
            cardVerticalMargin={12}
            cardHorizontalMargin={0}
            stackSize={3}
            stackScale={10}
            stackSeparation={15}
            animateOverlayLabelsOpacity
            animateCardOpacity
            swipeBackCard
            disableTopSwipe={cardExpanded}
            disableBottomSwipe={cardExpanded}
            disableLeftSwipe={cardExpanded}
            disableRightSwipe={cardExpanded}
            onSwipedLeft={(index) => onSwipe('left', events[index]._id)}
            onSwipedRight={(index) => onSwipe('right', events[index]._id)}
            overlayLabels={{
              left: {
                title: 'PASS',
                style: {
                  label: {
                    backgroundColor: '#E12112',
                    borderColor: '#E12112',
                    color: 'white',
                    borderWidth: 1,
                    fontSize: 24,
                    fontWeight: 'bold',
                    padding: 10,
                    borderRadius: 10,
                  },
                  wrapper: {
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-start',
                    marginTop: 30,
                    marginLeft: -30,
                  },
                },
              },
              right: {
                title: 'APPLY',
                style: {
                  label: {
                    backgroundColor: '#00B000',
                    borderColor: '#00B000',
                    color: 'white',
                    borderWidth: 1,
                    fontSize: 24,
                    fontWeight: 'bold',
                    padding: 10,
                    borderRadius: 10,
                  },
                  wrapper: {
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    marginTop: 30,
                    marginLeft: 30,
                  },
                },
              },
              top: {
                title: 'SUPER LIKE',
                style: {
                  label: {
                    backgroundColor: '#FFEB1C',
                    borderColor: '#FFEB1C',
                    color: 'black',
                    borderWidth: 1,
                    fontSize: 24,
                    fontWeight: 'bold',
                    padding: 10,
                    borderRadius: 10,
                  },
                  wrapper: {
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                },
              },
            }}
          />
        </Animated.View>

      {/* Floating Action Buttons */}
      <View style={styles.floatingButtonsContainer}>
        <TouchableOpacity style={[styles.button]} onPress={handleRewind}>
          <Ionicons name="arrow-undo" size={24} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.passButton]}
          onPress={() => events[cardIndex] && swiperRef.current?.swipeLeft()}
        >
          <Ionicons name="close" size={36} color="#E12112" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.superLikeButton]}
          onPress={handleSuperLike}
        >
          <Ionicons name="flash" size={24} color="#F4632a" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.likeButton]}
          onPress={() => events[cardIndex] && swiperRef.current?.swipeRight()}
        >
          <Ionicons name="heart" size={36} color="#00B000" />
        </TouchableOpacity>

        <View style={styles.filterButtonWrap}>
          <Animated.View
            pointerEvents="none"
            style={[styles.filterCallout, { opacity: filterCalloutOpacity }]}
          >
            <Text style={styles.filterCalloutText}>Tap to filter</Text>
            <View style={styles.filterCalloutArrow} />
          </Animated.View>
          <TouchableOpacity
            style={[styles.button]}
            onPress={() => (showFilterDrawer ? closeFilterDrawer() : openFilterDrawer())}
          >
            <Animated.View style={{ transform: [{ scale: filterPulse }] }}>
              <Ionicons name="funnel" size={24} color="#666666" />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Drawer */}
      <Modal
        visible={showFilterDrawer}
        transparent={true}
        animationType="none"
        onRequestClose={closeFilterDrawer}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeFilterDrawer}
        >
          <Animated.View 
            style={[
              styles.filterDrawer,
              {
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <TouchableOpacity 
              activeOpacity={1}
              style={styles.drawerContent}
              onPress={(e) => e.stopPropagation()}
            >
              {/* Row 1: type filter */}
              <View style={styles.filterRow}>
                <View style={styles.lfgSection}>
                  <View style={styles.lfgItem}>
                    <Ionicons name="funnel" size={24} color="#0078FF" />
                    <Text style={styles.lfgText}>Filter</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.typeFilterRow}>
                  {[
                    { id: null, label: 'All' },
                    { id: 'event', label: 'Events' },
                    { id: 'group', label: 'Groups' },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.label}
                      style={[
                        styles.typeFilterButton,
                        selectedTypeFilter === opt.id && styles.typeFilterButtonActive
                      ]}
                      onPress={() => selectTypeFilter(opt.id)}
                    >
                      <Text style={[
                        styles.typeFilterButtonText,
                        selectedTypeFilter === opt.id && styles.typeFilterButtonTextActive
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Row 2: categories, full width */}
              <View style={styles.filterRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoriesContainer}
                contentContainerStyle={{ alignItems: 'center' }}
              >
                <TouchableOpacity
                  style={styles.categoryItem}
                  onPress={handleClearFilter}
                >
                  <Ionicons 
                    name="grid-outline" 
                    size={20} 
                    color={!selectedFilter ? '#0078FF' : '#FFFFFF'} 
                  />
                  <Text style={[
                    styles.categoryText,
                    { color: !selectedFilter ? '#0078FF' : '#FFFFFF' }
                  ]}>
                    All
                  </Text>
                </TouchableOpacity>

                {CATEGORIES.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryItem,
                    selectedFilter === category.id && { 
                      backgroundColor: 'rgba(255, 255, 255, 0.0)',
                      borderRadius: 8,
                      paddingHorizontal: 8,
                    }
                  ]}
                  onPress={() => handleFilterSelect(category.id)}
                >
                  <Ionicons 
                    name={category.icon} 
                    size={20} 
                    color={category.color}  // ✅ Always use category color
                  />
                  <Text style={[
                    styles.categoryText,
                    { 
                      color: selectedFilter === category.id ? category.color : '#FFFFFF',  // ✅ Use category color when selected
                      fontWeight: selectedFilter === category.id ? '600' : '500'
                    }
                  ]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
              </ScrollView>
              </View>

              {/* Row 3: browse location */}
              <View style={styles.filterRow}>
                <TouchableOpacity style={styles.locationFilterRow} onPress={openLocationFilter}>
                  <Ionicons name="location-outline" size={18} color={browseLocation ? '#0078FF' : '#FFFFFF'} />
                  <Text style={[styles.locationFilterRowText, browseLocation && { color: '#0078FF' }]} numberOfLines={1}>
                    {browseLocation ? `${browseLocation.label} · ${browseLocation.radiusKm}km` : 'Near me'}
                  </Text>
                  {browseLocation && (
                    <TouchableOpacity onPress={clearBrowseLocation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color="#999999" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      <LocationFilterModal
        visible={showLocationFilter}
        onClose={closeLocationFilter}
        onApply={(location) => { setBrowseLocation(location); closeLocationFilter(); }}
        initialLocation={browseLocation}
        deviceLocation={userLocation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    marginTop: 10,
    color: '#C7C4C4',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#121212',
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#C7C4C4',
    marginTop: 8,
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 20,
    backgroundColor: '#0078FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  refreshButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  locationLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  locationLinkText: {
    color: '#0078FF',
    fontSize: 14,
    fontWeight: '600',
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 120, 255, 0.12)',
    borderRadius: 20,
  },
  locationBannerText: {
    flex: 1,
    color: '#0078FF',
    fontSize: 13,
    fontWeight: '600',
  },
    swiperContainer: {
    flex: 1,
    backgroundColor: '#121212',
    marginTop: 8,
    marginBottom: 10, // Add bottom margin for button clearance
  },
  swipeHintBadgeLeft: {
    position: 'absolute',
    top: '38%',
    left: 28,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(225, 33, 18, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeHintBadgeRight: {
    position: 'absolute',
    top: '38%',
    right: 28,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 176, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonWrap: {
    alignItems: 'center',
  },
  filterCallout: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 10,
    backgroundColor: '#0078FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    alignItems: 'center',
  },
  filterCalloutText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  filterCalloutArrow: {
    position: 'absolute',
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0078FF',
  },
// NEW: Floating buttons container
  floatingButtonsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 0 : 0, // Float above the tab bar
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(18, 18, 18, 0)', // Semi-transparent background
    zIndex: 10, // Ensure buttons float above cards
  },
  
  button: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e5e5e5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 5, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8, // Higher elevation for Android
  },
  passButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  likeButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  superLikeButton: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
  },
  // Filter Drawer Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  filterDrawer: {
    backgroundColor: '#0A0A0A', // Match navigator background
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 12,
    paddingBottom: 12,
    height: Platform.OS === 'ios' ? 205 : 180, // Three rows: type filter, categories, location
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 83 : 70, // Sit just above the nav menu
    left: 0,
    right: 0,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: '33.33%',
  },
  locationFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: '100%',
  },
  locationFilterRowText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  drawerContent: {
    flexDirection: 'column',
    height: '100%', // Fill the drawer height
  },
  lfgSection: {
    marginRight: 20,
  },
  lfgItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60, // Smaller to fit better
  },
  lfgText: {
    color: '#FFFFFF',
    fontSize: 12, // Match navigator text size
    fontWeight: '500',
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 40, // Smaller height
    backgroundColor: '#1A1A1A', // Match navigator border color
    marginRight: 20,
  },
  categoriesContainer: {
    // Remove alignItems from here as it's now in contentContainerStyle
    paddingRight: 20,
  },
  typeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 20,
  },
  typeFilterButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
  },
  typeFilterButtonActive: {
    backgroundColor: '#0078FF',
  },
  typeFilterButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  typeFilterButtonTextActive: {
    fontWeight: '700',
  },
  categoryItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60, // Match lfgItem width
    marginRight: 12, // Smaller spacing
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 10, // Smaller text
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
filterButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});