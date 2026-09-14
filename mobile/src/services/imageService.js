// mobile/src/services/imageService.js
import api from './api';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

/**
 * ImageService
 * 
 * Centralized service for all image-related operations including:
 * - Uploading images to backend/Cloudinary
 * - Deleting images
 * - URL optimization for different contexts
 * - Image compression and manipulation
 * - Batch operations
 * - Cache management
 */
class ImageService {
  /**
   * Upload user profile photos
   * @param {Array} photos - Array of photo objects from ImagePicker
   * @returns {Promise} API response with uploaded photo data
   */
  static async uploadUserPhotos(photos) {
    try {
      const formData = new FormData();
      
      // Process and append each photo
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        
        // Compress image if needed
        const processedPhoto = await this.processImageForUpload(photo);
        
        formData.append('photos', {
          uri: processedPhoto.uri,
          type: photo.type || 'image/jpeg',
          name: photo.fileName || `photo_${Date.now()}_${i}.jpg`,
        });
      }

      const response = await api.post('/users/photos', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 second timeout for uploads
      });

      return response.data;
    } catch (error) {
      console.error('ImageService.uploadUserPhotos error:', error);
      throw this.handleUploadError(error);
    }
  }

  /**
   * Upload event photos
   * @param {String} eventId - Event ID
   * @param {Array} photos - Array of photo objects from ImagePicker
   * @returns {Promise} API response with uploaded photo data
   */
  static async uploadEventPhotos(eventId, photos) {
    try {
      const formData = new FormData();
      
      // Process and append each photo
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        
        // Compress image if needed
        const processedPhoto = await this.processImageForUpload(photo);
        
        formData.append('photos', {
          uri: processedPhoto.uri,
          type: photo.type || 'image/jpeg',
          name: photo.fileName || `event_photo_${Date.now()}_${i}.jpg`,
        });
      }

      const response = await api.post(`/events/${eventId}/photos`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      console.error('ImageService.uploadEventPhotos error:', error);
      throw this.handleUploadError(error);
    }
  }

  /**
   * Delete a user's photo
   * @param {String} photoId - Photo ID to delete
   * @returns {Promise} API response
   */
  static async deleteUserPhoto(photoId) {
    try {
      const response = await api.delete(`/users/photos/${photoId}`);
      return response.data;
    } catch (error) {
      console.error('ImageService.deleteUserPhoto error:', error);
      throw error;
    }
  }

  /**
   * Delete an event's photo
   * @param {String} eventId - Event ID
   * @param {String} photoId - Photo ID to delete
   * @returns {Promise} API response
   */
  static async deleteEventPhoto(eventId, photoId) {
    try {
      const response = await api.delete(`/events/${eventId}/photos/${photoId}`);
      return response.data;
    } catch (error) {
      console.error('ImageService.deleteEventPhoto error:', error);
      throw error;
    }
  }

  /**
   * Process image before upload (compress, resize if needed)
   * @param {Object} image - Image object from ImagePicker
   * @returns {Promise<Object>} Processed image object
   */
  static async processImageForUpload(image) {
    try {
      // Check if image needs processing
      const fileInfo = await FileSystem.getInfoAsync(image.uri);
      const fileSizeMB = fileInfo.size / 1024 / 1024;
      
      // If image is over 2MB or dimensions are very large, compress it
      if (fileSizeMB > 2 || image.width > 2000 || image.height > 2000) {
        const manipResult = await ImageManipulator.manipulateAsync(
          image.uri,
          [
            {
              resize: {
                width: Math.min(image.width, 1200),
                height: Math.min(image.height, 1200),
              },
            },
          ],
          {
            compress: 0.8,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );
        
        return {
          ...image,
          uri: manipResult.uri,
          width: manipResult.width,
          height: manipResult.height,
        };
      }
      
      return image;
    } catch (error) {
      console.error('Error processing image:', error);
      // Return original image if processing fails
      return image;
    }
  }

  /**
   * Optimize Cloudinary URL for different contexts
   * @param {String} url - Original Cloudinary URL
   * @param {Object} options - Optimization options
   * @returns {String} Optimized URL
   */
  static getOptimizedUrl(url, options = {}) {
    if (!url || !url.includes('cloudinary')) return url;
    
    const {
      width = 400,
      height = 400,
      crop = 'fill',
      quality = 'auto',
      format = 'auto',
      dpr = 'auto',
      effects = []
    } = options;
    
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
    
    // Replace or add transformations
    if (url.includes('/upload/')) {
      // Check if URL already has transformations
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
    
    return url;
  }

  /**
   * Get thumbnail URL (small size, lower quality)
   * @param {String} url - Original image URL
   * @returns {String} Thumbnail URL
   */
  static getThumbnailUrl(url) {
    return this.getOptimizedUrl(url, {
      width: 150,
      height: 150,
      crop: 'fill',
      quality: 'auto:low',
      format: 'auto'
    });
  }

  /**
   * Get profile photo URL (medium size, face detection)
   * @param {String} url - Original image URL
   * @returns {String} Profile photo URL
   */
  static getProfilePhotoUrl(url) {
    return this.getOptimizedUrl(url, {
      width: 400,
      height: 400,
      crop: 'fill',
      quality: 'auto:good',
      effects: ['g_face'], // Gravity face detection
      format: 'auto'
    });
  }

  /**
   * Get event card URL (landscape, medium quality)
   * @param {String} url - Original image URL
   * @returns {String} Event card URL
   */
  static getEventCardUrl(url) {
    return this.getOptimizedUrl(url, {
      width: 600,
      height: 400,
      crop: 'fill',
      quality: 'auto:good',
      format: 'auto'
    });
  }

  /**
   * Get full size URL (high quality, limited dimensions)
   * @param {String} url - Original image URL
   * @returns {String} Full size URL
   */
  static getFullSizeUrl(url) {
    return this.getOptimizedUrl(url, {
      width: 1080,
      height: 1080,
      crop: 'limit', // Don't crop, just limit dimensions
      quality: 90,
      format: 'auto'
    });
  }

  /**
   * Get chat message image URL (compressed for quick loading)
   * @param {String} url - Original image URL
   * @returns {String} Chat image URL
   */
  static getChatImageUrl(url) {
    return this.getOptimizedUrl(url, {
      width: 300,
      height: 300,
      crop: 'limit',
      quality: 'auto:eco', // Economic quality for faster loading
      format: 'auto'
    });
  }

  /**
   * Get blur placeholder URL (very small, blurred)
   * @param {String} url - Original image URL
   * @returns {String} Blur placeholder URL
   */
  static getBlurPlaceholderUrl(url) {
    return this.getOptimizedUrl(url, {
      width: 30,
      height: 30,
      crop: 'fill',
      quality: 10,
      effects: ['e_blur:300'],
      format: 'auto'
    });
  }

  /**
   * Generate srcset for responsive images
   * @param {String} url - Original image URL
   * @param {Array} widths - Array of widths to generate
   * @returns {String} Srcset string
   */
  static generateSrcSet(url, widths = [300, 600, 900, 1200]) {
    return widths.map(width => {
      const optimizedUrl = this.getOptimizedUrl(url, { width, height: width });
      return `${optimizedUrl} ${width}w`;
    }).join(', ');
  }

  /**
   * Handle upload errors with user-friendly messages
   * @param {Error} error - Upload error
   * @returns {Error} Formatted error
   */
  static handleUploadError(error) {
    if (error.response) {
      // Server responded with error
      const status = error.response.status;
      const message = error.response.data?.message;
      
      if (status === 413) {
        return new Error('Image file size is too large. Please choose a smaller image.');
      } else if (status === 400) {
        return new Error(message || 'Invalid image format. Please choose a different image.');
      } else if (status === 401) {
        return new Error('Please log in again to upload images.');
      } else if (status === 403) {
        return new Error('You do not have permission to upload images.');
      } else if (status === 500) {
        return new Error('Server error. Please try again later.');
      }
    } else if (error.request) {
      // Request was made but no response
      return new Error('Network error. Please check your internet connection.');
    }
    
    return error;
  }

  /**
   * Batch upload multiple images with progress callback
   * @param {String} type - 'user' or 'event'
   * @param {Array} images - Array of images to upload
   * @param {Function} onProgress - Progress callback (optional)
   * @param {String} eventId - Event ID (required for event uploads)
   * @returns {Promise<Array>} Array of upload results
   */
  static async batchUpload(type, images, onProgress, eventId = null) {
    const results = [];
    const total = images.length;
    
    for (let i = 0; i < total; i++) {
      try {
        let result;
        
        if (type === 'user') {
          result = await this.uploadUserPhotos([images[i]]);
        } else if (type === 'event' && eventId) {
          result = await this.uploadEventPhotos(eventId, [images[i]]);
        } else {
          throw new Error('Invalid upload type or missing eventId');
        }
        
        results.push({ success: true, data: result });
        
        if (onProgress) {
          onProgress((i + 1) / total, i + 1, total);
        }
      } catch (error) {
        results.push({ success: false, error: error.message });
        
        if (onProgress) {
          onProgress((i + 1) / total, i + 1, total, error);
        }
      }
    }
    
    return results;
  }

  /**
   * Clear image cache (if implemented)
   * @returns {Promise} Clear cache result
   */
  static async clearImageCache() {
    try {
      // If using expo-image or FastImage, clear their caches
      // This is a placeholder for cache clearing logic
      console.log('Image cache cleared');
      return true;
    } catch (error) {
      console.error('Error clearing image cache:', error);
      return false;
    }
  }
}

export default ImageService;

// Export individual functions for convenience
export const {
  uploadUserPhotos,
  uploadEventPhotos,
  deleteUserPhoto,
  deleteEventPhoto,
  getOptimizedUrl,
  getThumbnailUrl,
  getProfilePhotoUrl,
  getEventCardUrl,
  getFullSizeUrl,
  getChatImageUrl,
  getBlurPlaceholderUrl,
  generateSrcSet,
  processImageForUpload,
  batchUpload,
  clearImageCache
} = ImageService;