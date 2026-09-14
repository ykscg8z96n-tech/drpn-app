// mobile/src/screens/SplashScreen.js
import React, { useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated,
  Dimensions,
  Image,
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function SplashScreen() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in the logo
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    // Create a continuous subtle pulse effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <Image
        source={require('../assets/splash-background.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      
      {/* Dark Overlay */}
      <View style={styles.darkOverlay} />
      
      {/* Logo Container */}
      <Animated.View 
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: pulseAnim }]
          }
        ]}
      >
        {/* Your Logo Image */}
        <Image 
          source={require('../assets/logo.png')} 
          style={styles.logoImage}
          resizeMode="contain"
        />
        
        {/* Optional: Remove this text if you only want the logo */}
        <Text style={styles.appName}></Text>
      </Animated.View>
      
      {/* Subtle loading indicator */}
      <View style={styles.loadingContainer}>
        <View style={styles.loadingDot} />
      </View>
    </View>
  );
}

// Replace ONLY the styles section in your existing SplashScreen.js file:

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827', // Dark background
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: screenWidth,
    height: screenHeight,
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.85)', // Dark overlay
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 240,
    height: 240,
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F9FAFB', // Light text
    letterSpacing: 2,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB', // Primary blue
    opacity: 0.7,
  },
});