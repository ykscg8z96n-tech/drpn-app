// mobile/src/screens/Create/PendingApplicationsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import ProfilePreviewCard from '../../components/ProfilePreviewCard';
import SelectModal from '../../components/SelectModal';

const { width } = Dimensions.get('window');

// User Item Component - Matching CreateEventScreen style
const UserItem = ({
  user,
  isPending = false,
  isSelf = false,
  isTargetOwner = false,
  isSoleOwner = false,
  canManage = false,
  onAccept,
  onReject,
  onStartChat,
  onViewProfile,
  onOpenActions,
  onStepDown,
  onLeave,
}) => {
  const getInitials = (name) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <TouchableOpacity style={styles.userItem} onPress={() => onViewProfile(user)} activeOpacity={0.7}>
      <View style={styles.userHeader}>
        {/* Left Section - Photo (same size as events) */}
        <View style={styles.leftSection}>
          <View style={styles.photoContainer}>
            {user.photos && user.photos.length > 0 ? (
              <Image 
                source={{ uri: user.photos[0].url || user.photos[0] }} 
                style={styles.userPhoto}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.userPhotoPlaceholder}>
                <Text style={styles.initialsText}>
                  {getInitials(user.name)}
                </Text>
              </View>
            )}
            
            {/* Status indicator for pending users */}
            {isPending && (
              <View style={styles.pendingIndicator}>
                <Ionicons name="time" size={12} color="white" />
              </View>
            )}
            
            {/* Organizer/Owner badge */}
            {isTargetOwner && (
              <View style={styles.organizerBadge}>
                <Ionicons name="star" size={12} color="white" />
              </View>
            )}

            {/* Super swipe badge - only pending applicants can have one
                (isSuperSwipe isn't set on accepted/owner entries). */}
            {user.isSuperSwipe && (
              <View style={styles.superSwipeBadge}>
                <Ionicons name="flash" size={12} color="white" />
              </View>
            )}
          </View>
        </View>

        {/* Center Section - User Info */}
        <View style={styles.centerSection}>
          <View style={styles.contentRow}>
            <View style={styles.nameSection}>
              <Text style={styles.userName}>{user.name}</Text>
              {isTargetOwner && (
                <Text style={styles.organizerLabel}>Owner</Text>
              )}
              {user.isSuperSwipe && (
                <Text style={styles.superSwipeLabel}>Super Swipe</Text>
              )}
            </View>

            {/* Right Section - Actions */}
            <View style={styles.rightSection}>
              {isPending && canManage ? (
                <View style={styles.pendingActions}>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => onReject(user)}
                  >
                    <Ionicons name="close" size={20} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => onAccept(user)}
                  >
                    <Ionicons name="checkmark" size={20} color="white" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.rowActions}>
                  {isSelf ? (
                    /* Every owner has identical rights - the only one who
                       can't step down or leave is the sole remaining
                       owner, since there'd be no one left to manage it.
                       They have to cancel it or promote someone else
                       first. */
                    !isSoleOwner && (
                      <>
                        {isTargetOwner && (
                          <TouchableOpacity style={styles.stepDownButton} onPress={onStepDown}>
                            <Text style={styles.stepDownButtonText}>Step Down</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.stepDownButton} onPress={onLeave}>
                          <Text style={styles.stepDownButtonText}>Leave</Text>
                        </TouchableOpacity>
                      </>
                    )
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.chatButton}
                        onPress={() => onStartChat(user)}
                      >
                        <Ionicons name="chatbubble-outline" size={16} color="#007AFF" />
                        <Text style={styles.chatButtonText}>Chat</Text>
                      </TouchableOpacity>
                      {/* Mute/Report are available on anyone else regardless
                          of role; owners just can't also be kicked or
                          re-promoted from here - they have to step down
                          themselves (see the options list itself). */}
                      <TouchableOpacity
                        style={styles.moreButton}
                        onPress={() => onOpenActions(user)}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color="#999999" />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* User details (bio, age, applied date) */}
          <View style={styles.userDetails}>
            {user.age && (
              <Text style={styles.userAge}>Age {user.age}</Text>
            )}
            {user.bio && (
              <Text style={styles.userBio} numberOfLines={1} ellipsizeMode="tail">
                {user.bio}
              </Text>
            )}
            {isPending && user.appliedAt && (
              <Text style={styles.appliedDate}>
                Applied {formatDate(user.appliedAt)}
              </Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function PendingApplicationsScreen({ route, navigation }) {
  const { event } = route.params;
  const { user, updateUser } = useAuth();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [acceptedUsers, setAcceptedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(null);
  // Sourced from the fresh GET /events/:id fetch in loadUsers, not the
  // route param `event` (which only carries whatever the list screen it
  // came from populated, and never admins).
  const [adminIds, setAdminIds] = useState([]);
  const [actionMenuUser, setActionMenuUser] = useState(null);

  const handleViewProfile = (userData) => setViewingProfile(userData);

  // Every owner has identical rights - there's no more-powerful
  // "organizer" tier for a regular event/group.
  const canManage = adminIds.includes(user?.id);
  const isOwner = (userId) => adminIds.includes(userId);
  const isSoleOwner = adminIds.length === 1 && adminIds[0] === user?.id;

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading users for event:', event._id);
      console.log('👤 Current user:', user?.id);

      // Get event details with applicants
      const response = await api.get(`/events/${event._id}`);
      
      if (response.data.success) {
        const eventData = response.data.data;
        console.log('📊 Event data received:', eventData.applicants?.length || 0, 'applicants');
        
        const applicants = eventData.applicants || [];
        
        // Separate pending and accepted users - a super swipe jumps to
        // the top of pending (that's the whole point of paying for one),
        // otherwise oldest-applied-first.
        const pending = applicants
          .filter(app => app.status === 'pending')
          .map(app => ({
            ...app.userId,
            appliedAt: app.appliedAt,
            applicationId: app._id,
            application: app.application,
            isSuperSwipe: app.isSuperSwipe || false
          }))
          .sort((a, b) => {
            if (a.isSuperSwipe !== b.isSuperSwipe) return a.isSuperSwipe ? -1 : 1;
            return new Date(a.appliedAt) - new Date(b.appliedAt);
          });
          
        const accepted = applicants
          .filter(app => app.status === 'accepted')
          .map(app => ({
            ...app.userId,
            acceptedAt: app.respondedAt,
            applicationId: app._id
          }));
        
        // Add any owner who isn't already a roster/applicants entry (the
        // creator never had to apply to their own event/group, so they'd
        // otherwise be invisible here). Uses eventData.admins - the
        // just-fetched, fully populated list (name/photos/bio/age) - not
        // the route param `event` prop, which only ever carries whatever
        // the list screen it came from populated (name/photos), so
        // bio/age were always blank here even for a full profile.
        const freshAdmins = eventData.admins || [];
        const freshAdminIds = freshAdmins.map(a => a._id || a);
        freshAdmins.forEach(admin => {
          const adminId = admin._id || admin;
          if (!accepted.find(u => u._id === adminId)) {
            accepted.unshift(admin);
          }
        });

        console.log('👥 Pending users:', pending.length);
        console.log('✅ Accepted users:', accepted.length);

        setAdminIds(freshAdminIds);
        setPendingUsers(pending);
        setAcceptedUsers(accepted);
      }
    } catch (error) {
      console.error('❌ Error loading users:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view this roster.');
      } else {
        Alert.alert('Error', 'Failed to load roster. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  const handleAcceptUser = async (userData) => {
    try {
      Alert.alert(
        'Accept Application',
        `Accept ${userData.name}'s application?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Accept',
            onPress: async () => {
              try {
                await api.post(`/events/${event._id}/decide`, {
                  userId: userData._id,
                  decision: 'accept'
                });
                
                // Move user from pending to accepted
                setPendingUsers(prev => prev.filter(u => u._id !== userData._id));
                setAcceptedUsers(prev => [...prev, { ...userData, acceptedAt: new Date() }]);
                
                Alert.alert('Success', 'Application accepted!');
              } catch (error) {
                console.error('Error accepting user:', error);
                Alert.alert('Error', 'Failed to accept application');
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const handleRejectUser = async (userData) => {
    try {
      Alert.alert(
        'Reject Application',
        `Reject ${userData.name}'s application?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async () => {
              try {
                await api.post(`/events/${event._id}/decide`, {
                  userId: userData._id,
                  decision: 'reject'
                });
                
                // Remove user from pending
                setPendingUsers(prev => prev.filter(u => u._id !== userData._id));
                
                Alert.alert('Success', 'Application rejected');
              } catch (error) {
                console.error('Error rejecting user:', error);
                Alert.alert('Error', 'Failed to reject application');
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const handleStartChat = async (userData) => {
    // Starting a chat is instant and reversible (and a no-op if one
    // already exists - see POST /private-connections/invite) - a
    // confirmation dialog just adds a click, especially annoying when
    // reopening a conversation you already started.
    try {
      const response = await api.post('/private-connections/invite', {
        toUserId: userData._id,
        originEventId: event._id,
        message: `Hi ${userData.name}! I'd love to chat privately after meeting at ${event.name}.`
      });

      if (response.data.success) {
        // This screen lives in the Home tab's own stack - PrivateChat is
        // a screen in the Chats tab's stack, so a plain
        // navigate('PrivateChat') can't find it. Navigating to the tab
        // by name with a nested screen/params is how React Navigation
        // crosses between sibling tab stacks.
        navigation.navigate('Chats', {
          screen: 'PrivateChat',
          params: {
            connectionId: response.data.data._id,
            otherUser: { name: userData.name, image: userData.photos?.[0]?.url || userData.photos?.[0] }
          }
        });
      } else {
        Alert.alert('Error', response.data.message || 'Failed to start chat');
      }
    } catch (error) {
      console.error('Error starting chat:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to start private chat');
    }
  };

  const handleMakeOwner = (userData) => {
    Alert.alert(
      'Make Owner',
      `Send ${userData.name} an invite to become an owner of "${event.name}"? They'll need to accept it before it takes effect.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Invite',
          onPress: async () => {
            try {
              await api.post(`/events/${event._id}/invite-owner`, { userId: userData._id });
              Alert.alert('Sent', `Owner invite sent to ${userData.name}.`);
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to send owner invite');
            }
          }
        }
      ]
    );
  };

  const handleStepDown = () => {
    Alert.alert(
      'Step Down',
      `Give up ownership of "${event.name}"? You'll still be on the roster, just without owner permissions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Step Down',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/events/${event._id}/step-down`);
              setAdminIds(prev => prev.filter(id => id !== user?.id));
              Alert.alert('Done', "You're no longer an owner.");
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to step down');
            }
          }
        }
      ]
    );
  };

  const handleLeave = () => {
    Alert.alert(
      `Leave ${event.type === 'group' ? 'Group' : 'Event'}`,
      `Leave "${event.name}"? You'll be removed from the roster and chat, and it won't show up in your LFG feed again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/events/${event._id}/leave`);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to leave');
            }
          }
        }
      ]
    );
  };

  // Same account-level block used from a chat's profile viewer - "Mute"
  // is just the friendlier label for it here, since you still share a
  // roster with this person (they don't disappear from the list), you
  // just stop seeing their messages and can't start a fresh private chat
  // with them either way.
  const isUserMuted = (userId) => {
    if (!userId) return false;
    return !!user?.blockedUsers?.some(id => (id?._id || id)?.toString?.() === userId.toString());
  };

  const handleToggleMute = async (userData) => {
    const muted = isUserMuted(userData._id);
    try {
      const response = muted
        ? await api.delete(`/users/block/${userData._id}`)
        : await api.post(`/users/block/${userData._id}`);
      if (response.data.success) {
        updateUser(response.data.data);
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update mute status');
    }
  };

  const reportReasons = [
    { label: 'Harassment', value: 'harassment' },
    { label: 'Spam', value: 'spam' },
    { label: 'Inappropriate content', value: 'inappropriate_content' },
    { label: 'Safety concern', value: 'safety_concern' },
    { label: 'Other', value: 'other' },
  ];

  const handleReport = (userData) => {
    Alert.alert(
      `Report ${userData.name}`,
      'What\'s the issue?',
      [
        ...reportReasons.map(r => ({
          text: r.label,
          onPress: async () => {
            try {
              await api.post('/reports', {
                reportedUserId: userData._id,
                reason: r.value,
                context: event.type === 'group' ? 'group_chat' : 'event_chat',
                contextId: event._id,
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

  const handleKick = (userData) => {
    Alert.alert(
      'Remove from Roster',
      `Remove ${userData.name} from "${event.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/events/${event._id}/kick`, { userId: userData._id });
              setAcceptedUsers(prev => prev.filter(u => u._id !== userData._id));
              setPendingUsers(prev => prev.filter(u => u._id !== userData._id));
            } catch (error) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to remove from roster');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading roster...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{event.name}</Text>
        <Text style={styles.subtitle}>
          {canManage ? 'Owner' : 'Participant'} • {pendingUsers.length > 0 ? `${pendingUsers.length} pending` : 'No pending'}
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF"
            colors={['#007AFF']}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Pending Applications Section - Sticky-like at top */}
        {canManage && pendingUsers.length > 0 && (
          <View style={styles.pendingSection}>
            <View style={styles.pendingSectionHeader}>
              <Text style={styles.pendingSectionTitle}>
                Pending Applications ({pendingUsers.length})
              </Text>
            </View>

            {pendingUsers.map((userData) => (
              <UserItem
                key={userData._id}
                user={userData}
                isPending={true}
                canManage={canManage}
                isSelf={userData._id === user?.id}
                onAccept={handleAcceptUser}
                onReject={handleRejectUser}
                onViewProfile={handleViewProfile}
              />
            ))}

            <View style={styles.sectionDivider} />
          </View>
        )}

        {/* Accepted Users Section - Scrollable */}
        <View style={styles.rosterSection}>
          {acceptedUsers.length > 0 ? (
            acceptedUsers.map((userData) => (
              <UserItem
                key={userData._id}
                user={userData}
                isPending={false}
                isSelf={userData._id === user?.id}
                isTargetOwner={isOwner(userData._id)}
                isSoleOwner={isSoleOwner}
                canManage={canManage}
                onStartChat={handleStartChat}
                onViewProfile={handleViewProfile}
                onOpenActions={setActionMenuUser}
                onStepDown={handleStepDown}
                onLeave={handleLeave}
              />
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#666" />
              <Text style={styles.emptyText}>No participants yet</Text>
              <Text style={styles.emptySubtext}>
                Participants will appear here when they join
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!viewingProfile}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setViewingProfile(null)}
      >
        <View style={styles.profileModalContainer}>
          <View style={styles.profileModalHeader}>
            <TouchableOpacity onPress={() => setViewingProfile(null)}>
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.profileModalHeaderTitle}>{viewingProfile?.name}</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView bounces={false}>
            <ProfilePreviewCard profile={viewingProfile} />
          </ScrollView>
        </View>
      </Modal>

      <SelectModal
        visible={!!actionMenuUser}
        title={actionMenuUser?.name}
        options={[
          // Owners can't be kicked or re-promoted from here - they have
          // to step down themselves - so management actions only apply
          // to a non-owner target, and only when the viewer can manage.
          ...(canManage && actionMenuUser && !isOwner(actionMenuUser._id) ? [
            { label: 'Make Owner', value: 'promote' },
            { label: 'Remove from Roster', value: 'kick' },
          ] : []),
          {
            label: isUserMuted(actionMenuUser?._id) ? 'Unmute' : 'Mute',
            value: 'mute'
          },
          { label: 'Report', value: 'report' },
        ]}
        onSelect={(action) => {
          const targetUser = actionMenuUser;
          if (action === 'promote') handleMakeOwner(targetUser);
          else if (action === 'kick') handleKick(targetUser);
          else if (action === 'mute') handleToggleMute(targetUser);
          else if (action === 'report') handleReport(targetUser);
        }}
        onClose={() => setActionMenuUser(null)}
      />
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
  loadingText: {
    color: '#FFFFFF',
    marginTop: 16,
    fontSize: 16,
  },
  
  // Header - Matching CreateEventScreen
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
  },
  
  content: {
    flex: 1,
  },
  
  // Pending Section (Sticky-like at top)
  pendingSection: {
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  pendingSectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
  },
  pendingSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFA500',
  },
  sectionDivider: {
    height: 8,
    backgroundColor: '#000000',
  },
  
  // Roster Section
  rosterSection: {
    flex: 1,
  },
  
  // User Item - Matching CreateEventScreen layout
  userItem: {
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  
  // Left Section - Photo (same size as events: 50x50)
  leftSection: {
    alignItems: 'center',
    marginRight: 12,
    width: 50,
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  userPhoto: {
    width: 50,
    height: 50,
    borderRadius: 8, // Square like events
  },
  userPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  
  // Status Indicators
  pendingIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFA500',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  organizerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FFD700',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  // Bottom-right, not top-right - a super swipe is only ever on a
  // pending applicant, which already has the clock badge up there.
  superSwipeBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#0078FF',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },

  // Center Section - User Info
  centerSection: {
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  nameSection: {
    flex: 1,
    paddingRight: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  organizerLabel: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '500',
  },
  superSwipeLabel: {
    fontSize: 12,
    color: '#0078FF',
    fontWeight: '500',
  },

  // Right Section - Actions
  rightSection: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    minWidth: 80,
  },
  
  // Pending Actions
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#34C759',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Chat Button
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#007AFF',
    gap: 4,
  },
  chatButtonText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '500',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moreButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepDownButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  stepDownButtonText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '500',
  },

  // User Details
  userDetails: {
    paddingRight: 16,
  },
  userAge: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 4,
  },
  userBio: {
    fontSize: 13,
    color: '#CCCCCC',
    lineHeight: 18,
    marginBottom: 4,
  },
  appliedDate: {
    fontSize: 11,
    color: '#FFA500',
  },
  
  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
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

  // Profile view modal - full screen, same as viewing your own Profile
  profileModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  profileModalHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});