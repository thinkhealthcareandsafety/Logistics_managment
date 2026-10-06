import { apiClient } from './client';
import type { User } from '../types/user';

export interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  register: (data: { name: string; email: string; password: string; company?: string }) =>
    apiClient.post<AuthResponse>('/auth/register', data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    apiClient.post<AuthResponse>('/auth/login', data).then((r) => r.data),

  logout: () => apiClient.post('/auth/logout').then((r) => r.data),

  me: () => apiClient.get<{ user: User }>('/auth/me').then((r) => r.data),
};
