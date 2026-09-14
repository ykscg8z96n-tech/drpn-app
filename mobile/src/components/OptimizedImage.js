// mobile/src/components/OptimizedImage.js
import React, { useState, useEffect } from 'react';
import {
  Image,
  View,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * OptimizedImage Component
 * 
 * A smart image component that handles:
 * - Loading states with customizable placeholders
 * - Error states with fallback UI
 * - Cloudinary URL optimization for performance
 * - Fade-in animation when image loads
 * - Automatic image caching
 * 
 * @param {Object} source - Image source object with uri
 * @param {Object} style - Style object for the image container
 * @param {Component} placeholder - Custom placeholder component (optional)
 * @param {string} resizeMode - Image resize mode (cover, contain, etc)
 * @param {Function} onLoad - Callback when image loads successfully
 * @param {Function} onError - Callback when image fails to load
 * @param {Object} imageStyle - Additional styles for the image itself
 * @param {boolean} showLoadingOverlay - Whether to show loading overlay
 */
export default function OptimizedImage({ 
  source, 
  style, 
  placeholder,
  resizeMode = 'cover',
  onLoad,
  onError,
  imageStyle,
  showLoadingOverlay = true,
  fallbackIcon = 'image-outline',
  fallbackIconSize = 40,
  fallbackIconColor = '#ccc',
  optimizationOptions = {}
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    // Reset states when source changes
    setLoading(true);
    setError(false);
    fadeAnim.setValue(0);
  }, [source?.uri]);

  const handleLoadStart = () => {
    setLoading(true);
  };

  const handleLoadEnd = () => {
    setLoading(false);
    
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
    
    if (onLoad) {
      onLoad();
    }
  };

  const handleError = (errorEvent) => {
    setLoading(false);
    setError(true);
    
    if (onError) {
      onError(errorEvent);
    }
  };

  // Transform Cloudinary URL for optimization
  const getOptimizedUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    
    // Check if it's a Cloudinary URL
    if (!url.includes('cloudinary')) return url;
    
    // Extract optimization parameters
    const {
      width = 800,
      height = 800,
      crop = 'limit',
      quality = 'auto:good',
      format = 'auto',
      dpr = 'auto',
      effects = []
    } = optimizationOptions;
    
    // Build transformation string
    let transformations = [
      `w_${width}`,
      `h_${height}`,
      `c_${crop}`,
      `q_${quality}`,
      `f_${format}`,
      `dpr_${dpr}`
    ];
    
    // Add any additional effects
    if (effects.length > 0) {
      transformations = transformations.concat(effects);
    }
    
    const transformString = transformations.join(',');
    
    // Insert transformations into URL
    if (url.includes('/upload/')) {
      return url.replace('/upload/', `/upload/${transformString}/`);
    } else {
      // Handle URLs that might already have transformations
      const uploadIndex = url.indexOf('/upload/') + 8;
      const nextSlashIndex = url.indexOf('/', uploadIndex);
      
      if (nextSlashIndex > uploadIndex) {
        // Replace existing transformations
        return url.substring(0, uploadIndex) + transformString + url.substring(nextSlashIndex);
      } else {
        // Add transformations
        return url.replace('/upload/', `/upload/${transformString}/`);
      }
    }
  };

  // Get the optimized image source
  const imageSource = source?.uri 
    ? { ...source, uri: getOptimizedUrl(source.uri) }
    : source;

  // Container style with defaults
  const containerStyle = [
    styles.container,
    style
  ];

  return (
    <View style={containerStyle}>
      {/* Loading State */}
      {loading && showLoadingOverlay && !error && (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          {placeholder || (
            <ActivityIndicator size="small" color="#FF6B6B" />
          )}
        </View>
      )}
      
      {/* Error State */}
      {error ? (
        <View style={[StyleSheet.absoluteFill, styles.errorContainer]}>
          <Ionicons 
            name={fallbackIcon} 
            size={fallbackIconSize} 
            color={fallbackIconColor} 
          />
        </View>
      ) : (
        /* Image */
        <Animated.Image
          source={imageSource}
          style={[
            StyleSheet.absoluteFill,
            imageStyle,
            { opacity: fadeAnim }
          ]}
          resizeMode={resizeMode}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
        />
      )}
    </View>
  );
}

// Preset optimization options for common use cases
OptimizedImage.presets = {
  thumbnail: {
    width: 150,
    height: 150,
    crop: 'fill',
    quality: 'auto:low'
  },
  profile: {
    width: 400,
    height: 400,
    crop: 'fill',
    quality: 'auto:good',
    effects: ['g_face'] // Focus on face
  },
  eventCard: {
    width: 600,
    height: 400,
    crop: 'fill',
    quality: 'auto:good'
  },
  fullScreen: {
    width: 1080,
    height: 1920,
    crop: 'limit',
    quality: 'auto:best'
  },
  listItem: {
    width: 100,
    height: 100,
    crop: 'fill',
    quality: 'auto:eco' // Lower quality for lists
  }
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});

// Export utility function for use outside component
export const optimizeCloudinaryUrl = (url, options = {}) => {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary')) {
    return url;
  }
  
  const {
    width = 800,
    height = 800,
    crop = 'limit',
    quality = 'auto:good',
    format = 'auto'
  } = options;
  
  const transformString = `w_${width},h_${height},c_${crop},q_${quality},f_${format}`;
  
  return url.replace('/upload/', `/upload/${transformString}/`);
};