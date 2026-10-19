import axios from 'axios';

// The hosted build is served by the API itself, so it talks to its own address.
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

export function getAuthToken() {
  return authToken;
}

/**
 * A session the server no longer accepts - expired, or ended by a password change or
 * "sign out everywhere" - drops everything saved in this browser and goes to sign-in.
 * (A wrong password on the sign-in or password forms is handled by those forms, and the
 * start-up session check by AuthContext - so a public tracking page never redirects.)
 */
apiClient.interceptors.response.use(undefined, (error) => {
  const url = String(error?.config?.url || '');
  if (error?.response?.status === 401 && authToken && !/\/auth\/(login|register|password|me)/.test(url)) {
    setAuthToken(null);
    try {
      localStorage.removeItem('lt_token');
      localStorage.removeItem('lt_user');
      Object.keys(localStorage)
        .filter((k) => k.startsWith('th.cache.'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // storage blocked - nothing saved to clear
    }
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
  }
  return Promise.reject(error);
});

/**
 * "Who's making changes on this device" - several people share one sign-in, so stock
 * changes carry the person's own name (remembered per browser) and the history credits
 * them, not the shared account. URL-encoded so Hindi names travel safely in a header.
 */
const ACTOR_KEY = 'th.actor';

export function getActorName(): string {
  try {
    return localStorage.getItem(ACTOR_KEY) || '';
  } catch {
    return '';
  }
}

export function setActorName(name: string) {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  try {
    if (clean) localStorage.setItem(ACTOR_KEY, clean);
    else localStorage.removeItem(ACTOR_KEY);
  } catch {
    // not remembered - still used for this visit
  }
  if (clean) apiClient.defaults.headers.common['X-Actor'] = encodeURIComponent(clean);
  else delete apiClient.defaults.headers.common['X-Actor'];
  return clean;
}

setActorName(getActorName());
