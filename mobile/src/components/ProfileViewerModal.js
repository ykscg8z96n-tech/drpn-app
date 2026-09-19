// mobile/src/components/ProfileViewerModal.js
//
// The one Modal wrapper for "tap a photo/row, see someone's profile" -
// used from the private chat profile viewer, the swipe deck's organizer
// profile, and the event/group roster's profile viewer. Before this,
// each of those three screens hand-built its own Modal + close button +
// ProfilePreviewCard, which is how they drifted (different header chrome,
// only some of them wired for Block/Report). Any future full-screen
// profile view should use this instead of copying a Modal again.
//
// Below the card itself it also owns two sections shared by every caller:
// an "In Common" list of events/groups both the viewer and this profile
// are on the roster of (styled like the Chats list), and an actions list
// (Favorite, Block, Report) modeled on the Profile screen's own
// Verified/Premium button list.
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProfilePreviewCard from './ProfilePreviewCard';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const CATEGORY_COLORS = {
  sports: '#FF6B35',
  golf: '#228B22',
  health: '#9370DB',
  fantasy: '#FFD700',
  cards: '#DC143C',
  tabletop: '#8B4513',
};

function CommonItemRow({ item }) {
  const photo = item.photos?.[0]?.url || item.photos?.[0];
  const color = CATEGORY_COLORS[item.category] || '#666666';
  const count = item.currentAttendees;

  return (
    <View style={styles.commonRow}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.commonImage} />
      ) : (
        <View style={[styles.commonImage, styles.commonImagePlaceholder, { backgroundColor: color }]}>
          <Ionicons name={item.type === 'group' ? 'people' : 'calendar'} size={18} color="white" />
        </View>
      )}
      <View style={styles.commonInfo}>
        {item.category && (
          <View style={[styles.commonCategoryBadge, { backgroundColor: color }]}>
            <Text style={styles.commonCategoryText}>{item.category.toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.commonName} numberOfLines={1}>{item.name}</Text>
      </View>
      {count != null && (
        <Text style={styles.commonCount}>{count} joined</Text>
      )}
    </View>
  );
}

export default function ProfileViewerModal({
  visible,
  profile,
  onClose,
  isBlocked,
  onBlockPress,
  onReportPress,
  scrollFooter, // extra content that scrolls with the card (e.g. organizer stats)
  footer, // extra content fixed below the scroll area (e.g. a "Message Privately" button)
  children, // e.g. a report-reason ActionSheet - must nest INSIDE this Modal
            // (not render as a sibling top-level Modal outside it), or
            // iOS/Android queues it behind this one instead of stacking it
}) {
  const { user, updateUser } = useAuth();
  const [commonItems, setCommonItems] = useState([]);
  const [loadingCommon, setLoadingCommon] = useState(false);

  const profileId = profile?._id || profile?.id;
  const isOwnProfile = profileId && (profileId === user?.id || profileId === user?._id);
  const isFollowing = !!profileId && !!user?.following?.some(id => (id?._id || id)?.toString?.() === profileId.toString());

  useEffect(() => {
    if (!profileId || isOwnProfile) {
      setCommonItems([]);
      return;
    }
    let cancelled = false;
    setLoadingCommon(true);
    api.get(`/users/${profileId}/common-events`)
      .then(({ data }) => {
        if (!cancelled && data.success) setCommonItems(data.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCommon(false);
      });
    return () => { cancelled = true; };
  }, [profileId, isOwnProfile]);

  const events = commonItems.filter(i => i.type !== 'group');
  const groups = commonItems.filter(i => i.type === 'group');

  const showActions = !isOwnProfile && (onBlockPress || onReportPress);
  const profileName = profile?.name || 'this user';

  const explainFollowing = () => {
    Alert.alert(
      'What does Following do?',
      "Following lets you keep up with someone's public activity - it doesn't notify them, and it's separate from blocking or messaging. You'll get a message here from the DRPN bot whenever someone you follow adds a new event (not groups, since those aren't a one-time thing)."
    );
  };

  const handleToggleFollow = async () => {
    if (!profileId) return;
    try {
      const response = isFollowing
        ? await api.delete(`/users/follow/${profileId}`)
        : await api.post(`/users/follow/${profileId}`);
      if (response.data.success) {
        updateUser({ ...user, following: response.data.data.following });
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update follow status');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>

        <ScrollView style={styles.content} bounces={false}>
          {profile && <ProfilePreviewCard profile={profile} />}
          {scrollFooter}

          {!isOwnProfile && (
            <View style={styles.commonSection}>
              <Text style={styles.sectionTitle}>In Common</Text>
              {loadingCommon ? (
                <ActivityIndicator size="small" color="#0078FF" style={styles.commonLoading} />
              ) : commonItems.length === 0 ? (
                <Text style={styles.commonEmpty}>No events or groups in common yet</Text>
              ) : (
                <>
                  {events.length > 0 && (
                    <View style={styles.commonSubsection}>
                      <Text style={styles.commonSubsectionTitle}>EVENTS</Text>
                      {events.map(item => <CommonItemRow key={item._id} item={item} />)}
                    </View>
                  )}
                  {groups.length > 0 && (
                    <View style={styles.commonSubsection}>
                      <Text style={styles.commonSubsectionTitle}>GROUPS</Text>
                      {groups.map(item => <CommonItemRow key={item._id} item={item} />)}
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {showActions && (
            <View style={styles.actionsSection}>
              <TouchableOpacity style={styles.actionRow} onPress={handleToggleFollow}>
                <Ionicons name="bookmark" size={22} color={isFollowing ? '#0078FF' : '#666666'} />
                <Text style={styles.actionText}>Add to Favorites</Text>
                <TouchableOpacity onPress={explainFollowing} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="information-circle-outline" size={22} color="#666666" />
                </TouchableOpacity>
              </TouchableOpacity>

              {onBlockPress && (
                <TouchableOpacity style={styles.actionRow} onPress={onBlockPress}>
                  <Ionicons name={isBlocked ? 'checkmark-circle-outline' : 'ban-outline'} size={22} color="#FFFFFF" />
                  <Text style={styles.actionText}>{isBlocked ? `Unblock ${profileName}` : `Block ${profileName}`}</Text>
                </TouchableOpacity>
              )}

              {onReportPress && (
                <TouchableOpacity style={styles.actionRow} onPress={onReportPress}>
                  <Ionicons name="flag" size={22} color="#FF3B30" />
                  <Text style={[styles.actionText, styles.actionTextDanger]}>{`Report ${profileName}`}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>

        {footer}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 6,
  },
  content: {
    flex: 1,
  },

  // In Common
  commonSection: {
    marginTop: 24,
    marginHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  commonLoading: {
    marginVertical: 8,
  },
  commonEmpty: {
    fontSize: 14,
    color: '#666666',
    fontStyle: 'italic',
  },
  commonSubsection: {
    marginBottom: 12,
  },
  commonSubsectionTitle: {
    color: '#666666',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  commonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  commonImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  commonImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  commonInfo: {
    flex: 1,
  },
  commonCategoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 3,
  },
  commonCategoryText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '600',
  },
  commonName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  commonCount: {
    fontSize: 11,
    color: '#999999',
  },

  // Actions (Favorite / Block / Report) - same look as the Profile
  // screen's own settings list (see ProfileScreen.js's actionButton).
  actionsSection: {
    marginTop: 8,
    marginHorizontal: 20,
    marginBottom: 32,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  actionTextDanger: {
    color: '#FF3B30',
  },
});
