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

  /** Ends every other session too; returns this browser's new session. */
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiClient.post<AuthResponse>('/auth/password', data).then((r) => r.data),

  logoutEverywhere: () => apiClient.post<AuthResponse>('/auth/logout-everywhere').then((r) => r.data),
};

export interface ApiUsage {
  provider: 'gemini' | 'trackingmore' | 'whatsapp';
  name: string;
  used: number;
  limit: number;
  blocked: number;
  configured: boolean;
}

export const systemApi = {
  usage: () =>
    apiClient
      .get<{ apis: ApiUsage[]; whatsappMessages: { today: number; thisMonth: number; limits: { dailyLimit: number; monthlyLimit: number } } | null; signupEnabled: boolean }>('/system/usage')
      .then((r) => r.data),
};
