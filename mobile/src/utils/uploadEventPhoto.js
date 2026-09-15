// mobile/src/utils/uploadEventPhoto.js
//
// Uploads a locally-picked image as an event/group's custom photo. Needs
// a real event id, so this only runs after create/update succeeds -
// there's no "upload with the create request" path since the backend
// only accepts multipart files, not the JSON body the rest of the form
// uses.
import { Platform } from 'react-native';
import api from '../services/api';

export async function uploadEventPhoto(eventId, imageUri) {
  if (!imageUri) return;

  const formData = new FormData();
  if (Platform.OS === 'web') {
    // Browsers require an actual Blob/File on FormData - the
    // {uri,type,name} object below is a React Native-only convention
    // that silently stringifies to "[object Object]" on web.
    const fetchResponse = await fetch(imageUri);
    const blob = await fetchResponse.blob();
    formData.append('photos', blob, 'event_photo.jpg');
  } else {
    formData.append('photos', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'event_photo.jpg',
    });
  }

  await api.post(`/events/${eventId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
