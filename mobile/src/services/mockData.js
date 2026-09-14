// mobile/src/services/mockData.js
// Fixture data for the standalone demo build (USE_MOCK_API=true).
// Field names mirror the real backend schema the screens expect.

const now = Date.now();
const hours = (h) => new Date(now + h * 60 * 60 * 1000).toISOString();
const minsAgo = (m) => new Date(now - m * 60 * 1000).toISOString();
const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();

const avatar = (n) => [{ _id: `p-${n}`, url: `https://i.pravatar.cc/600?img=${n}`, isPrimary: true }];

export const mockUser = {
  _id: 'user-1',
  id: 'user-1',
  name: 'Alex Morgan',
  email: 'demo@drpn.app',
  bio: 'Weekend warrior. Always up for pickup basketball or a trail run.',
  birthDate: '1996-04-18T00:00:00.000Z',
  isOrganizer: true,
  isVerified: true,
  rating: 4.8,
  searchRadius: 25,
  photos: [
    { _id: 'photo-1', url: 'https://i.pravatar.cc/600?img=12', isPrimary: true },
    { _id: 'photo-2', url: 'https://i.pravatar.cc/600?img=13', isPrimary: false },
  ],
  interests: ['sports', 'health', 'cards'],
  createdAt: daysAgo(200),
};

export const mockToken = 'demo-mock-token';

export const people = {
  jamie: { _id: 'u-jamie', name: 'Jamie Rivera', bio: 'Runs the Tuesday/Thursday hoops crew.', photos: avatar(32), rating: 4.9, eventsOrganized: ['a', 'b', 'c'] },
  sam: { _id: 'u-sam', name: 'Sam Taylor', bio: 'Magic judge, board game hoarder.', photos: avatar(5), rating: 4.7, eventsOrganized: ['a'] },
  priya: { _id: 'u-priya', name: 'Priya Nair', bio: 'Yoga instructor, trail runner.', photos: avatar(9), rating: 5.0, eventsOrganized: ['a', 'b'] },
  marcus: { _id: 'u-marcus', name: 'Marcus Chen', bio: 'Golf 9 handicap, fantasy commissioner.', photos: avatar(60), rating: 4.6, eventsOrganized: ['a', 'b'] },
  dana: { _id: 'u-dana', name: 'Dana Brooks', bio: 'Catan evangelist.', photos: avatar(45), rating: 4.8, eventsOrganized: ['a'] },
  chris: { _id: 'u-chris', name: 'Chris Bell', bio: 'New to the area, looking for pickup games.', photos: avatar(15) },
  devon: { _id: 'u-devon', name: 'Devon Ray', bio: 'Point guard, will travel.', photos: avatar(22) },
  nina: { _id: 'u-nina', name: 'Nina Okafor', bio: 'Half marathon in training.', photos: avatar(47) },
};

const loc = (address, city, state) => ({ address, city, state, coordinates: [-122.42, 37.77] });

export const mockEvents = [
  {
    _id: 'event-1',
    name: 'Sunset Pickup Basketball',
    type: 'event',
    category: 'sports',
    description: 'Casual 5-on-5 at the park courts. All skill levels welcome — we run games to 11, winners stay on.',
    location: loc('Riverside Park Courts', 'Austin', 'TX'),
    eventDate: hours(20),
    capacity: 10,
    currentAttendees: 6,
    organizer: people.jamie,
    photos: [],
    inviteCode: 'HOOP24',
    isArchived: false,
  },
  {
    _id: 'event-2',
    name: 'Saturday Morning Golf Scramble',
    type: 'event',
    category: 'golf',
    description: 'Four-person scramble, 18 holes with carts. Prize for closest to the pin.',
    location: loc('Oakwood Golf Club', 'Austin', 'TX'),
    eventDate: hours(44),
    capacity: 8,
    currentAttendees: 5,
    organizer: people.marcus,
    photos: [],
    inviteCode: 'GOLF88',
    isArchived: false,
  },
  {
    _id: 'event-3',
    name: 'Sunrise Yoga & Mobility',
    type: 'event',
    category: 'health',
    description: 'Gentle 60-minute flow on the lawn, mats provided. Coffee after for anyone who wants to stick around.',
    location: loc('Zilker Green', 'Austin', 'TX'),
    eventDate: hours(30),
    capacity: 15,
    currentAttendees: 11,
    organizer: people.priya,
    photos: [],
    inviteCode: 'FLOW01',
    isArchived: false,
  },
  {
    _id: 'event-4',
    name: 'Commander Night: Modern Horizons',
    type: 'event',
    category: 'cards',
    description: 'Four-pod Commander night at the shop. Bring two decks, power level 6-7.',
    location: loc('The Game Vault', 'Austin', 'TX'),
    eventDate: hours(68),
    capacity: 8,
    currentAttendees: 4,
    organizer: people.sam,
    photos: [],
    inviteCode: 'EDH777',
    isArchived: false,
  },
  {
    _id: 'group-1',
    name: 'Catan League Night',
    type: 'group',
    category: 'tabletop',
    description: 'Ongoing Catan league — we track standings across the season and rotate host houses.',
    location: loc('Rotating — East Austin', 'Austin', 'TX'),
    meetingFrequency: 'weekly',
    groupSize: 6,
    currentMembers: 5,
    organizer: people.dana,
    photos: [],
    inviteCode: 'CATAN5',
    isArchived: false,
  },
  {
    _id: 'group-2',
    name: 'Fantasy Football Dynasty League',
    type: 'group',
    category: 'fantasy',
    description: '12-team dynasty, superflex, full PPR. Two open spots for next season.',
    location: loc('Online + draft day in person', 'Austin', 'TX'),
    meetingFrequency: 'monthly',
    groupSize: 12,
    currentMembers: 10,
    organizer: people.marcus,
    photos: [],
    inviteCode: 'DYN212',
    isArchived: false,
  },
];

const applicant = (id, person, status, offsetDays) => ({
  _id: id,
  userId: person,
  status,
  appliedAt: daysAgo(offsetDays),
  respondedAt: status === 'pending' ? null : daysAgo(offsetDays - 0.5),
  application: status === 'pending' ? 'Played college club ball, can bring a ball and pump.' : null,
});

export const myEvents = [
  {
    _id: 'my-event-1',
    name: 'Thursday Night 7v7 Soccer',
    type: 'event',
    category: 'sports',
    description: 'Friendly 7v7 on the turf field. Bring a light and dark shirt, cleats required.',
    location: loc('Greenfield Sports Complex', 'Austin', 'TX'),
    eventDate: hours(90),
    capacity: 14,
    currentAttendees: 9,
    organizer: mockUser,
    photos: [],
    inviteCode: 'SOC7V7',
    isArchived: false,
    applicants: [
      applicant('app-1', people.chris, 'pending', 1),
      applicant('app-2', people.devon, 'pending', 2),
      applicant('app-3', people.nina, 'accepted', 4),
      applicant('app-4', people.sam, 'accepted', 5),
    ],
  },
  {
    _id: 'my-group-1',
    name: 'Weekend Trail Running Crew',
    type: 'group',
    category: 'health',
    description: 'Saturday long runs, 6-10 miles at conversational pace. Coffee is mandatory, the run is optional.',
    location: loc('Ridgeline Trailhead', 'Austin', 'TX'),
    meetingFrequency: 'weekly',
    groupSize: 20,
    currentMembers: 12,
    organizer: mockUser,
    photos: [],
    inviteCode: 'TRAIL9',
    isArchived: false,
    applicants: [applicant('app-5', people.chris, 'accepted', 8)],
  },
];

export const allEvents = [...mockEvents, ...myEvents];

export const mockPrivateConnections = [
  {
    _id: 'conn-1',
    otherUser: people.sam,
    lastMessage: { text: 'See you at the courts!', createdAt: minsAgo(8) },
    unreadCount: 2,
    createdAt: daysAgo(5),
  },
  {
    _id: 'conn-2',
    otherUser: people.priya,
    lastMessage: { text: 'That trail run wrecked me in the best way', createdAt: minsAgo(140) },
    unreadCount: 0,
    createdAt: daysAgo(10),
  },
  {
    _id: 'conn-3',
    otherUser: people.marcus,
    lastMessage: { text: 'I can grab the tee time if you can get the fourth', createdAt: daysAgo(1) },
    unreadCount: 1,
    createdAt: daysAgo(14),
  },
  {
    _id: 'conn-4',
    otherUser: people.nina,
    lastMessage: { text: 'Are you doing the half in October?', createdAt: daysAgo(2) },
    unreadCount: 0,
    createdAt: daysAgo(20),
  },
  {
    _id: 'conn-5',
    otherUser: people.dana,
    lastMessage: { text: 'Brought the expansion, we can do 6 players now', createdAt: daysAgo(4) },
    unreadCount: 0,
    createdAt: daysAgo(30),
  },
];

const participation = (id, event, text, sender, when, unread) => ({
  _id: id,
  event,
  lastMessage: { text, sender, createdAt: when },
  unreadCount: unread,
  joinedAt: daysAgo(6),
});

export const mockEventParticipations = [
  participation('part-1', mockEvents[0], 'Who else is bringing a ball tonight?', people.priya, minsAgo(25), 3),
  participation('part-2', myEvents[0], 'Field 3 is confirmed, gate code is 4412', mockUser, minsAgo(95), 0),
  participation('part-3', mockEvents[2], 'Mats are provided but bring a towel', people.priya, daysAgo(1), 0),
  participation('part-4', mockEvents[1], 'Tee time moved up to 8:10am', people.marcus, daysAgo(2), 1),
];

export const mockGroupParticipations = [
  participation('grp-1', mockEvents[4], 'Standings are updated — Dana still undefeated', people.dana, minsAgo(50), 2),
  participation('grp-2', myEvents[1], 'Sunday route: 8 miles, meet at the trailhead', mockUser, daysAgo(1), 0),
  participation('grp-3', mockEvents[5], 'Two dynasty spots still open for next season', people.marcus, daysAgo(3), 0),
];

const msg = (id, sender, text, createdAt) => ({ _id: id, sender, text, createdAt });

export const mockMessages = {
  // Private (iPhone Messages style — one-on-one, back and forth)
  'private/conn-1': [
    msg('pm1', people.sam, 'Hey! Are you playing tonight?', minsAgo(220)),
    msg('pm2', mockUser, 'Planning on it, what time does it usually fill up?', minsAgo(215)),
    msg('pm3', people.sam, 'Around 6:30. If you get there by 6:15 you get the first game', minsAgo(212)),
    msg('pm4', people.sam, 'I can save you a spot on my team', minsAgo(211)),
    msg('pm5', mockUser, 'Perfect, I owe you one', minsAgo(90)),
    msg('pm6', people.sam, 'Just bring a light and dark shirt', minsAgo(12)),
    msg('pm7', people.sam, 'See you at the courts!', minsAgo(8)),
  ],
  'private/conn-2': [
    msg('pm8', people.priya, 'Great pace this morning', minsAgo(180)),
    msg('pm9', mockUser, 'You were flying up that last hill, I could not hang', minsAgo(160)),
    msg('pm10', people.priya, 'Ha! I just know where the flat parts are', minsAgo(150)),
    msg('pm11', people.priya, 'That trail run wrecked me in the best way', minsAgo(140)),
  ],
  'private/conn-3': [
    msg('pm12', people.marcus, 'Saturday still good for you?', daysAgo(1.2)),
    msg('pm13', mockUser, 'Yep, what time are we thinking?', daysAgo(1.1)),
    msg('pm14', people.marcus, 'I can grab the tee time if you can get the fourth', daysAgo(1)),
  ],
  'private/conn-4': [
    msg('pm15', people.nina, 'Are you doing the half in October?', daysAgo(2)),
  ],
  'private/conn-5': [
    msg('pm16', mockUser, 'How many can we fit at the table?', daysAgo(4.2)),
    msg('pm17', people.dana, 'Brought the expansion, we can do 6 players now', daysAgo(4)),
  ],

  // Event / group (Discord style — many voices in one room)
  'event/event-1': [
    msg('em1', people.jamie, 'Courts are ours from 6 tonight. Gate is unlocked.', minsAgo(300)),
    msg('em2', people.sam, 'I can bring two balls and a pump', minsAgo(280)),
    msg('em3', people.chris, 'First time joining — is it competitive or casual?', minsAgo(200)),
    msg('em4', people.jamie, 'Mix of both. Everyone gets run, nobody is keeping stats.', minsAgo(190)),
    msg('em5', mockUser, 'I will be there around 6:15', minsAgo(120)),
    msg('em6', people.devon, 'Same, coming straight from work', minsAgo(60)),
    msg('em7', people.priya, 'Who else is bringing a ball tonight?', minsAgo(25)),
  ],
  'event/my-event-1': [
    msg('em8', mockUser, 'Turf is booked for Thursday 7pm. Field 3.', daysAgo(2)),
    msg('em9', people.nina, 'Do we need our own goalie?', daysAgo(1.5)),
    msg('em10', mockUser, 'We rotate — everyone takes 10 minutes in net', daysAgo(1.4)),
    msg('em11', people.sam, 'Cleats required or turf shoes ok?', minsAgo(200)),
    msg('em12', mockUser, 'Field 3 is confirmed, gate code is 4412', minsAgo(95)),
  ],
  'event/event-3': [
    msg('em13', people.priya, 'Starting at 7am sharp on the lawn', daysAgo(1.2)),
    msg('em14', people.nina, 'Is it beginner friendly?', daysAgo(1.1)),
    msg('em15', people.priya, 'Mats are provided but bring a towel', daysAgo(1)),
  ],
  'event/event-2': [
    msg('em16', people.marcus, 'Carts are booked for all four of us', daysAgo(2.5)),
    msg('em17', people.marcus, 'Tee time moved up to 8:10am', daysAgo(2)),
  ],
  'event/group-1': [
    msg('gm1', people.dana, 'Week 6 results are in', minsAgo(120)),
    msg('gm2', people.sam, 'I demand a recount', minsAgo(100)),
    msg('gm3', people.dana, 'Standings are updated — Dana still undefeated', minsAgo(50)),
  ],
  'event/my-group-1': [
    msg('gm4', mockUser, 'Sunday route: 8 miles, meet at the trailhead', daysAgo(1)),
    msg('gm5', people.chris, 'I might cut off at 5, still in?', daysAgo(0.9)),
    msg('gm6', mockUser, 'Always. Run your own run.', daysAgo(0.8)),
  ],
  'event/group-2': [
    msg('gm7', people.marcus, 'Two dynasty spots still open for next season', daysAgo(3)),
  ],
};
