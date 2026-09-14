// mobile/src/services/mockData.js
// Fixture data for the standalone demo build (USE_MOCK_API=true).

export const mockUser = {
  _id: 'user-1',
  id: 'user-1',
  name: 'Alex Morgan',
  email: 'demo@drpn.app',
  bio: 'Weekend warrior. Always up for pickup basketball or a trail run.',
  age: 29,
  isOrganizer: true,
  photos: [
    { _id: 'photo-1', url: 'https://i.pravatar.cc/600?img=12', isPrimary: true },
    { _id: 'photo-2', url: 'https://i.pravatar.cc/600?img=13', isPrimary: false },
  ],
  sports: ['Basketball', 'Running', 'Tennis'],
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 200).toISOString(),
};

export const mockToken = 'demo-mock-token';

const now = Date.now();
const hoursFromNow = (h) => new Date(now + h * 60 * 60 * 1000).toISOString();
const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();

export const mockOrganizer = {
  _id: 'organizer-1',
  name: 'Jamie Rivera',
  photos: [{ _id: 'op-1', url: 'https://i.pravatar.cc/600?img=32' }],
};

export const mockEvents = [
  {
    _id: 'event-1',
    title: 'Sunset Pickup Basketball',
    sport: 'Basketball',
    description: 'Casual 5-on-5 at the park courts. All skill levels welcome!',
    location: { address: 'Riverside Park Courts', coordinates: [-122.42, 37.77] },
    startTime: hoursFromNow(20),
    maxParticipants: 10,
    acceptedCount: 6,
    organizer: mockOrganizer,
    photos: [{ url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800' }],
    isMyEvent: false,
  },
  {
    _id: 'event-2',
    title: 'Morning Trail Run',
    sport: 'Running',
    description: '5-mile loop through the hills, easy pace, coffee after.',
    location: { address: 'Ridgeline Trailhead', coordinates: [-122.41, 37.76] },
    startTime: hoursFromNow(44),
    maxParticipants: 12,
    acceptedCount: 4,
    organizer: mockOrganizer,
    photos: [{ url: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800' }],
    isMyEvent: false,
  },
  {
    _id: 'event-3',
    title: 'Doubles Tennis Meetup',
    sport: 'Tennis',
    description: 'Looking for two more players for doubles this weekend.',
    location: { address: 'Oakwood Tennis Club', coordinates: [-122.43, 37.78] },
    startTime: hoursFromNow(68),
    maxParticipants: 4,
    acceptedCount: 2,
    organizer: mockOrganizer,
    photos: [{ url: 'https://images.unsplash.com/photo-1595435742656-5272d0b3fa82?w=800' }],
    isMyEvent: false,
  },
  {
    _id: 'event-4',
    title: 'Saturday Soccer Scrimmage',
    sport: 'Soccer',
    description: 'Friendly 7v7, bring your own cleats.',
    location: { address: 'Greenfield Sports Complex', coordinates: [-122.40, 37.75] },
    startTime: hoursFromNow(90),
    maxParticipants: 14,
    acceptedCount: 9,
    organizer: mockUser,
    photos: [{ url: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800' }],
    isMyEvent: true,
  },
];

export const mockPrivateConnections = [
  {
    _id: 'conn-1',
    otherUser: { _id: 'u-2', name: 'Sam Taylor', photos: [{ url: 'https://i.pravatar.cc/600?img=5' }] },
    lastMessage: { text: 'See you at the courts!', createdAt: daysAgo(0.1) },
    unreadCount: 2,
    createdAt: daysAgo(5),
  },
  {
    _id: 'conn-2',
    otherUser: { _id: 'u-3', name: 'Priya Nair', photos: [{ url: 'https://i.pravatar.cc/600?img=9' }] },
    lastMessage: { text: 'That trail run was great', createdAt: daysAgo(1) },
    unreadCount: 0,
    createdAt: daysAgo(10),
  },
];

export const mockEventParticipations = [
  { _id: 'part-1', event: mockEvents[0], lastMessage: { text: 'Who else is in?', createdAt: daysAgo(0.2) }, unreadCount: 1, createdAt: daysAgo(2) },
  { _id: 'part-2', event: mockEvents[1], lastMessage: { text: 'Meeting at the trailhead at 7am', createdAt: daysAgo(0.5) }, unreadCount: 0, createdAt: daysAgo(3) },
];

export const mockGroupParticipations = [
  { _id: 'grp-1', event: mockEvents[3], lastMessage: { text: 'Bring extra water', createdAt: daysAgo(0.3) }, unreadCount: 0, createdAt: daysAgo(6) },
];

export const mockMessages = {
  'private/conn-1': [
    { _id: 'm1', text: 'Hey! Still on for Saturday?', user: { _id: 'u-2', name: 'Sam Taylor' }, createdAt: daysAgo(1) },
    { _id: 'm2', text: 'Yep, see you at 9!', user: { _id: 'user-1', name: 'Alex Morgan' }, createdAt: daysAgo(0.9) },
    { _id: 'm3', text: 'See you at the courts!', user: { _id: 'u-2', name: 'Sam Taylor' }, createdAt: daysAgo(0.1) },
  ],
  'event/event-1': [
    { _id: 'm4', text: 'Excited for tonight!', user: { _id: 'u-2', name: 'Sam Taylor' }, createdAt: daysAgo(0.3) },
    { _id: 'm5', text: 'Who else is in?', user: { _id: 'u-3', name: 'Priya Nair' }, createdAt: daysAgo(0.2) },
  ],
};

export const mockPendingApplicants = [
  { _id: 'app-1', name: 'Chris Bell', photos: [{ url: 'https://i.pravatar.cc/600?img=15' }] },
  { _id: 'app-2', name: 'Devon Ray', photos: [{ url: 'https://i.pravatar.cc/600?img=22' }] },
];
