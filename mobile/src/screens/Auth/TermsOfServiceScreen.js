// mobile/src/screens/Auth/TermsOfServiceScreen.js
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Rendered as a Modal rather than a normal stack screen. On web, the Auth
// stack's cardStyleInterpolator keeps a `transform` on every screen even
// after its slide-in animation settles (translateX(0) instead of no
// transform at all) - iOS Safari treats any transformed ancestor as a new
// containing block and silently breaks touch-scrolling in a descendant
// ScrollView, which is exactly what long content like this needs. RN Web's
// Modal portals its content straight to the document body, outside that
// transformed tree, sidestepping the bug entirely.
export default function TermsOfServiceScreen({ visible, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onClose}>
            <Ionicons name="chevron-back" size={28} color="#0078FF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Terms of Service</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <Text style={styles.updated}>Last updated: this is an early beta build</Text>

          <Text style={styles.paragraph}>
            DRPN is currently in private beta testing with a small group of invited users. By
            using the app you agree to the following, which will be replaced with a full legal
            version before any public launch.
          </Text>

          <Text style={styles.heading}>1. Eligibility</Text>
          <Text style={styles.paragraph}>
            You must be at least 18 years old to create an account and use DRPN.
          </Text>

          <Text style={styles.heading}>2. Your Conduct</Text>
          <Text style={styles.paragraph}>
            You agree to treat other users respectfully. Harassment, hate speech, spam, and
            impersonation are not allowed and may result in your account being suspended or
            removed. Use the in-app Report feature if another user violates these terms.
          </Text>

          <Text style={styles.heading}>3. Beta Software</Text>
          <Text style={styles.paragraph}>
            This app is under active development. Features may change, break, or be removed
            without notice, and data (events, messages, connections) may be reset or lost during
            this beta period.
          </Text>

          <Text style={styles.heading}>4. Content</Text>
          <Text style={styles.paragraph}>
            You're responsible for anything you post, including photos, event details, and chat
            messages. Don't post anything illegal, infringing, or that you don't have the right
            to share.
          </Text>

          <Text style={styles.heading}>5. Account Termination</Text>
          <Text style={styles.paragraph}>
            We may suspend or remove your account at any time during this beta period, with or
            without notice, particularly for violations of these terms.
          </Text>

          <Text style={styles.heading}>6. No Warranty</Text>
          <Text style={styles.paragraph}>
            DRPN is provided "as is" during this beta period with no guarantees of uptime,
            accuracy, or fitness for any particular purpose.
          </Text>

          <Text style={styles.paragraph}>
            Questions about these terms? Reach out to the person who invited you to test the app.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 28,
  },
  headerSpacer: {
    width: 28,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  updated: {
    color: '#6B7280',
    fontSize: 13,
    marginBottom: 20,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  paragraph: {
    color: '#C7C4C4',
    fontSize: 15,
    lineHeight: 22,
  },
});
