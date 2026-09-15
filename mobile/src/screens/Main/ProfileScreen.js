// mobile/src/screens/Main/ProfileScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import DateTimePicker from '@react-native-community/datetimepicker';
import WebDateInput, { toDateOnlyString } from '../../components/WebDateInput';

const { width, height } = Dimensions.get('window');

// birthDate comes back from the API as a date-only value (either a plain
// 'YYYY-MM-DD' or an ISO timestamp at UTC midnight). Parsing that with
// `new Date(string)` interprets it as UTC and then renders it in the
// viewer's local timezone, which rolls it back a day for anyone west of
// UTC (e.g. Feb 1 becomes Jan 31 for US timezones). Building the Date from
// the y/m/d components directly keeps it a local-time midnight instead, so
// no shift happens no matter the viewer's timezone.
const parseDateOnly = (dateString) => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Matches the format the browser's native <input type="date"> shows
// (WebDateInput / e.g. "February 1, 1985"), so the field doesn't visibly
// change format the moment you save.
const formatDateOnly = (dateString) => {
  const date = parseDateOnly(dateString);
  return date
    ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
};

export default function ProfileScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Edit Profile');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingBasics, setEditingBasics] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempBirthday, setTempBirthday] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0); // New state for carousel

  useEffect(() => {
    loadProfile();
  }, []);

  // ADD THIS FUNCTION - Profile completion calculation
  const calculateProfileCompletion = () => {
    let completionPercentage = 0;

    // Name - 15%
    if (profile?.name && profile.name.trim().length > 0) {
      completionPercentage += 15;
    }

    // Birthday - 10% (check both birthDate and birthdate)
    if (profile?.birthDate || profile?.birthdate) {
      completionPercentage += 10;
    }

    // About/Bio - 25%
    if (profile?.bio && profile.bio.trim().length > 0) {
      completionPercentage += 25;
    }

    // Upload a photo - 25%
    if (profile?.photos && profile.photos.length > 0) {
      completionPercentage += 25;
    }

    // Get verified - 25%
    if (profile?.isVerified) {
      completionPercentage += 25;
    }

    return completionPercentage;
  };

  const loadProfile = async () => {
  try {
    setLoading(true);
    const response = await api.get('/users/profile');
    
    if (response.data.success) {
      const profileData = response.data.data;
      
      // Sort photos to put primary photo first
      if (profileData.photos && profileData.photos.length > 0) {
        profileData.photos = profileData.photos.sort((a, b) => {
          if (a.isPrimary) return -1;
          if (b.isPrimary) return 1;
          return 0;
        });
      }
      
      setProfile(profileData);
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    Alert.alert('Error', 'Failed to load profile');
  } finally {
    setLoading(false);
  }
};

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', onPress: signOut, style: 'destructive' }
      ]
    );
  };

  const addPhoto = async () => {
  try {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    if (profile?.photos?.length >= 6) {
      Alert.alert('Maximum Photos', 'You can only have up to 6 photos. Delete one to add a new photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.3, // Very low quality for faster upload
    });

    if (!result.canceled) {
      setUploadingPhoto(true);
      
      try {
        const formData = new FormData();
        if (Platform.OS === 'web') {
          // Browsers require an actual Blob/File on FormData - the
          // {uri,type,name} object below is a React Native-only convention
          // that silently stringifies to "[object Object]" on web, so no
          // image bytes are ever sent.
          const fetchResponse = await fetch(result.assets[0].uri);
          const blob = await fetchResponse.blob();
          formData.append('photos', blob, 'profile_photo.jpg');
        } else {
          formData.append('photos', {
            uri: result.assets[0].uri,
            type: 'image/jpeg',
            name: 'profile_photo.jpg',
          });
        }

        const response = await api.post('/users/photos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000, // 60 seconds timeout
        });

        // Sort photos to put primary photo first
        const sortedPhotos = response.data.data.sort((a, b) => {
          if (a.isPrimary) return -1;
          if (b.isPrimary) return 1;
          return 0;
        });

        // Update profile with new photos array
        setProfile({ ...profile, photos: sortedPhotos });
        Alert.alert('Success', 'Photo uploaded successfully!');
      } catch (error) {
        console.error('Photo upload error:', error);
        if (error.code === 'ECONNABORTED') {
          Alert.alert('Upload Timeout', 'Photo upload timed out. Please try again.');
        } else {
          Alert.alert('Upload Error', 'Failed to upload photo. Please try again.');
        }
      } finally {
        setUploadingPhoto(false);
      }
    }
  } catch (error) {
    console.error('Error adding photo:', error);
    setUploadingPhoto(false);
  }
};

  // API update function
  const updateProfile = async (updateData) => {
    try {
      const response = await api.put('/users/profile', updateData);
      setProfile(response.data.data);
      return true;
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
      return false;
    }
  };

  const updatePhotoOrder = async (newPhotos) => {
  try {
    // Call API to set the first photo as primary
    if (newPhotos.length > 0) {
      const response = await api.put(`/users/photos/${newPhotos[0]._id}/primary`);
      
      // Update with the response data to ensure consistency
      if (response.data.success) {
        // Sort photos to put primary photo first
        const sortedPhotos = response.data.data.sort((a, b) => {
          if (a.isPrimary) return -1;
          if (b.isPrimary) return 1;
          return 0;
        });
        setProfile({ ...profile, photos: sortedPhotos });
      }
    }
    
    Alert.alert('Success', 'Main photo updated!');
  } catch (error) {
    console.error('Error updating photo order:', error);
    Alert.alert('Error', 'Failed to update photo order');
    // Revert to original state on error
    loadProfile();
  }
};

  const setMainPhoto = (photoIndex) => {
    if (photoIndex === 0) return; // Already main photo
    
    Alert.alert(
      'Set Main Photo',
      'Make this your main profile photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set as Main',
          onPress: () => {
            const newPhotos = [...(profile?.photos || [])];
            const [selectedPhoto] = newPhotos.splice(photoIndex, 1);
            newPhotos.unshift(selectedPhoto);
            updatePhotoOrder(newPhotos);
          }
        }
      ]
    );
  };

  const startEditingName = () => {
    setTempName(profile?.name || '');
    setEditingName(true);
  };

  const saveNameChanges = async () => {
    if (tempName.trim()) {
      const success = await updateProfile({ name: tempName.trim() });
      if (success) {
        setEditingName(false);
        Alert.alert('Success', 'Name updated!');
      }
    }
  };

  const cancelNameEdit = () => {
    setTempName('');
    setEditingName(false);
  };

  const startEditingBirthday = () => {
    // <input type="date"> (used on web) only accepts an exact
    // 'YYYY-MM-DD' string, but profile.birthDate comes back from the API
    // as a full ISO timestamp - trim it down.
    setTempBirthday(profile?.birthDate ? profile.birthDate.split('T')[0] : '');
    setEditingBirthday(true);
  };

  const saveBirthdayChanges = async () => {
    if (tempBirthday.trim()) {
      const success = await updateProfile({ birthDate: tempBirthday.trim() });
      if (success) {
        setEditingBirthday(false);
        Alert.alert('Success', 'Birthday updated!');
      }
    }
  };

  const cancelBirthdayEdit = () => {
    setTempBirthday('');
    setEditingBirthday(false);
  };

  const saveBioChanges = async () => {
    const success = await updateProfile({ bio: profile?.bio || '' });
    if (success) {
      setEditingBasics(false);
      Alert.alert('Success', 'Bio updated!');
    }
  };

  const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = parseDateOnly(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const deletePhoto = async (photoIndex) => {
  Alert.alert(
    'Delete Photo',
    'Are you sure you want to delete this photo?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const photoToDelete = profile?.photos?.[photoIndex];
            if (!photoToDelete) return;

            // Call API to delete photo
            const response = await api.delete(`/users/photos/${photoToDelete._id}`);
            
            if (response.data.success) {
              // Sort photos to put primary photo first
              const sortedPhotos = response.data.data.sort((a, b) => {
                if (a.isPrimary) return -1;
                if (b.isPrimary) return 1;
                return 0;
              });
              
              setProfile({ ...profile, photos: sortedPhotos });
              
              // Reset carousel index if needed
              if (currentPhotoIndex >= sortedPhotos.length && sortedPhotos.length > 0) {
                setCurrentPhotoIndex(sortedPhotos.length - 1);
              } else if (sortedPhotos.length === 0) {
                setCurrentPhotoIndex(0);
              }
              
              Alert.alert('Success', 'Photo deleted!');
            }
          } catch (error) {
            console.error('Error deleting photo:', error);
            Alert.alert('Error', 'Failed to delete photo');
          }
        }
      }
    ]
  );
};

  // Carousel navigation functions
  const nextPhoto = () => {
    const photos = profile?.photos || [];
    if (photos.length > 1) {
      setCurrentPhotoIndex((prevIndex) => 
        prevIndex === photos.length - 1 ? 0 : prevIndex + 1
      );
    }
  };

  const prevPhoto = () => {
    const photos = profile?.photos || [];
    if (photos.length > 1) {
      setCurrentPhotoIndex((prevIndex) => 
        prevIndex === 0 ? photos.length - 1 : prevIndex - 1
      );
    }
  };

  const renderTabBar = () => {
    const tabs = ['Edit Profile', 'Preview'];

    return (
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && styles.activeTab
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.tabText,
              activeTab === tab && styles.activeTabText
            ]}>
              {tab}
            </Text>
            {activeTab === tab && <View style={styles.activeTabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderPhotoGrid = () => {
  const photos = profile?.photos || [];

  const renderPhotoSlot = (index, slotStyle) => {
    const photo = photos[index];
    const isMainPhoto = index === 0;

    return (
      <TouchableOpacity
        key={index}
        style={slotStyle}
        onPress={() =>
          photo
            ? isMainPhoto
              ? deletePhoto(index)
              : setMainPhoto(index)
            : addPhoto()
        }
        disabled={uploadingPhoto}
      >
        {photo ? (
          <>
            <Image source={{ uri: photo.url }} style={styles.photo} />

            {!isMainPhoto && (
              <TouchableOpacity
                style={[styles.deleteButtonOverlay, { top: 8, left: 8 }]}
                onPress={() => setMainPhoto(index)}
              >
                <View style={styles.deleteButton}>
                  <Ionicons name="star-outline" size={16} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.deleteButtonOverlay}
              onPress={() => deletePhoto(index)}
            >
              <View style={styles.deleteButton}>
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.emptyPhoto}>
            {uploadingPhoto && index === photos.length ? (
              <ActivityIndicator color="#0078FF" />
            ) : (
              <Ionicons
                name="add"
                size={index === 0 ? 32 : 24}
                color="#666666"
              />
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.photoGridJuamo}>
      <View style={styles.topPhotoRow}>
        {renderPhotoSlot(0, styles.mainPhotoSlot)}
        <View style={styles.rightPhotoColumn}>
          {[1, 2].map((i) =>
            renderPhotoSlot(i, [
              styles.smallPhotoSlot,
              i === 2 && { marginBottom: 0 },
            ])
          )}
        </View>
      </View>
      <View style={styles.bottomPhotoRow}>
        {[3, 4, 5].map((i) =>
          renderPhotoSlot(i, [
            styles.bottomPhotoSlot,
            i === 5 && { marginRight: 0 },
          ])
        )}
      </View>
    </View>
  );
};

  const renderEditProfile = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Photo Grid - First thing under tabs */}
      <View style={styles.section}>
        {renderPhotoGrid()}
      </View>

      {/* Profile Completion - ONLY THESE LINES CHANGED */}
      <View style={styles.completionSection}>
        <View style={styles.completionHeader}>
          <Text style={styles.completionPercentage}>{calculateProfileCompletion()}%</Text>
          <Text style={styles.completionTitle}>Complete your profile</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${calculateProfileCompletion()}%` }]} />
        </View>
      </View>

      {/* Basic Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My basics</Text>
        
        {/* Name Field */}
        <View style={styles.editableInfoItem}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={20} color="#666666" />
            <View style={styles.inputContainer}>
              {editingName ? (
                <TextInput
                  style={styles.editableInput}
                  value={tempName}
                  onChangeText={setTempName}
                  placeholder="Enter your name"
                  placeholderTextColor="#666666"
                  autoFocus
                />
              ) : (
                <Text style={styles.fieldValue}>{profile?.name || 'Add name'}</Text>
              )}
            </View>
          </View>
          <View style={styles.editButtonContainer}>
            {editingName ? (
              <>
                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={saveNameChanges}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity 
                style={styles.editButton}
                onPress={startEditingName}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Birthday Field */}
        <View style={styles.editableInfoItem}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color="#666666" />
            <View style={styles.inputContainer}>
              {editingBirthday ? (
                Platform.OS === 'web' ? (
                  <WebDateInput
                    value={tempBirthday}
                    onChange={setTempBirthday}
                    max={toDateOnlyString(new Date())}
                  />
                ) : (
                  <TextInput
                    style={styles.fieldValue}
                    value={tempBirthday}
                    onChangeText={setTempBirthday}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#666666"
                    autoFocus
                  />
                )
              ) : (
                <Text style={styles.fieldValue}>
                  {profile?.birthDate ? formatDateOnly(profile.birthDate) : 'Add birthday'}
                </Text>
              )}
            </View>

          {/* @react-native-community/datetimepicker has no web implementation
              (no .web.js entry in the package - it silently does nothing when
              rendered there), so web falls back to the plain text field above
              instead of this native picker. */}
          {Platform.OS !== 'web' && showDatePicker && (
            <DateTimePicker
              value={
                tempBirthday
                  ? parseDateOnly(tempBirthday)
                  : profile?.birthDate
                  ? parseDateOnly(profile.birthDate)
                  : new Date()
              }
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  const isoDate = toDateOnlyString(selectedDate);
                  setTempBirthday(isoDate);
                  // Auto-save the birthday
                  updateProfile({ birthDate: isoDate }).then((success) => {
                    if (success) {
                      Alert.alert('Success', 'Birthday updated!');
                    }
                  });
                }
              }}
            />
          )}
        </View>

         <View style={styles.editButtonContainer}>
            {editingBirthday ? (
              <>
                <TouchableOpacity style={styles.editButton} onPress={cancelBirthdayEdit}>
                  <Text style={styles.editButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={saveBirthdayChanges}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => (Platform.OS === 'web' ? startEditingBirthday() : setShowDatePicker(true))}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Location Field */}
        <TouchableOpacity 
          style={styles.infoItem}
          onPress={() => Alert.alert('Edit Location', 'Location editing will be available soon')}
        >
          <Ionicons name="location-outline" size={20} color="#666666" />
          <Text style={styles.infoLabel}>Location</Text>
          <Text style={styles.infoValue}>{profile?.location?.address || 'Add location'}</Text>
        </TouchableOpacity>

        {/* About - Multi-line input */}
        <View style={styles.aboutSection}>
          <View style={styles.aboutHeader}>
            <Ionicons name="document-text-outline" size={20} color="#666666" />
            <Text style={styles.infoLabel}>About</Text>
            <TouchableOpacity 
              style={styles.editButton}
              onPress={() => {
                if (editingBasics) {
                  saveBioChanges();
                } else {
                  setEditingBasics(true);
                }
              }}
            >
              <Text style={styles.editButtonText}>
                {editingBasics ? 'Save' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[
              styles.aboutInput,
              !editingBasics && styles.aboutInputDisabled
            ]}
            value={profile?.bio || ''}
            onChangeText={(text) => setProfile({ ...profile, bio: text })}
            placeholder="Tell us about yourself..."
            placeholderTextColor="#666666"
            multiline
            numberOfLines={4}
            editable={editingBasics}
            textAlignVertical="top"
          />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#0078FF" />
          <Text style={styles.actionText}>Get Verified</Text>
          <Ionicons name="chevron-forward" size={16} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="star-outline" size={24} color="#FFD700" />
          <Text style={styles.actionText}>Upgrade to Premium</Text>
          <Ionicons name="chevron-forward" size={16} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="help-circle-outline" size={24} color="#666666" />
          <Text style={styles.actionText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={16} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.signOutButton]} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
          <Text style={[styles.actionText, styles.signOutText]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderPreview = () => {
  const photos = profile?.photos || [];
  const hasPhotos = photos.length > 0;

  // Calculate user's age if birthdate exists
  const calculateAge = () => {
    const birthDate = profile?.birthDate || profile?.birthdate;
    if (!birthDate) return null;
    const birth = parseDateOnly(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const userAge = calculateAge();

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Profile Card - Same style as EventCard organizer profile modal */}
      <View style={styles.previewCard}>
        {/* Photo Carousel */}
        <View style={styles.previewImageContainer}>
          {hasPhotos ? (
            <>
              <Image 
                source={{ uri: photos[currentPhotoIndex]?.url }} 
                style={styles.previewImage}
                resizeMode="cover"
              />
              
              {/* Navigation for multiple photos */}
              {photos.length > 1 && (
                <>
                  <TouchableOpacity 
                    style={styles.carouselNavLeft}
                    onPress={prevPhoto}
                  >
                    <Ionicons name="chevron-back" size={24} color="white" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.carouselNavRight}
                    onPress={nextPhoto}
                  >
                    <Ionicons name="chevron-forward" size={24} color="white" />
                  </TouchableOpacity>
                  
                  {/* Photo indicators */}
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

        {/* Profile Info */}
        <View style={styles.previewContent}>
          <Text style={styles.previewName}>
            {profile?.name || 'Your Name'}
          </Text>
          
          {userAge && (
            <Text style={styles.previewAge}>
              {userAge} years old
            </Text>
          )}
          
          {/* About Section */}
          {profile?.bio && (
            <View style={styles.aboutSection}>
              <Text style={styles.aboutTitle}>About</Text>
              <Text style={styles.previewBio}>
                {profile.bio}
              </Text>
            </View>
          )}
          
          {/* Stats */}
          <View style={styles.previewStats}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {profile?.eventsAttended || 0}
              </Text>
              <Text style={styles.statLabel}>Events Attended</Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {profile?.rating ? profile.rating.toFixed(1) : 'N/A'}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0078FF" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderTabBar()}
      {activeTab === 'Edit Profile' ? renderEditProfile() : renderPreview()}
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

  // Tab Bar Styles (matching CreateEventScreen)
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    marginBottom: 8
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666666',
  },
  activeTabText: {
    color: '#0078FF',
    fontWeight: '600',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#0078FF',
  },

  // Tab Content
  tabContent: {
    flex: 1,
  },

  // Section Styles
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#999999',
    lineHeight: 20,
    marginBottom: 16,
  },

  // Photo Grid - Fixed layout
  photoGrid: {
    height: 320,
    marginHorizontal: 20,
    position: 'relative',
  },
  photoContainer: {
    position: 'absolute',
    borderRadius: 12,
    overflow: 'hidden',
  },
  mainPhotoContainer: {
    top: 0,
    left: 0,
    width: '62%',
    height: '100%',
  },
  photo1Container: {
    top: 0,
    right: 0,
    width: '36%',
    height: '48%',
  },
  photo2Container: {
    top: '52%',
    right: 0,
    width: '36%',
    height: '48%',
  },
  photo3Container: {
    bottom: 0,
    left: 0,
    width: '29%',
    height: '48%',
  },
  photo4Container: {
    bottom: 0,
    left: '31%',
    width: '29%',
    height: '48%',
  },
  photo5Container: {
    bottom: 0,
    right: 0,
    width: '36%',
    height: '48%',
  },
  photoSlot: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  emptyPhoto: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333333',
    borderStyle: 'dashed',
  },
  starButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    padding: 4,
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.9)',
    borderRadius: 12,
    padding: 4,
  },

  // Completion Section
  completionSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  completionPercentage: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0078FF',
    marginRight: 12,
  },
  completionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#1A1A1A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0078FF',
  },

  // Info Items
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  infoLabel: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 12,
  },
  infoValue: {
    fontSize: 14,
    color: '#999999',
    marginRight: 8,
  },

  // Editable Info Items
  editableInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    justifyContent: 'space-between',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  inputContainer: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  fieldLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  editableInput: {
    fontSize: 16,
    color: '#FFFFFF',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editButtonContainer: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0078FF',
    borderRadius: 16,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#333333',
    borderRadius: 16,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0078FF',
    borderRadius: 16,
    marginLeft:6
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },

  // About Section with multi-line input
  aboutSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  aboutInput: {
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    minHeight: 100,
    marginLeft: 32, // Align with text after icon
  },
  aboutInputDisabled: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: '#999999',
  },

  // Actions Section
  actionsSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
    paddingBottom: 62, // Add this to push content above nav bar
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 12,
  },
  signOutButton: {
    borderBottomWidth: 0,
  },
  signOutText: {
    color: '#FF6B6B',
  },

  // Preview Styles (EventCard-like) with Carousel
  previewCard: {
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
  previewImageContainer: {
    position: 'relative',
    height: height * 0.6,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Carousel Navigation and Indicators
  carouselControls: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  carouselArrow: {
    padding: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#000000',
  },
  carouselIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
    marginHorizontal: 20,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E5E5',
    borderWidth: 1,
    borderColor: '#000000',
  },
  activeIndicator: {
    backgroundColor: '#E5E5E5',
    width: 24,
    borderWidth: 1,
    borderColor: '#000000',
  },

  previewContent: {
    padding: 20,
  },
  previewName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  nameBorder: {
    height: 1,
    backgroundColor: '#333333',
    marginBottom: 16,
    opacity: 0.5,
  },
  aboutMeSection: {
    marginBottom: 16,
  },
  aboutMeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  previewBio: {
    fontSize: 16,
    color: '#CCCCCC',
    lineHeight: 24,
  },
  previewLocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewLocation: {
    fontSize: 14,
    color: '#999999',
    marginLeft: 6,
  },

  // JUAMO LAYOUT STYLES
  photoGridJuamo: {
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  topPhotoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  mainPhotoSlot: {
    flex: 2,
    aspectRatio: 0.83,
    marginRight: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  rightPhotoColumn: {
    flex: 1,
    justifyContent: 'space-between',
  },
  smallPhotoSlot: {
    width: '100%',
    aspectRatio: .85,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  bottomPhotoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bottomPhotoSlot: {
    width: '32%',
    aspectRatio: .85,
    marginRight: '2%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  deleteButtonOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  deleteButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
   previewCard: {
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
  previewImageContainer: {
    position: 'relative',
    height: height * 0.6,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0078FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderAvatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
  },
  
  // Carousel Navigation
  carouselNavLeft: {
    position: 'absolute',
    left: 16,
    bottom: 10,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselNavRight: {
    position: 'absolute',
    right: 16,
    bottom: 10,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselIndicators: {
    position: 'absolute',
    bottom: 20,
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
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  activeCarouselIndicator: {
    backgroundColor: 'white',
    width: 20,
  },
  
  // Profile Content
  previewContent: {
    padding: 20,
  },
  previewName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  previewAge: {
    fontSize: 16,
    color: '#C7C4C4',
    marginBottom: 12,
  },
  aboutSection: {
    marginBottom: 20,
  },
  aboutTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  previewBio: {
    fontSize: 16,
    color: '#E8E8E8',
    lineHeight: 24,
  },
  previewStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0078FF',
  },
  statLabel: {
    fontSize: 12,
    color: '#C7C4C4',
    marginTop: 4,
  },
});