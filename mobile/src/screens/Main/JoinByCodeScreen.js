// mobile/src/screens/Main/JoinByCodeScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function JoinByCodeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [inviteCode, setInviteCode] = useState(route.params?.code?.toUpperCase() || '');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  // A shared "…/join/ABC123" link (see App.js linking config) lands here
  // with the code as a route param - pre-fill it so the person just has
  // to tap Join instead of retyping what was already in the link.
  useEffect(() => {
    if (route.params?.code) {
      setInviteCode(route.params.code.toUpperCase());
    }
  }, [route.params?.code]);

  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Please enter an invite code');
      return;
    }

    if (inviteCode.trim().length < 6) {
      Alert.alert('Error', 'Invite code must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post(`/events/join/${inviteCode.trim().toUpperCase()}`);

      if (response.data.success) {
        Alert.alert(
          'Success!',
          `You've successfully joined "${response.data.data.eventName}"! Check your matches to start chatting.`,
          [
            {
              text: 'Go to Chats',
              onPress: () => {
                navigation.navigate('Chats');
              }
            },
            {
              text: 'Continue Browsing',
              onPress: () => {
                navigation.goBack();
              }
            }
          ]
        );
        setInviteCode('');
      }
    } catch (error) {
      console.error('Error joining by code:', error);
      
      let errorMessage = 'Failed to join event. Please try again.';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.status === 404) {
        errorMessage = 'Invalid invite code. Please check and try again.';
      } else if (error.response?.status === 400) {
        errorMessage = 'This invite code has expired or is no longer valid.';
      } else if (error.response?.status === 409) {
        errorMessage = 'You have already joined this event.';
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatInviteCode = (text) => {
    // Convert to uppercase and remove any non-alphanumeric characters
    const formatted = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Limit to 8 characters
    return formatted.substring(0, 8);
  };

  const handleCodeChange = (text) => {
    const formatted = formatInviteCode(text);
    setInviteCode(formatted);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.content}>
          {/* Header Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="ticket" size={48} color="#6366F1" />
          </View>

          {/* Title and Description */}
          <Text style={styles.title}>Join with Invite Code</Text>
          <Text style={styles.description}>
            Enter the invite code shared by an event organizer to instantly join their event.
          </Text>

          {/* Invite Code Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Invite Code</Text>
            <TextInput
              style={styles.input}
              value={inviteCode}
              onChangeText={handleCodeChange}
              placeholder="Enter code (e.g. ABC123)"
              placeholderTextColor="#666"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              keyboardType="default"
            />
            <Text style={styles.inputHint}>
              Codes are usually 6-8 characters long
            </Text>
          </View>

          {/* Join Button */}
          <TouchableOpacity
            style={[styles.joinButton, (!inviteCode.trim() || loading) && styles.joinButtonDisabled]}
            onPress={handleJoinByCode}
            disabled={!inviteCode.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                <Text style={styles.joinButtonText}>Join Event</Text>
              </>
            )}
          </TouchableOpacity>

          {/* How it Works Section */}
          <View style={styles.howItWorksContainer}>
            <Text style={styles.howItWorksTitle}>How it works:</Text>
            <View style={styles.step}>
              <Ionicons name="share-outline" size={16} color="#9CA3AF" />
              <Text style={styles.stepText}>Event organizers share invite codes</Text>
            </View>
            <View style={styles.step}>
              <Ionicons name="text-outline" size={16} color="#9CA3AF" />
              <Text style={styles.stepText}>Enter the code above</Text>
            </View>
            <View style={styles.step}>
              <Ionicons name="people-outline" size={16} color="#9CA3AF" />
              <Text style={styles.stepText}>Instantly join the event and start chatting</Text>
            </View>
          </View>

          {/* Alternative Action */}
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.browseButtonText}>
              Browse Events Instead
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333',
    textAlign: 'center',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  inputHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  joinButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  joinButtonDisabled: {
    backgroundColor: '#374151',
  },
  buttonIcon: {
    marginRight: 8,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  howItWorksContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  howItWorksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginLeft: 12,
    flex: 1,
  },
  browseButton: {
    alignItems: 'center',
    padding: 12,
  },
  browseButtonText: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '500',
  },
});