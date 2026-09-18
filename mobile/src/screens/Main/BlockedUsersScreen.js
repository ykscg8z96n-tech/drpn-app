// mobile/src/screens/Main/BlockedUsersScreen.js
//
// Everyone the current user has blocked/muted (same account-level list -
// see backend/src/models/User.js's blockedUsers - "Mute" elsewhere in the
// app is just a friendlier label for this same action). Lets you unblock
// or report someone you can no longer reach any other way (e.g. you
// blocked them before ever messaging, so there's no chat left to find
// them in).
import React, { useState, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, FlatList, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const reportReasons = [
  { label: 'Harassment', value: 'harassment' },
  { label: 'Spam', value: 'spam' },
  { label: 'Inappropriate content', value: 'inappropriate_content' },
  { label: 'Safety concern', value: 'safety_concern' },
  { label: 'Other', value: 'other' },
];

export default function BlockedUsersScreen() {
  const { user, updateUser } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchBlockedUsers = useCallback(async () => {
    try {
      const response = await api.get('/users/blocked');
      if (response.data.success) {
        setBlockedUsers(response.data.data);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load blocked users');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBlockedUsers();
    }, [fetchBlockedUsers])
  );

  const handleUnblock = (blockedUser) => {
    Alert.alert(
      `Unblock ${blockedUser.name}?`,
      "You'll see their messages again and they'll be able to start a private chat with you.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              const response = await api.delete(`/users/block/${blockedUser._id}`);
              if (response.data.success) {
                updateUser({ ...user, blockedUsers: response.data.data.blockedUsers });
                setBlockedUsers(prev => prev.filter(u => u._id !== blockedUser._id));
              }
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to unblock user');
            }
          }
        },
      ]
    );
  };

  const handleReport = (blockedUser) => {
    Alert.alert(
      `Report ${blockedUser.name}`,
      "What's the issue?",
      [
        ...reportReasons.map(r => ({
          text: r.label,
          onPress: async () => {
            try {
              await api.post('/reports', {
                reportedUserId: blockedUser._id,
                reason: r.value,
                context: 'other',
              });
              Alert.alert('Report Submitted', 'Thanks for letting us know. Our team will review this.');
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to submit report');
            }
          }
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
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
    <FlatList
      style={styles.container}
      contentContainerStyle={blockedUsers.length === 0 && styles.emptyContent}
      data={blockedUsers}
      keyExtractor={(item) => item._id}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Ionicons name="ban-outline" size={48} color="#666666" />
          <Text style={styles.emptyText}>No blocked users</Text>
          <Text style={styles.emptySubtext}>
            Anyone you block or mute, from anywhere in the app, shows up here.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          {item.photos?.[0]?.url || item.photos?.[0] ? (
            <Image source={{ uri: item.photos[0].url || item.photos[0] }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>{(item.name || 'U').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>{item.name || 'Unknown User'}</Text>
          <TouchableOpacity style={styles.iconButton} onPress={() => handleReport(item)}>
            <Ionicons name="flag-outline" size={20} color="#999999" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.unblockButton} onPress={() => handleUnblock(item)}>
            <Text style={styles.unblockButtonText}>Unblock</Text>
          </TouchableOpacity>
        </View>
      )}
    />
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
  emptyContent: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  name: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  iconButton: {
    padding: 6,
  },
  unblockButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  unblockButtonText: {
    color: '#0078FF',
    fontSize: 14,
    fontWeight: '600',
  },
});
