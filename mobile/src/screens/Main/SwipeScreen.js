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
import * as Location from 'expo-location';
import api from '../../services/api';
import EventCard from '../../components/EventCard';
import { useAuth } from '../../contexts/AuthContext';
import { useFilter } from '../../contexts/FilterContext';
import { USE_MOCK_API } from '../../utils/constants';

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
  const swiperRef = useRef(null);
  const { user } = useAuth();
  const { 
    selectedFilter, 
    showFilterDrawer, 
    openFilterDrawer, 
    closeFilterDrawer, 
    selectFilter, 
    clearFilter 
  } = useFilter();
  const slideAnim = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    if (user) {
      getCurrentLocation();
    } else {
      setEvents([]);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (userLocation && user) {
      fetchNearbyEvents();
    }
  }, [userLocation, user, selectedFilter]);

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
      slideAnim.setValue(Platform.OS === 'ios' ? 173 : 140); // Height of drawer + nav menu
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
    if (!user || !userLocation) return;
    
    try {
      setLoading(true);
      
      // Use actual user location instead of hardcoded 0,0
      const params = {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        radius: (user.searchRadius || 25) * 1000, // Convert km to meters, default 25km
        limit: 20,
      };

      // Add category filter if selected
      if (selectedFilter) {
        params.category = selectedFilter;
      }
      
      console.log('🔍 Fetching events with location:', params);
      
      const response = await api.get('/events/nearby', { params });
      setEvents(response.data.data);
      
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

  if (!userLocation) {
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

  if (events.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color="#666161" />
          <Text style={styles.emptyText}>
            {selectedFilter ? 'No events found in this category' : 'No events found nearby'}
          </Text>
          <Text style={styles.emptySubtext}>
            {selectedFilter ? 'Try a different category or check back later!' : 'Try creating one or check back later!'}
          </Text>
          {selectedFilter && (
            <TouchableOpacity style={styles.refreshButton} onPress={handleClearFilter}>
              <Text style={styles.refreshButtonText}>Clear Filter</Text>
            </TouchableOpacity>
          )}
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
                {/* Filter Section */}
                <View style={styles.lfgSection}>
                  <View style={styles.lfgItem}>
                    <Ionicons name="funnel" size={24} color="#0078FF" />
                    <Text style={styles.lfgText}>Filter</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Categories */}
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
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

    return (
      <View style={styles.container}>
        <View style={styles.swiperContainer}>
          <Swiper
            ref={swiperRef}
            cards={events}
            renderCard={(event) => <EventCard event={event} />}
            onSwiped={onSwiped}
            onSwipedAll={onSwipedAll}
            cardIndex={cardIndex}
            backgroundColor="transparent"
            stackSize={3}
            stackScale={10}
            stackSeparation={15}
            animateOverlayLabelsOpacity
            animateCardOpacity
            swipeBackCard
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
        </View>

      {/* Floating Action Buttons */}
      <View style={styles.floatingButtonsContainer}>
        <TouchableOpacity style={[styles.button]} onPress={handleRewind}>
          <Ionicons name="arrow-undo" size={24} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.passButton]} 
          onPress={() => swiperRef.current?.swipeLeft()}
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
          onPress={() => swiperRef.current?.swipeRight()}
        >
          <Ionicons name="heart" size={36} color="#00B000" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button]} 
          onPress={openFilterDrawer}
        >
          <Ionicons name="funnel" size={24} color="#666666" />
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
              {/* Filter Section */}
              <View style={styles.lfgSection}>
                <View style={styles.lfgItem}>
                  <Ionicons name="funnel" size={24} color="#0078FF" />
                  <Text style={styles.lfgText}>Filter</Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Categories */}
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
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
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
    swiperContainer: {
    flex: 1,
    backgroundColor: '#121212',
    marginTop: -50, // Reduced from -50 to prevent button overlap
    marginBottom: 10, // Add bottom margin for button clearance
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
    paddingTop: 15,
    paddingBottom: 15,
    height: Platform.OS === 'ios' ? 90 : 70, // Match navigator height
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 83 : 70, // Sit just above the nav menu
    left: 0,
    right: 0,
  },
  drawerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
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