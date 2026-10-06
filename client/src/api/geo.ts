import { apiClient } from './client';

export interface PincodeInfo {
  pincode: string;
  city: string;
  state: string;
  areas: string[];
}

export const geoApi = {
  /** India Post lookup, proxied (and cached) by our server. */
  pincode: (pincode: string) => apiClient.get<PincodeInfo>(`/geo/pincode/${pincode}`).then((r) => r.data),
};
