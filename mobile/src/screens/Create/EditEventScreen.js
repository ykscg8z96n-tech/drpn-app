// mobile/src/screens/Create/EditEventScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import WebDateInput, { toDateOnlyString } from '../../components/WebDateInput';
import SelectModal from '../../components/SelectModal';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { uploadEventPhoto } from '../../utils/uploadEventPhoto';

// 6 mutually exclusive categories - REMOVED INTERESTS COMPLETELY
const CATEGORIES = [
  { id: 'tabletop', name: 'Table Top', icon: 'cube-outline', color: '#8B4513' },
  { id: 'cards', name: 'Cards', icon: 'albums-outline', color: '#DC143C' },
  { id: 'fantasy', name: 'Fantasy', icon: 'trophy-outline', color: '#FFD700' },
  { id: 'sports', name: 'Sports', icon: 'basketball-outline', color: '#FF6B35' },
  { id: 'golf', name: 'Golf', icon: 'golf-outline', color: '#228B22' },
  { id: 'health', name: 'Health', icon: 'body-outline', color: '#9370DB' }
];

// Stock images for each category - Add these files to mobile/assets/stock-images/
const STOCK_IMAGES = {
  tabletop: require('../../../assets/stock-images/tabletop-stock.jpg'),
  cards: require('../../../assets/stock-images/cards-stock.jpg'),
  fantasy: require('../../../assets/stock-images/fantasy-stock.jpg'),
  sports: require('../../../assets/stock-images/sports-stock.jpg'),
  golf: require('../../../assets/stock-images/golf-stock.jpg'),
  health: require('../../../assets/stock-images/health-stock.jpg'),
};

export default function EditEventScreen({ route, navigation }) {
  const { event } = route.params; // Get the event to edit
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [location, setLocation] = useState(null);

  const [myGroups, setMyGroups] = useState([]);
  const [selectedGroupForInvite, setSelectedGroupForInvite] = useState('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

 const [formData, setFormData] = useState({
   name: event.name || '',
   description: event.description || '',
   location: {
     address: event.location?.address || '',
     fullAddress: event.location?.fullAddress || event.location?.address || '',
     city: event.location?.city || '',
     state: event.location?.state || '',
    coordinates: event.location?.coordinates || [0, 0],
   },
   category: event.category || '',                                     // primary category (always categories[0])
   categories: event.categories?.length ? event.categories : (event.category ? [event.category] : []),
   capacity:   event.type === 'event' ? (event.capacity?.toString() || '') : undefined,    // only for events
   eventDate:  event.type === 'event' ? new Date(event.eventDate) : undefined,
   groupSize:  event.type === 'group' ? (event.groupSize?.toString() || '') : undefined,    // only for groups
   meetingFrequency: event.type === 'group' ? (event.meetingFrequency || '') : undefined,
   isRecurring:       event.isRecurring || false,
   recurringPattern:  event.recurringPattern || 'weekly',
   isPublic:          event.isPublic !== undefined ? event.isPublic : true,
   type: event.type,  // same as type: type
  });

  const pickImage = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9], // Good aspect ratio for event cards
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
  };

  const getDisplayImage = () => {
    if (selectedImage) {
      return { uri: selectedImage };
    }
    // If event has existing image, show it
    if (event.photos && event.photos.length > 0) {
      return { uri: event.photos[0] };
    }
    if (formData.category && STOCK_IMAGES[formData.category]) {
      return STOCK_IMAGES[formData.category];
    }
    // Default to tabletop if no category selected
    return STOCK_IMAGES.tabletop;
  };

  useEffect(() => {
    getCurrentLocationCoordinates();
    loadMyGroups();
  }, []);

  const loadMyGroups = async () => {
    try {
      const response = await api.get('/events/organizer/my-events');
      const groups = response.data.data.filter(eventItem => 
        eventItem.type === 'group' && 
        !eventItem.isArchived &&
        eventItem._id !== event._id // Exclude current event
      );
      setMyGroups(groups);
    } catch (error) {
      console.error('Error loading groups:', error);
      setMyGroups([]);
    }
  };

  const getCurrentLocationCoordinates = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setLocation(location);
      
      setFormData(prev => ({
        ...prev,
        location: {
          ...prev.location,
          coordinates: [location.coords.longitude, location.coords.latitude]
        }
      }));
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    if (!formData.description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }
    if (!formData.category) {
      Alert.alert('Error', 'Please select a category');
      return;
    }
    if (!formData.location.fullAddress && !formData.location.address) {
      Alert.alert('Error', 'Please set a location');
      return;
    }

    if (event.type === 'event') {
      if (!formData.capacity) {
        Alert.alert('Error', 'Please enter event capacity');
        return;
      }
      if (!formData.eventDate) {
        Alert.alert('Error', 'Please select an event date');
        return;
      }
    } else {
      if (!formData.groupSize) {
        Alert.alert('Error', 'Please enter group size');
        return;
      }
      if (!formData.meetingFrequency) {
        Alert.alert('Error', 'Please select meeting frequency');
        return;
      }
    }

    try {
      setSubmitting(true);
      
      const response = await api.put(`/events/${event._id}`, {
        ...formData,
        capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
        groupSize: formData.groupSize ? parseInt(formData.groupSize) : undefined,
        inviteGroupId: selectedGroupForInvite || undefined, // Send group ID for auto-invites
      });

      // Same as on create - a custom photo needs a real multipart upload,
      // it can't ride along in this JSON body.
      if (selectedImage) {
        try {
          await uploadEventPhoto(event._id, selectedImage);
        } catch (photoError) {
          console.error('Error uploading event photo:', photoError);
        }
      }

      Alert.alert('Success', `${event.type === 'event' ? 'Event' : 'Group'} updated successfully!`, [
        { 
          text: 'OK', 
          onPress: () => navigation.goBack()
        }
      ]);
    } catch (error) {
      console.error('Error updating:', error);
      Alert.alert('Error', error.response?.data?.message || `Failed to update ${event.type}`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategory = (id) => {
    if (event.type === 'group') {
      // Groups can belong to more than one category.
      setFormData(prev => {
        const current = prev.categories || [];
        const next = current.includes(id)
          ? current.filter(c => c !== id)
          : [...current, id];
        return { ...prev, categories: next, category: next[0] || '' };
      });
    } else {
      // Events stay single-category.
      setFormData(prev => ({ ...prev, category: id, categories: [id] }));
    }
  };

  const renderCategories = () => (
    <View style={styles.categoryContainer}>
      {CATEGORIES.map((category) => {
        const isActive = event.type === 'group'
          ? formData.categories.includes(category.id)
          : formData.category === category.id;
        return (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryTag,
              { borderColor: category.color },
              isActive && {
                backgroundColor: category.color,
                borderColor: category.color
              }
            ]}
            onPress={() => toggleCategory(category.id)}
          >
            <Ionicons
              name={category.icon}
              size={16}
              color={isActive ? '#FFFFFF' : category.color}
              style={{ marginRight: 6 }}
            />
            <Text style={[
              styles.categoryTagText,
              isActive && styles.categoryTagTextActive
            ]}>
              {category.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 20}
    >
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          {/* NAME FIELD - DISABLED */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={formData.name}
              editable={false}
              placeholder={`${event.type} name`}
              placeholderTextColor="#666"
            />
            <Text style={styles.disabledNote}>
              Event names cannot be edited after creation
            </Text>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.description}
              onChangeText={(text) => setFormData({ ...formData, description: text })}
              placeholder={`Describe your ${event.type}`}
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Event Photo Picker */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Event Photo</Text>
            <Text style={styles.helperText}>
              Add a photo or we'll use a default image based on your category
            </Text>
            
            <View style={styles.photoContainer}>
              <View style={styles.photoPreview}>
                <Image 
                  source={getDisplayImage()} 
                  style={styles.photoImage}
                  resizeMode="cover"
                />
                {selectedImage && (
                  <TouchableOpacity 
                    style={styles.removePhotoButton}
                    onPress={removeImage}
                  >
                    <Ionicons name="close-circle" size={24} color="#FF4444" />
                  </TouchableOpacity>
                )}
              </View>
              
              <View style={styles.photoActions}>
                <TouchableOpacity 
                  style={styles.photoButton}
                  onPress={pickImage}
                >
                  <Ionicons name="camera" size={20} color="#0078FF" />
                  <Text style={styles.photoButtonText}>
                    {selectedImage ? 'Change Photo' : 'Add Photo'}
                  </Text>
                </TouchableOpacity>
                
                {selectedImage && (
                  <TouchableOpacity 
                    style={styles.photoButtonSecondary}
                    onPress={removeImage}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF4444" />
                    <Text style={styles.photoButtonSecondaryText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.helperText}>
              Enter the full address for your {event.type}. Only city and state will be shown publicly.
            </Text>
            
            <View style={styles.addressInputContainer}>
              <Ionicons name="location-outline" size={20} color="#0078FF" />
              <TextInput
                style={styles.addressInput}
                value={formData.location.fullAddress || formData.location.address}
                onChangeText={(text) => {
                  // Extract city and state from full address if possible
                  const parts = text.split(',').map(p => p.trim());
                  let city = '', state = '';
                  
                  if (parts.length >= 2) {
                    // Try to identify city and state from the address
                    const lastPart = parts[parts.length - 1];
                    const secondLastPart = parts[parts.length - 2];
                    
                    // If last part looks like a state/province (2-3 characters)
                    if (lastPart.length <= 3) {
                      state = lastPart;
                      city = secondLastPart;
                    } else {
                      city = lastPart;
                    }
                  }
                  
                  setFormData({ 
                    ...formData, 
                    location: { 
                      ...formData.location, 
                      fullAddress: text,
                      address: city && state ? `${city}, ${state}` : text,
                      city: city,
                      state: state
                    }
                  });
                }}
                placeholder="Enter full address (e.g., 123 Main St, Toronto, ON)"
                placeholderTextColor="#666"
              />
            </View>
            
            {formData.location.city && formData.location.state && (
              <View style={styles.locationPreview}>
                <Ionicons name="eye-outline" size={16} color="#0078FF" />
                <Text style={styles.locationPreviewText}>
                  Public will see: {formData.location.city}, {formData.location.state}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Category</Text>
            {event.type === 'group' && (
              <Text style={styles.helperText}>Select one or more categories</Text>
            )}
            {renderCategories()}
          </View>

          {event.type === 'event' && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Event Date</Text>
                <View style={styles.datePickerWrapper}>
                  {Platform.OS === 'web' ? (
                    <WebDateInput
                      value={toDateOnlyString(formData.eventDate)}
                      onChange={(dateString) => {
                        if (dateString) {
                          setFormData({ ...formData, eventDate: new Date(`${dateString}T00:00:00`) });
                        }
                      }}
                    />
                  ) : Platform.OS === 'ios' ? (
                    <DateTimePicker
                      value={formData.eventDate}
                      mode="date"
                      display="compact"
                      onChange={(event, selectedDate) => {
                        if (selectedDate && event.type !== 'dismissed') {
                          setFormData({ ...formData, eventDate: selectedDate });
                        }
                      }}
                      minimumDate={new Date()}
                      style={styles.inlineDatePicker}
                      themeVariant="dark"
                    />
                  ) : (
                    // Android: Use TouchableOpacity with better styling
                    <TouchableOpacity
                      style={styles.androidDateButton}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <View style={styles.dateDisplayContainer}>
                        <Ionicons name="calendar" size={24} color="#0078FF" />
                        <View style={styles.dateTextContainer}>
                          <Text style={styles.dateDisplayText}>
                            {formData.eventDate.toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </Text>
                          <Text style={styles.dateDisplayDay}>
                            {formData.eventDate.toLocaleDateString('en-US', {
                              weekday: 'long'
                            })}
                          </Text>
                        </View>
                        <Ionicons name="chevron-down" size={20} color="#999999" />
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Capacity</Text>
                <TextInput
                  style={styles.input}
                  value={formData.capacity}
                  onChangeText={(text) => setFormData({ ...formData, capacity: text })}
                  placeholder="How many people?"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
              </View>
            </>
          )}

          {event.type === 'group' && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Group Size</Text>
                <TextInput
                  style={styles.input}
                  value={formData.groupSize}
                  onChangeText={(text) => setFormData({ ...formData, groupSize: text })}
                  placeholder="Ideal number of members"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Meeting Frequency</Text>
                <View style={styles.frequencyContainer}>
                  {['weekly', 'biweekly', 'monthly', 'varies'].map((freq) => (
                    <TouchableOpacity
                      key={freq}
                      style={[
                        styles.frequencyButton,
                        formData.meetingFrequency === freq && styles.frequencyButtonActive
                      ]}
                      onPress={() => setFormData({ ...formData, meetingFrequency: freq })}
                    >
                      <Text style={[
                        styles.frequencyButtonText,
                        formData.meetingFrequency === freq && styles.frequencyButtonTextActive
                      ]}>
                        {freq === 'biweekly' ? 'Bi-weekly' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* Auto-invite existing group members - Only show for EVENTS */}
          {event.type === 'event' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Auto-invite Group Members</Text>
              <Text style={styles.helperText}>
                Automatically send invites to members of one of your existing groups
              </Text>
              
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={[
                    styles.dropdown,
                    myGroups.length === 0 && styles.dropdownDisabled
                  ]}
                  disabled={myGroups.length === 0}
                  onPress={() => setShowGroupPicker(true)}
                >
                  <Ionicons 
                    name="people-outline" 
                    size={20} 
                    color={myGroups.length === 0 ? "#666666" : "#0078FF"} 
                  />
                  <Text style={[
                    styles.dropdownText,
                    myGroups.length === 0 && styles.dropdownTextDisabled
                  ]}>
                    {selectedGroupForInvite 
                      ? myGroups.find(g => g._id === selectedGroupForInvite)?.name 
                      : myGroups.length === 0 
                        ? 'No groups available' 
                        : 'Select a group...'
                    }
                  </Text>
                  <Ionicons 
                    name="chevron-down" 
                    size={20} 
                    color={myGroups.length === 0 ? "#666666" : "#999999"} 
                  />
                </TouchableOpacity>
              </View>
              
              {myGroups.length === 0 && (
                <Text style={styles.disabledText}>
                  Create a group first to use auto-invites
                </Text>
              )}
              
              {selectedGroupForInvite && (
                <View style={styles.selectedGroupInfo}>
                  <Ionicons name="checkmark-circle" size={16} color="#00B000" />
                  <Text style={styles.selectedGroupText}>
                    Will auto-invite {myGroups.find(g => g._id === selectedGroupForInvite)?.participants?.length || 0} group members
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Privacy/Visibility Options */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Visibility</Text>
            <Text style={styles.helperText}>
              {event.type === 'event' 
                ? 'Make your event discoverable by others or keep it private with invite codes'
                : 'Make your group discoverable by others or keep it private with invite codes'
              }
            </Text>
            
            <View style={styles.visibilityContainer}>
              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  formData.isPublic && styles.visibilityOptionActive
                ]}
                onPress={() => setFormData({ ...formData, isPublic: true })}
              >
                <View style={styles.radioButton}>
                  {formData.isPublic && <View style={styles.radioButtonInner} />}
                </View>
                <View style={styles.visibilityInfo}>
                  <Text style={[
                    styles.visibilityTitle,
                    formData.isPublic && styles.visibilityTitleActive
                  ]}>
                    Public
                  </Text>
                  <Text style={styles.visibilityDescription}>
                    Anyone can discover and join your {event.type}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.visibilityOption,
                  !formData.isPublic && styles.visibilityOptionActive
                ]}
                onPress={() => setFormData({ ...formData, isPublic: false })}
              >
                <View style={styles.radioButton}>
                  {!formData.isPublic && <View style={styles.radioButtonInner} />}
                </View>
                <View style={styles.visibilityInfo}>
                  <Text style={[
                    styles.visibilityTitle,
                    !formData.isPublic && styles.visibilityTitleActive
                  ]}>
                    Private
                  </Text>
                  <Text style={styles.visibilityDescription}>
                    Only people with invite codes can join
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Privacy Notice - Updated */}
          <View style={styles.privacyNotice}>
            <Ionicons name="lock-closed" size={16} color="#0078FF" />
            <Text style={styles.privacyText}>
              {formData.isPublic 
                ? (event.type === 'group' 
                    ? 'This group will be visible to all users in your area.' 
                    : 'This event will be visible to all users in your area.')
                : (event.type === 'group' 
                    ? 'This group will be private. Only people with invite codes can join.' 
                    : 'This event will be private. Only people with invite codes can join.')
              }
            </Text>
          </View>

          {/* Submit Button - Inside ScrollView for now */}
          <View style={styles.submitContainer}>
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={24} color="white" />
                  <Text style={styles.submitButtonText}>
                    Update {event.type === 'event' ? 'Event' : 'Group'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Extra spacing to ensure button is fully visible */}
          <View style={{ height: 50 }} />
        </View>
      </ScrollView>

      <SelectModal
        visible={showGroupPicker}
        title="Choose a group to auto-invite members from:"
        options={[
          { label: 'None - No auto-invites', value: '' },
          ...myGroups.map(g => ({ label: g.name, value: g._id }))
        ]}
        onSelect={setSelectedGroupForInvite}
        onClose={() => setShowGroupPicker(false)}
      />

      {/* Date Picker Modal - For Android */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={formData.eventDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate && event.type !== 'dismissed') {
              setFormData({ ...formData, eventDate: selectedDate });
            }
          }}
          minimumDate={new Date()}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // More space at bottom
  },
  form: {
    padding: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#666666',
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  inputDisabled: {
    backgroundColor: '#0A0A0A',
    borderColor: '#333333',
    color: '#666666',
  },
  disabledNote: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 14,
    color: '#999999',
    marginBottom: 12,
  },
  
  // Address Input Styles
  addressInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#666666',
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  addressInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  
  // Date Picker Styles - Platform Specific
  datePickerWrapper: {
    backgroundColor: '#111111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666666',
    overflow: 'hidden',
  },
  inlineDatePicker: {
    backgroundColor: '#111111',
    width: '100%',
    height: 50,
  },
  
  // Android Date Button Styles
  androidDateButton: {
    padding: 0,
  },
  dateDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  dateTextContainer: {
    flex: 1,
  },
  dateDisplayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  dateDisplayDay: {
    fontSize: 14,
    color: '#999999',
  },

  // Photo Picker Styles
  photoContainer: {
    marginTop: 8,
  },
  photoPreview: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  photoImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#1A1A1A',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#0078FF',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  photoButtonText: {
    color: '#0078FF',
    fontSize: 16,
    fontWeight: '500',
  },
  photoButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#FF4444',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  photoButtonSecondaryText: {
    color: '#FF4444',
    fontSize: 16,
    fontWeight: '500',
  },
  
  // Category Styles
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#666666',
    marginBottom: 8,
  },
  categoryTagActive: {
    backgroundColor: '#8B4513', // This will be overridden by inline style
    borderColor: '#8B4513', // This will be overridden by inline style
  },
  categoryTagText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  categoryTagTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  
  // Frequency buttons
  frequencyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#333333',
    borderWidth: 1,
    borderColor: '#666666',
  },
  frequencyButtonActive: {
    backgroundColor: '#0078FF',
    borderColor: '#0078FF',
  },
  frequencyButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  frequencyButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  
  // Privacy Notice
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0A1A2E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E3A5F',
    gap: 8,
  },
  privacyText: {
    flex: 1,
    fontSize: 14,
    color: '#CCE4FF',
    lineHeight: 20,
  },

  // Visibility Options
  visibilityContainer: {
    gap: 12,
    marginTop: 8,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#333333',
    gap: 12,
  },
  visibilityOptionActive: {
    borderColor: '#0078FF',
    backgroundColor: '#0A1A2E',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#666666',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0078FF',
  },
  visibilityInfo: {
    flex: 1,
  },
  visibilityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  visibilityTitleActive: {
    color: '#0078FF',
  },
  visibilityDescription: {
    fontSize: 14,
    color: '#999999',
    lineHeight: 18,
  },

  // Group Dropdown Styles
  dropdownContainer: {
    marginTop: 8,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#666666',
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dropdownDisabled: {
    backgroundColor: '#0A0A0A',
    borderColor: '#333333',
  },
  dropdownText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  dropdownTextDisabled: {
    color: '#666666',
  },
  disabledText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  selectedGroupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  selectedGroupText: {
    fontSize: 14,
    color: '#00B000',
    fontWeight: '500',
  },

  // Location Preview
  locationPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#0A1A2E',
    borderRadius: 6,
    gap: 8,
  },
  locationPreviewText: {
    fontSize: 14,
    color: '#0078FF',
    fontStyle: 'italic',
  },
  
  // Submit Button
  submitContainer: {
    padding: 20,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0078FF',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#333333',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});