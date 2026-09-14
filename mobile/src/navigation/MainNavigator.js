// mobile/src/navigation/MainNavigator.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { FilterProvider, useFilter } from '../contexts/FilterContext';

// Tab Screens
import SwipeScreen from '../screens/Main/SwipeScreen';
import MatchesScreen from '../screens/Main/MatchesScreen';
import CreateEventScreen from '../screens/Main/CreateEventScreen';
import ProfileScreen from '../screens/Main/ProfileScreen';

// Stack Screens
import ChatScreen from '../screens/Chat/ChatScreen';
import CreateNewScreen from '../screens/Create/CreateNewScreen';
import EditEventScreen from '../screens/Create/EditEventScreen';
import PendingApplicationsScreen from '../screens/Create/PendingApplicationsScreen';
import JoinByCodeScreen from '../screens/Main/JoinByCodeScreen';
import PrivateChatScreen from '../screens/Chat/PrivateChatScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function SwipeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0A0A0A',
          borderBottomWidth: 1,
          borderBottomColor: '#1A1A1A',
          height: 70,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '600',
          color: '#FFFFFF',
        },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Stack.Screen 
        name="SwipeMain" 
        component={SwipeScreen} 
        options={{ 
          title: '',
          headerStyle: {
            backgroundColor: '#0A0A0A',
            borderBottomWidth: 1,
            borderBottomColor: '#1A1A1A',
            height: 70,
          },
          headerTitleStyle: {
            fontSize: 20,
            fontWeight: 'bold',
            color: '#FFFFFF',
          },
          headerTintColor: '#FFFFFF',
        }}
      />
      <Stack.Screen 
        name="JoinByCode" 
        component={JoinByCodeScreen}
        options={{ 
          title: '',
          headerStyle: {
            backgroundColor: '#0A0A0A',
            borderBottomWidth: 1,
            borderBottomColor: '#1A1A1A',
            height: 70,
          },
          headerTitleStyle: {
            color: '#FFFFFF',
          },
          headerBackTitleVisible: false,
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}

function MatchesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0A0A0A',
          borderBottomWidth: 1,
          borderBottomColor: '#1A1A1A',
          height: 70,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '600',
          color: '#FFFFFF',
        },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Stack.Screen 
        name="MatchesMain" 
        component={MatchesScreen}
        options={{ 
          title: '',
        }}
      />
      <Stack.Screen 
        name="Chat" 
        component={ChatScreen}
        options={({ route }) => ({ 
          title: '',
          headerBackTitleVisible: false,
        })}
      />
      <Stack.Screen 
        name="PrivateChat" 
        component={PrivateChatScreen}
        options={{
          headerShown: true,
          headerStyle: {
            backgroundColor: '#000000',
          },
          headerTintColor: '#FFFFFF',
        }}
        />
    </Stack.Navigator>
  );
}

function CreateStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0A0A0A',
          borderBottomWidth: 1,
          borderBottomColor: '#1A1A1A',
          height: 70,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '600',
          color: '#FFFFFF',
        },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Stack.Screen 
        name="CreateMain" 
        component={CreateEventScreen}
        options={{ 
          title: '',
        }}
      />
      <Stack.Screen 
        name="CreateNew" 
        component={CreateNewScreen}
        options={({ route }) => ({ 
          title: '',
          headerBackTitleVisible: false,
        })}
      />
      <Stack.Screen 
        name="EditEvent" 
        component={EditEventScreen}
        options={({ route }) => ({ 
          title: '',
          headerBackTitleVisible: false,
        })}
      />
      <Stack.Screen 
        name="PendingApplications" 
        component={PendingApplicationsScreen}
        options={({ route }) => ({ 
          title: '',
          headerBackTitleVisible: false,
        })}
      />
    </Stack.Navigator>
  );
}

function InviteStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0A0A0A',
          borderBottomWidth: 1,
          borderBottomColor: '#1A1A1A',
          height: 70,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '600',
          color: '#FFFFFF',
        },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Stack.Screen 
        name="InviteMain" 
        component={JoinByCodeScreen}
        options={{ 
          title: '',
        }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0A0A0A',
          borderBottomWidth: 1,
          borderBottomColor: '#1A1A1A',
          height: 70,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '600',
          color: '#FFFFFF',
        },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Stack.Screen 
        name="ProfileMain" 
        component={ProfileScreen}
        options={{ 
          title: '',
        }}
      />
    </Stack.Navigator>
  );
}

function TabNavigatorContent() {
  const { selectedFilter, openFilterDrawer } = useFilter();

  // Categories for icon mapping
  const CATEGORIES = {
    tabletop: { icon: 'cube-outline', color: '#8B4513' },
    cards: { icon: 'albums-outline', color: '#DC143C' },
    fantasy: { icon: 'trophy-outline', color: '#FFD700' },
    sports: { icon: 'basketball-outline', color: '#FF6B35' },
    golf: { icon: 'golf-outline', color: '#228B22' },
    health: { icon: 'body-outline', color: '#9370DB' }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          let iconColor;

          if (route.name === 'LFG') {
            if (selectedFilter) {
              // Show category icon when filtered
              iconName = CATEGORIES[selectedFilter].icon;
              // Use category color when filtered
              iconColor = CATEGORIES[selectedFilter].color;
            } else {
              // Show default megaphone icon
              iconName = focused ? 'megaphone' : 'megaphone-outline';
              // Use normal focused/unfocused colors
              iconColor = focused ? '#0078FF' : '#666666';
            }
          } else if (route.name === 'Chats') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
            iconColor = focused ? '#0078FF' : '#666666';
          } else if (route.name === 'Home') {
            iconName = focused ? 'add-circle' : 'add-circle-outline';
            iconColor = focused ? '#0078FF' : '#666666';
          } else if (route.name === 'Invite') {
            iconName = focused ? 'ticket' : 'ticket-outline';
            iconColor = focused ? '#0078FF' : '#666666';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
            iconColor = focused ? '#0078FF' : '#666666';
          }

          return <Ionicons name={iconName} size={size} color={iconColor} />;
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopColor: '#1A1A1A',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 90 : 70,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerShown: false,
      })}
      screenListeners={({ navigation, route }) => ({
        tabPress: (e) => {
          if (route.name === 'LFG') {
            // Check if we're already on the LFG tab
            const currentRoute = navigation.getState().routes[navigation.getState().index];
            if (currentRoute.name === 'LFG') {
              // Already on LFG tab - open filter drawer
              e.preventDefault();
              openFilterDrawer();
            }
            // If not on LFG tab, let normal navigation happen
          }
        }
      })}
    >
      <Tab.Screen name="LFG" component={SwipeStack} />
      <Tab.Screen name="Chats" component={MatchesStack} />
      <Tab.Screen name="Home" component={CreateStack} />
      <Tab.Screen name="Invite" component={InviteStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <FilterProvider>
      <TabNavigatorContent />
    </FilterProvider>
  );
}