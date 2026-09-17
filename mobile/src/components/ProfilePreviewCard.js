// mobile/src/components/ProfilePreviewCard.js
//
// The same card shown on your own Profile screen's "Preview" tab - photo
// carousel, name/age, About - reused wherever someone else's profile
// needs to be shown the same way (e.g. tapping a roster/pending row).
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

const calculateAge = (birthDate) => {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split('T')[0].split('-').map(Number);
  const birth = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

export default function ProfilePreviewCard({ profile }) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photos = profile?.photos || [];
  const hasPhotos = photos.length > 0;
  const userAge = calculateAge(profile?.birthDate || profile?.birthdate);

  const prevPhoto = () => {
    setCurrentPhotoIndex((i) => (i === 0 ? photos.length - 1 : i - 1));
  };
  const nextPhoto = () => {
    setCurrentPhotoIndex((i) => (i === photos.length - 1 ? 0 : i + 1));
  };

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewImageContainer}>
        {hasPhotos ? (
          <>
            <Image
              source={{ uri: photos[currentPhotoIndex]?.url || photos[currentPhotoIndex] }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            {photos.length > 1 && (
              <>
                <TouchableOpacity style={styles.carouselNavLeft} onPress={prevPhoto}>
                  <Ionicons name="chevron-back" size={24} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.carouselNavRight} onPress={nextPhoto}>
                  <Ionicons name="chevron-forward" size={24} color="white" />
                </TouchableOpacity>
                <View style={styles.carouselIndicators}>
                  {photos.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.carouselIndicator,
                        index === currentPhotoIndex && styles.activeCarouselIndicator
                      ]}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        ) : (
          <View style={styles.previewImagePlaceholder}>
            <View style={styles.placeholderAvatar}>
              <Text style={styles.placeholderAvatarText}>
                {(profile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.previewContent}>
        <View style={styles.nameRow}>
          <Text style={styles.previewName}>{profile?.name || 'Unknown'}</Text>
          {profile?.isSuperSwipe && (
            <View style={styles.superSwipeBadge}>
              <Ionicons name="flash" size={12} color="white" />
              <Text style={styles.superSwipeBadgeText}>Super Swipe</Text>
            </View>
          )}
        </View>

        {userAge && (
          <Text style={styles.previewAge}>{userAge} years old</Text>
        )}

        {profile?.bio ? (
          <View style={styles.aboutSection}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.previewBio}>{profile.bio}</Text>
          </View>
        ) : (
          <Text style={styles.previewBioEmpty}>No bio yet</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewCard: {
    backgroundColor: '#000000',
  },
  previewImageContainer: {
    position: 'relative',
    height: height * 0.6,
    backgroundColor: '#1A1A1A',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderAvatarText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '600',
  },
  carouselNavLeft: {
    position: 'absolute',
    left: 16,
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselNavRight: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselIndicators: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  carouselIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  activeCarouselIndicator: {
    backgroundColor: 'white',
    width: 20,
  },
  previewContent: {
    padding: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  previewName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  superSwipeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0078FF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  superSwipeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  previewAge: {
    fontSize: 16,
    color: '#999999',
    marginBottom: 16,
  },
  aboutSection: {
    marginTop: 4,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  previewBio: {
    fontSize: 16,
    color: '#CCCCCC',
    lineHeight: 22,
  },
  previewBioEmpty: {
    fontSize: 16,
    color: '#666666',
    fontStyle: 'italic',
  },
});
