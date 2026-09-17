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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import DateTimeInput from '../../components/DateTimeInput';
import AddressAutocompleteInput from '../../components/AddressAutocompleteInput';
import { toDateOnlyString, parseDateOnly } from '../../utils/dateOnly';

const { width, height } = Dimensions.get('window');

// Deliberately no weekday - see DateTimeInput's own formatDateTime,
// which drops it for mode="date" too; this is just the closed-state
// display shown before Edit is tapped.
const formatBirthday = (dateString) => {
  const date = parseDateOnly(dateString);
  return date
    ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
};

export default function ProfileScreen({ navigation }) {
  const { user, signOut, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Edit Profile');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingBasics, setEditingBasics] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempLocationText, setTempLocationText] = useState('');
  const [tempLocationPlace, setTempLocationPlace] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [deviceBiasLocation, setDeviceBiasLocation] = useState(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0); // New state for carousel
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

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

  const handleDeleteAccount = () => {
    setDeleteConfirmText('');
    setShowDeleteConfirm(true);
  };

  const confirmDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      await api.delete('/users/me');
      signOut();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to delete account');
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
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

  // No real verification check yet - this just flips the flag. Gates
  // creating a public event/group and using private (1:1) chats (see
  // requireVerified middleware / POST /events isPublic check).
  const handleGetVerified = async () => {
    try {
      const response = await api.post('/users/verify');
      setProfile(response.data.data);
      // Merge rather than replace - the AuthContext user object uses a
      // different, narrower shape (id vs _id, etc) than the full profile
      // doc this endpoint returns, and other screens rely on those
      // existing fields staying intact.
      updateUser({ ...user, isVerified: true });
      Alert.alert('Verified', "You're verified! Public events/groups and private chats are now unlocked.");
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to verify');
    }
  };

  // No payment processor hooked up yet - this is the whole "subscribe"
  // flow for now, a one-time 7-day trial. Gates premium-only swipe
  // features (unlimited super-likes/rewinds - see the premium
  // middleware and User.canSuperLike/canRewind).
  const handleStartPremiumTrial = () => {
    Alert.alert(
      'Start Free Trial',
      "Try Premium free for 7 days - unlimited super-likes and rewinds. You can only claim this once.",
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Start Trial',
          onPress: async () => {
            try {
              const response = await api.post('/users/premium-trial');
              setProfile(response.data.data);
              updateUser({
                ...user,
                isPremium: true,
                premiumExpiresAt: response.data.data.premiumExpiresAt,
                premiumTrialUsedAt: response.data.data.premiumTrialUsedAt
              });
              Alert.alert('Premium Activated', "You're on a 7-day free trial!");
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to start trial');
            }
          }
        }
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Error', 'Please fill in both fields');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword });
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Success', 'Password changed!');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
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

  const saveBirthdayChanges = async (date) => {
    const success = await updateProfile({ birthDate: toDateOnlyString(date) });
    if (success) {
      Alert.alert('Success', 'Birthday updated!');
    }
  };

  const saveBioChanges = async () => {
    const success = await updateProfile({ bio: profile?.bio || '' });
    if (success) {
      setEditingBasics(false);
      Alert.alert('Success', 'Bio updated!');
    }
  };

  const startEditingLocation = () => {
    setTempLocationText(profile?.location?.address || '');
    setTempLocationPlace(null);
    setEditingLocation(true);

    // Bias search results toward the device's current position, not just
    // whatever's already saved - the common case is someone setting their
    // location for the FIRST time, when there's nothing saved yet to bias
    // against at all.
    if (!deviceBiasLocation) {
      Location.requestForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status !== 'granted') return null;
          return Location.getCurrentPositionAsync({});
        })
        .then((location) => {
          if (!location) return;
          setDeviceBiasLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        })
        .catch(() => {});
    }
  };

  const cancelLocationEdit = () => {
    setTempLocationText('');
    setTempLocationPlace(null);
    setEditingLocation(false);
  };

  const saveLocationChanges = async () => {
    if (!tempLocationPlace) {
      Alert.alert('Pick a Suggestion', 'Choose an address from the dropdown so we have real coordinates for it.');
      return;
    }
    setSavingLocation(true);
    const success = await updateProfile({
      location: {
        coordinates: tempLocationPlace.coordinates,
        address: tempLocationPlace.address,
        city: tempLocationPlace.city,
        state: tempLocationPlace.state,
      }
    });
    setSavingLocation(false);
    if (success) {
      setEditingLocation(false);
      Alert.alert('Success', 'Location updated!');
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
    <>
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
      <View style={[styles.section, { marginBottom: 0 }]}>
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
              <TouchableOpacity style={styles.saveButton} onPress={saveNameChanges}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.editButton} onPress={startEditingName}>
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Birthday Field - matches Name/Location: plain text + Edit
            button until tapped. DateTimeInput renders in controlled
            mode here (visible/onRequestClose), so it shows no field
            button of its own - tapping Edit brings the calendar up as
            an overlay, and Cancel/Done both close it back down via
            onRequestClose. */}
        <View style={styles.editableInfoItem}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color="#666666" />
            <View style={styles.inputContainer}>
              <Text style={styles.fieldValue}>
                {profile?.birthDate ? formatBirthday(profile.birthDate) : 'Add birthday'}
              </Text>
            </View>
          </View>
          <View style={styles.editButtonContainer}>
            <TouchableOpacity style={styles.editButton} onPress={() => setEditingBirthday(true)}>
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <DateTimeInput
            mode="date"
            value={profile?.birthDate ? parseDateOnly(profile.birthDate) : null}
            onChange={saveBirthdayChanges}
            maximumDate={new Date()}
            visible={editingBirthday}
            onRequestClose={() => setEditingBirthday(false)}
          />
        </View>

        {/* Location Field - same header-then-full-width-content layout as
            About, so the search box/results sit on their own line below
            the label instead of squeezed into the row next to Cancel/Save. */}
        <View style={styles.aboutSection}>
          <View style={styles.aboutHeader}>
            <Ionicons name="location-outline" size={20} color="#666666" />
            <Text style={styles.infoLabel}>Location</Text>
            {editingLocation ? (
              <View style={styles.editButtonContainer}>
                <TouchableOpacity style={styles.editButton} onPress={cancelLocationEdit}>
                  <Text style={styles.editButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={saveLocationChanges} disabled={savingLocation}>
                  {savingLocation ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.editButton} onPress={startEditingLocation}>
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          {editingLocation ? (
            <View style={styles.locationSearchWrapper}>
              <AddressAutocompleteInput
                value={tempLocationText}
                placeholder="Search a city or address"
                onChangeText={setTempLocationText}
                onSelectPlace={(place) => {
                  setTempLocationText(place.address);
                  setTempLocationPlace(place);
                }}
                showIcon={false}
                biasLocation={deviceBiasLocation || (profile?.location?.coordinates ? {
                  latitude: profile.location.coordinates[1],
                  longitude: profile.location.coordinates[0],
                } : null)}
              />
            </View>
          ) : (
            <Text style={[styles.fieldValue, styles.locationValue]}>
              {profile?.location?.address || 'Add location'}
            </Text>
          )}
        </View>

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
        {/* Verification - one-way action, so once verified it's a plain
            (non-tappable) row like Premium's active state, not a button. */}
        {profile?.isVerified ? (
          <View style={styles.actionButton}>
            <Ionicons name="shield-checkmark" size={24} color="#0078FF" />
            <Text style={styles.actionText}>Verified</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.actionButton} onPress={handleGetVerified}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#0078FF" />
            <Text style={styles.actionText}>Get Verified</Text>
            <Ionicons name="chevron-forward" size={16} color="#666666" />
          </TouchableOpacity>
        )}

        {profile?.isPremium ? (
          <View style={styles.actionButton}>
            <Ionicons name="star" size={24} color="#FFD700" />
            <Text style={styles.actionText}>
              Premium active{profile?.premiumExpiresAt ? ` until ${new Date(profile.premiumExpiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleStartPremiumTrial}
            disabled={!!profile?.premiumTrialUsedAt}
          >
            <Ionicons name="star-outline" size={24} color="#FFD700" />
            <Text style={styles.actionText}>
              {profile?.premiumTrialUsedAt ? 'Free trial already used' : 'Start Premium Free Trial'}
            </Text>
            {!profile?.premiumTrialUsedAt && (
              <Ionicons name="chevron-forward" size={16} color="#666666" />
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('HowToUse')}>
          <Ionicons name="help-circle-outline" size={24} color="#666666" />
          <Text style={styles.actionText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={16} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={() => setShowChangePassword(true)}>
          <Ionicons name="lock-closed-outline" size={24} color="#666666" />
          <Text style={styles.actionText}>Change Password</Text>
          <Ionicons name="chevron-forward" size={16} color="#666666" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={24} color="#666666" />
          <Text style={styles.actionText}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.lastActionButton]} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={24} color="#FF0F0F" />
          <Text style={[styles.actionText, { color: '#FF0F0F' }]}>Delete Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

    <Modal visible={showChangePassword} transparent animationType="fade" onRequestClose={() => setShowChangePassword(false)}>
      <View style={styles.passwordModalOverlay}>
        <View style={styles.passwordModalSheet}>
          <Text style={styles.passwordModalTitle}>Change Password</Text>

          <TextInput
            style={styles.passwordModalInput}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            placeholderTextColor="#666666"
            secureTextEntry
          />
          <TextInput
            style={styles.passwordModalInput}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password (min. 6 characters)"
            placeholderTextColor="#666666"
            secureTextEntry
          />

          <View style={styles.passwordModalButtons}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                setShowChangePassword(false);
                setCurrentPassword('');
                setNewPassword('');
              }}
            >
              <Text style={styles.editButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
      <View style={styles.passwordModalOverlay}>
        <View style={styles.passwordModalSheet}>
          <Text style={styles.passwordModalTitle}>Delete Account</Text>
          <Text style={styles.deleteConfirmText}>
            This permanently deletes your profile, photos, and connections. Events/groups you
            co-own stay open with the other owner(s); ones you solely own get cancelled. This can't be undone.
          </Text>
          <Text style={styles.deleteConfirmLabel}>Type DELETE to confirm</Text>
          <TextInput
            style={styles.passwordModalInput}
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            placeholder="DELETE"
            placeholderTextColor="#666666"
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <View style={styles.passwordModalButtons}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmText('');
              }}
            >
              <Text style={styles.editButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.deleteConfirmButton,
                deleteConfirmText.trim().toUpperCase() !== 'DELETE' && styles.deleteConfirmButtonDisabled
              ]}
              onPress={confirmDeleteAccount}
              disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || deletingAccount}
            >
              {deletingAccount ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Delete Forever</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
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
          <View style={styles.verifiedRow}>
            <Text style={styles.previewName}>
              {profile?.name || 'Your Name'}
            </Text>
            {profile?.isVerified && (
              <Ionicons name="checkmark-circle" size={18} color="#0078FF" />
            )}
            {profile?.isPremium && (
              <Ionicons name="star" size={18} color="#FFD700" />
            )}
          </View>

          {userAge && (
            <Text style={styles.previewAge}>
              {userAge} years old
            </Text>
          )}
          
          {/* About Section */}
          {profile?.bio && (
            <View style={styles.previewAboutSection}>
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
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  locationSearchWrapper: {
    marginLeft: 32, // Align with the About box below it
  },
  locationValue: {
    marginLeft: 32,
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
  lastActionButton: {
    borderBottomWidth: 0,
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
  previewAboutSection: {
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

  // Change Password Modal
  passwordModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  passwordModalSheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#111111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    padding: 20,
  },
  passwordModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  passwordModalInput: {
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  passwordModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  deleteConfirmText: {
    color: '#C7C4C4',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  deleteConfirmLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  deleteConfirmButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FF3B30',
    borderRadius: 16,
  },
  deleteConfirmButtonDisabled: {
    backgroundColor: '#5C2A26',
  },
});
