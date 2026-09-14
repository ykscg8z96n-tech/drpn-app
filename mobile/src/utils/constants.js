// mobile/src/utils/constants.js
const DEV_API_URL = 'http://172.20.10.2:5000/api';
const PROD_API_URL = 'https://your-api-domain.com/api';

export default {
  API_URL: __DEV__ ? DEV_API_URL : PROD_API_URL,
  SOCKET_URL: __DEV__ ? 'http://192.168.1.84:5000' : 'https://your-api-domain.com',
  
  // App constants
  DEFAULT_RADIUS: 10000, // 10km in meters
  MAX_PHOTOS: 5,
  MIN_AGE: 18,
  MAX_AGE: 99,
  
  // Premium features
  SUPER_SWIPES_MONTHLY: 5,
  REWINDS_MONTHLY: 3,
  
  // UI Constants
  SWIPE_THRESHOLD: 120,
  SWIPE_OUT_DURATION: 250,
};
import { Ionicons } from '@expo/vector-icons';

// Define all available sports with their icons
export const SPORTS = [
  { name: 'Basketball', icon: 'basketball-outline', color: '#FF6B35' },
  { name: 'Soccer', icon: 'football-outline', color: '#4CAF50' },
  { name: 'Tennis', icon: 'tennisball-outline', color: '#8BC34A' },
  { name: 'Baseball', icon: 'baseball-outline', color: '#FF5722' },
  { name: 'Golf', icon: 'golf-outline', color: '#4CAF50' },
  { name: 'Football', icon: 'american-football-outline', color: '#795548' },
  { name: 'Volleyball', icon: 'basketball-outline', color: '#FFC107' }, // Using basketball as substitute
  { name: 'Running', icon: 'walk-outline', color: '#2196F3' },
  { name: 'Cycling', icon: 'bicycle-outline', color: '#00BCD4' },
  { name: 'Swimming', icon: 'water-outline', color: '#03A9F4' },
  { name: 'Fitness', icon: 'fitness-outline', color: '#E91E63' },
  { name: 'Hiking', icon: 'trail-sign-outline', color: '#8BC34A' },
  { name: 'Yoga', icon: 'body-outline', color: '#9C27B0' },
  { name: 'Boxing', icon: 'hand-left-outline', color: '#F44336' },
  { name: 'Bowling', icon: 'bowling-ball-outline', color: '#607D8B' },
  { name: 'Skiing', icon: 'snow-outline', color: '#00BCD4' },
  { name: 'Surfing', icon: 'water-outline', color: '#00ACC1' },
  { name: 'Rock Climbing', icon: 'trending-up-outline', color: '#FF7043' },
  { name: 'Martial Arts', icon: 'body-outline', color: '#D32F2F' },
  { name: 'Dance', icon: 'musical-notes-outline', color: '#E91E63' },
  { name: 'Skateboarding', icon: 'walk-outline', color: '#424242' },
  { name: 'Hockey', icon: 'snow-outline', color: '#1976D2' },
  { name: 'Badminton', icon: 'tennisball-outline', color: '#FF9800' },
  { name: 'Table Tennis', icon: 'tennisball-outline', color: '#4CAF50' },
  { name: 'Other', icon: 'trophy-outline', color: '#9E9E9E' },
];

// Helper function to get sport icon and color
export const getSportIcon = (sportName) => {
  const sport = SPORTS.find(s => s.name === sportName);
  return sport || { icon: 'trophy-outline', color: '#9E9E9E' };
};

// Sport categories for filtering (optional)
export const SPORT_CATEGORIES = {
  TEAM: ['Basketball', 'Soccer', 'Volleyball', 'Football', 'Baseball', 'Hockey'],
  INDIVIDUAL: ['Tennis', 'Golf', 'Running', 'Cycling', 'Swimming', 'Boxing', 'Bowling'],
  FITNESS: ['Fitness', 'Yoga', 'Martial Arts', 'Dance'],
  OUTDOOR: ['Hiking', 'Skiing', 'Surfing', 'Rock Climbing', 'Skateboarding'],
  RACQUET: ['Tennis', 'Badminton', 'Table Tennis'],
};

// Default sport placeholder component
export const SportPlaceholder = ({ sport, size = 100 }) => {
  const sportInfo = getSportIcon(sport);
  
  return (
    <View style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#f0f0f0',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <View style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: sportInfo.color + '20', // 20% opacity
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Ionicons 
          name={sportInfo.icon} 
          size={size * 0.6} 
          color={sportInfo.color} 
        />
      </View>
      <Text style={{
        marginTop: 10,
        fontSize: 16,
        color: '#666',
        fontWeight: '500',
      }}>
        {sport}
      </Text>
    </View>
  );
};