import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth, TOKEN_STORAGE_KEY } from './AuthContext';
import type { Shipment } from '../types/shipment';
import type { AppNotification } from '../types/notification';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000');

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const socket = io(SOCKET_URL, { auth: { token }, withCredentials: true });
    socketRef.current = socket;

    socket.on('shipment:updated', (shipment: Shipment) => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipment', shipment._id] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    });

    socket.on('notification:new', (notification: AppNotification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast(notification.message, { icon: '📦' });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, queryClient]);

  return <SocketContext.Provider value={socketRef.current}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
