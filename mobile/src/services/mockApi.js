// mobile/src/services/mockApi.js
// Wires axios-mock-adapter onto the shared `api` instance so the app can
// run as a standalone demo with no live backend.
import MockAdapter from 'axios-mock-adapter';
import {
  mockUser,
  mockToken,
  mockEvents,
  myEvents,
  allEvents,
  mockPrivateConnections,
  mockEventParticipations,
  mockGroupParticipations,
  mockMessages,
} from './mockData';

const ok = (data) => [200, { success: true, data }];
const findEvent = (id) => allEvents.find((e) => e._id === id) || allEvents[0];

export function installMockApi(api) {
  const mock = new MockAdapter(api, { delayResponse: 350 });

  mock.onPost('/auth/login').reply(200, { success: true, token: mockToken, user: mockUser });
  mock.onPost('/auth/register').reply(200, { success: true, token: mockToken, user: mockUser });

  mock.onGet('/users/profile').reply(() => ok(mockUser));
  mock.onPut('/users/profile').reply((config) => ok({ ...mockUser, ...JSON.parse(config.data || '{}') }));
  mock.onPut('/users/become-organizer').reply(() => ok({ ...mockUser, isOrganizer: true }));
  mock.onPost('/users/photos').reply(() => ok(mockUser.photos));
  mock.onPut(/\/users\/photos\/[\w-]+\/primary$/).reply(() => ok(mockUser.photos));
  mock.onDelete(/\/users\/photos\/[\w-]+$/).reply(() => ok(mockUser.photos));
  mock.onPost('/users/swipe').reply(() => ok({ matched: false }));
  mock.onGet(/\/users\/(?!profile)[\w-]+$/).reply(() => ok(mockUser));

  mock.onGet('/events/nearby').reply(() => ok(mockEvents));
  mock.onGet('/events/organizer/my-events').reply(() => ok(myEvents));
  mock.onGet('/events/my-participation').reply(() => ok(mockEventParticipations));
  mock.onPost('/events/join-by-code').reply((config) => {
    const { code } = JSON.parse(config.data || '{}');
    const match = allEvents.find((e) => e.inviteCode === String(code).toUpperCase());
    return match ? ok(match) : [404, { success: false, message: 'No event found with that invite code.' }];
  });
  mock.onPost('/events').reply((config) => {
    const body = JSON.parse(config.data || '{}');
    return ok({ _id: `event-${Date.now()}`, organizer: mockUser, photos: [], applicants: [], currentAttendees: 0, currentMembers: 0, isArchived: false, ...body });
  });
  mock.onPost(/\/events\/[\w-]+\/decide$/).reply(() => ok({ decided: true }));
  mock.onPost(/\/events\/[\w-]+\/photos$/).reply(() => ok([]));
  mock.onDelete(/\/events\/[\w-]+\/photos\/[\w-]+$/).reply(() => ok([]));
  mock.onGet(/\/events\/[\w-]+$/).reply((config) => ok(findEvent(config.url.split('/').pop())));
  mock.onPut(/\/events\/[\w-]+$/).reply((config) => {
    const event = findEvent(config.url.split('/').pop());
    return ok({ ...event, ...JSON.parse(config.data || '{}') });
  });
  mock.onDelete(/\/events\/[\w-]+$/).reply(() => ok({ archived: true }));

  mock.onGet('/private-connections').reply(() => ok(mockPrivateConnections));
  mock.onPost('/connections/invite').reply(() => ok({ requested: true }));

  mock.onGet(/\/participations\?type=group/).reply(() => ok(mockGroupParticipations));
  mock.onGet(/\/participations/).reply(() => ok(mockEventParticipations));

  mock.onGet(/\/messages\/(private|event)\/[\w-]+$/).reply((config) => {
    const [, kind, id] = config.url.match(/\/messages\/(private|event)\/([\w-]+)$/);
    return ok(mockMessages[`${kind}/${id}`] || []);
  });
  mock.onPost('/messages').reply((config) => {
    const body = JSON.parse(config.data || '{}');
    return ok({ _id: `m-${Date.now()}`, createdAt: new Date().toISOString(), sender: mockUser, ...body });
  });

  mock.onAny().reply((config) => {
    console.warn('[mockApi] Unhandled request:', config.method, config.url);
    return ok(null);
  });
}
