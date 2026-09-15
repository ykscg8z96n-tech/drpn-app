// mobile/src/screens/Main/MyApplicationsScreen.js
//
// Everything the current user has applied to (pending, accepted, or
// declined) - there was previously no way to see this or back out of an
// application after swiping right, short of the organizer accepting or
// rejecting it. Withdraw removes the application even after acceptance,
// freeing the spot back up.
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';

const STATUS_STYLE = {
  pending: { label: 'Pending', color: '#F4A62A' },
  accepted: { label: 'Accepted', color: '#00B000' },
  declined: { label: 'Declined', color: '#E12112' },
  completed: { label: 'Completed', color: '#666666' },
};

export default function MyApplicationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState(null);

  const loadApplications = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const response = await api.get('/users/my-applications');
      setApplications(response.data.data || []);
    } catch (error) {
      console.error('Error loading applications:', error);
      Alert.alert('Error', 'Failed to load your applications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadApplications();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadApplications(false);
  };

  const handleWithdraw = (application) => {
    const { event, status } = application;
    Alert.alert(
      'Withdraw Application',
      status === 'accepted'
        ? `Leave "${event.name}"? Your spot will open back up for someone else.`
        : `Withdraw your application to "${event.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setWithdrawingId(event._id);
            try {
              await api.delete(`/users/my-applications/${event._id}`);
              setApplications(prev => prev.filter(a => a.event._id !== event._id));
            } catch (error) {
              console.error('Error withdrawing application:', error);
              Alert.alert('Error', 'Failed to withdraw. Please try again.');
            } finally {
              setWithdrawingId(null);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const { event, status, joinedAt } = item;
    const statusInfo = STATUS_STYLE[status] || STATUS_STYLE.pending;
    const capacityText = event.type === 'event'
      ? `${event.currentAttendees || 0}/${event.capacity || 0}`
      : `${event.currentMembers || 0}/${event.groupSize || 0}`;

    return (
      <View style={styles.card}>
        <View style={styles.cardPhoto}>
          {event.photos && event.photos.length > 0 ? (
            <Image source={{ uri: event.photos[0].url }} style={styles.photoImage} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name={event.type === 'group' ? 'people' : 'calendar'} size={28} color="#666666" />
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.eventName} numberOfLines={1}>{event.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
              <Text style={styles.statusBadgeText}>{statusInfo.label}</Text>
            </View>
          </View>

          <Text style={styles.organizerText}>by {event.organizer?.name || 'Unknown'}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={14} color="#999999" />
            <Text style={styles.metaText}>{capacityText}</Text>
            <Text style={styles.metaDivider}>•</Text>
            <Text style={styles.metaText}>Applied {new Date(joinedAt).toLocaleDateString()}</Text>
          </View>

          {status !== 'declined' && (
            <TouchableOpacity
              style={styles.withdrawButton}
              onPress={() => handleWithdraw(item)}
              disabled={withdrawingId === event._id}
            >
              {withdrawingId === event._id ? (
                <ActivityIndicator size="small" color="#E12112" />
              ) : (
                <Text style={styles.withdrawButtonText}>
                  {status === 'accepted' ? 'Leave' : 'Withdraw'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#0078FF" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={applications}
        keyExtractor={(item) => item.event._id}
        renderItem={renderItem}
        contentContainerStyle={applications.length === 0 ? styles.emptyList : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0078FF" />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color="#666161" />
            <Text style={styles.emptyText}>No applications yet</Text>
            <Text style={styles.emptySubtext}>Events and groups you apply to will show up here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 16,
  },
  emptyList: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#111111',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardPhoto: {
    width: 90,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eventName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  organizerText: {
    fontSize: 13,
    color: '#999999',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#999999',
  },
  metaDivider: {
    fontSize: 12,
    color: '#666666',
  },
  withdrawButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E12112',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  withdrawButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E12112',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 20,
  },
});
