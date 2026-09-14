// mobile/src/services/api.js
import axios from 'axios';
import config, { USE_MOCK_API } from '../utils/constants';

export const API_BASE_URL = config.SOCKET_URL;

const api = axios.create({
  baseURL: config.API_URL,
  timeout: 10000,
});

if (USE_MOCK_API) {
  // eslint-disable-next-line global-require
  const { installMockApi } = require('./mockApi');
  installMockApi(api);
}

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Token is set in AuthContext
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle token expiration
      // Could trigger a logout here
    }
    return Promise.reject(error);
  }
);

export default api;