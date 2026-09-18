// mobile/src/components/ProfileViewerModal.js
//
// The one Modal wrapper for "tap a photo/row, see someone's profile" -
// used from the private chat profile viewer, the swipe deck's organizer
// profile, and the event/group roster's profile viewer. Before this,
// each of those three screens hand-built its own Modal + close button +
// ProfilePreviewCard, which is how they drifted (different header chrome,
// only some of them wired for Block/Report). Any future full-screen
// profile view should use this instead of copying a Modal again.
import React from 'react';
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProfilePreviewCard from './ProfilePreviewCard';

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
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>

        <ScrollView style={styles.content} bounces={false}>
          {profile && (
            <ProfilePreviewCard
              profile={profile}
              isBlocked={isBlocked}
              onBlockPress={onBlockPress}
              onReportPress={onReportPress}
            />
          )}
          {scrollFooter}
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
});
