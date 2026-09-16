// mobile/src/screens/Main/HowToUseScreen.js
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SECTIONS = [
  {
    icon: 'megaphone',
    color: '#0078FF',
    title: 'LFG',
    body: 'Swipe through events and groups happening near you. Swipe right (or tap the checkmark) to apply, left to pass. Organizers review applications and accept who they want in.',
  },
  {
    icon: 'add-circle',
    color: '#0078FF',
    title: 'Home',
    body: 'Create your own events (one-time) or groups (ongoing) under the Events/Groups tabs. Swipe an item left to reveal Roster, Edit, Invite, and Close if you organize it.',
  },
  {
    icon: 'people',
    color: '#0078FF',
    title: 'Roster',
    body: "See who's applied or joined. As organizer, accept or decline applicants here - accepting adds them to the chat automatically.",
  },
  {
    icon: 'chatbubbles',
    color: '#0078FF',
    title: 'Chats',
    body: 'Group/event chats for everyone accepted in, plus private chats with people you matched or connected with directly.',
  },
  {
    icon: 'ticket',
    color: '#0078FF',
    title: 'Invite',
    body: "Have a code from an organizer? Enter it here to join instantly, no application needed. Organizers can also share their own invite codes from an event or group's swipe menu.",
  },
  {
    icon: 'person-circle',
    color: '#0078FF',
    title: 'Profile',
    body: 'Edit your name, birthday, location, and about section. Location powers "near you" search and event distance - keep it up to date for the best matches.',
  },
];

export default function HowToUseScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        A quick rundown of what each part of DRPN does.
      </Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: `${section.color}22` }]}>
              <Ionicons name={section.icon} size={22} color={section.color} />
            </View>
            <Text style={styles.cardTitle}>{section.title}</Text>
          </View>
          <Text style={styles.cardBody}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  intro: {
    fontSize: 15,
    color: '#999999',
    marginBottom: 20,
    lineHeight: 21,
  },
  card: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardBody: {
    fontSize: 14,
    color: '#999999',
    lineHeight: 20,
  },
});
