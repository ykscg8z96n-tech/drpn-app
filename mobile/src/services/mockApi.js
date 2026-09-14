// mobile/src/services/mockApi.js
// Wires axios-mock-adapter onto the shared `api` instance so the app can
// run as a standalone demo with no live backend.
import MockAdapter from 'axios-mock-adapter';
import {
  mockUser,
  mockToken,
  mockEvents,
  mockPrivateConnections,
  mockEventParticipations,
  mockGroupParticipations,
  mockMessages,
  mockPendingApplicants,
} from './mockData';

const ok = (data) => [200, { success: true, data }];

export function installMockApi(api) {
  const mock = new MockAdapter(api, { delayResponse: 400 });

  mock.onPost('/auth/login').reply(() => [200, { success: true, token: mockToken, user: mockUser }]);
  mock.onPost('/auth/register').reply(() => [200, { success: true, token: mockToken, user: mockUser }]);

  mock.onGet('/users/profile').reply(() => ok(mockUser));
  mock.onPut('/users/profile').reply((config) => {
    const updates = JSON.parse(config.data || '{}');
    return ok({ ...mockUser, ...updates });
  });
  mock.onPut('/users/become-organizer').reply(() => ok({ ...mockUser, isOrganizer: true }));
  mock.onPost('/users/photos').reply(() => ok(mockUser.photos));
  mock.onPut(/\/users\/photos\/.+\/primary/).reply(() => ok(mockUser.photos));
  mock.onDelete(/\/users\/photos\/.+/).reply(() => ok(mockUser.photos));
  mock.onGet(/\/users\/(?!profile)[\w-]+$/).reply(() => ok(mockUser));
  mock.onPost('/users/swipe').reply(() => ok({ matched: false }));

  mock.onGet('/events/nearby').reply(() => ok(mockEvents.filter((e) => !e.isMyEvent)));
  mock.onGet('/events/organizer/my-events').reply(() => ok(mockEvents.filter((e) => e.isMyEvent)));
  mock.onGet('/events/my-participation').reply(() => ok(mockEventParticipations));
  mock.onPost('/events/join-by-code').reply(() => ok(mockEvents[0]));
  mock.onPost('/events').reply((config) => {
    const body = JSON.parse(config.data || '{}');
    return ok({ _id: `event-${Date.now()}`, isMyEvent: true, acceptedCount: 0, organizer: mockUser, ...body });
  });
  mock.onGet(/\/events\/[\w-]+$/).reply((config) => {
    const id = config.url.split('/').pop();
    return ok(mockEvents.find((e) => e._id === id) || mockEvents[0]);
  });
  mock.onPut(/\/events\/[\w-]+$/).reply((config) => {
    const id = config.url.split('/')[2];
    const body = JSON.parse(config.data || '{}');
    return ok({ ...(mockEvents.find((e) => e._id === id) || mockEvents[0]), ...body });
  });
  mock.onDelete(/\/events\/[\w-]+$/).reply(() => ok({ deleted: true }));
  mock.onPost(/\/events\/[\w-]+\/decide/).reply(() => ok({ decided: true }));
  mock.onPost(/\/events\/[\w-]+\/photos/).reply(() => ok(mockEvents[0].photos));
  mock.onDelete(/\/events\/[\w-]+\/photos\/[\w-]+/).reply(() => ok(mockEvents[0].photos));

  mock.onGet('/private-connections').reply(() => ok(mockPrivateConnections));
  mock.onPost('/connections/invite').reply(() => ok({ requested: true }));

  mock.onGet(/\/participations\?type=event/).reply(() => ok(mockEventParticipations));
  mock.onGet(/\/participations\?type=group/).reply(() => ok(mockGroupParticipations));

  mock.onGet(/\/messages\/(private|event)\/[\w-]+/).reply((config) => {
    const match = config.url.match(/\/messages\/(private|event)\/([\w-]+)/);
    const key = `${match[1]}/${match[2]}`;
    return ok(mockMessages[key] || []);
  });
  mock.onPost('/messages').reply((config) => {
    const body = JSON.parse(config.data || '{}');
    return ok({ _id: `m-${Date.now()}`, createdAt: new Date().toISOString(), user: mockUser, ...body });
  });

  mock.onAny(/\/events\/.*pending|applicants/).reply(() => ok(mockPendingApplicants));

  mock.onAny().reply((config) => {
    console.warn('[mockApi] Unhandled request, returning empty success:', config.method, config.url);
    return ok(null);
  });
}
