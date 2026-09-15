// mobile/src/screens/Auth/PrivacyPolicyScreen.js
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color="#0078FF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: this is an early beta build</Text>

        <Text style={styles.paragraph}>
          This describes what data DRPN collects during this private beta and how it's used.
          It'll be replaced with a full legal privacy policy before any public launch.
        </Text>

        <Text style={styles.heading}>What We Collect</Text>
        <Text style={styles.paragraph}>
          {'•'} Account info: name, email, password (stored encrypted), birth date{'\n'}
          {'•'} Profile info: bio, photos, interests you choose to add{'\n'}
          {'•'} Location: your approximate location, used to show nearby events/groups{'\n'}
          {'•'} Activity: events/groups you create or join, chat messages you send
        </Text>

        <Text style={styles.heading}>How We Use It</Text>
        <Text style={styles.paragraph}>
          Your data is used only to run the app: matching you with nearby events, displaying
          your profile to other users, and delivering chat messages. We don't sell your data
          or share it with advertisers.
        </Text>

        <Text style={styles.heading}>Who Can See It</Text>
        <Text style={styles.paragraph}>
          Your name, photos, and bio are visible to other users of the app. Your exact location
          is never shown to other users - only approximate distance/area. Chat messages are
          only visible to participants of that chat.
        </Text>

        <Text style={styles.heading}>Beta Period</Text>
        <Text style={styles.paragraph}>
          Since this is a small private beta, your data may be inspected by the developer for
          debugging and testing purposes. It may also be deleted or reset without notice as
          the app changes.
        </Text>

        <Text style={styles.heading}>Data Deletion</Text>
        <Text style={styles.paragraph}>
          You can request your account and all associated data be deleted at any time by
          contacting whoever invited you to test the app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
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
