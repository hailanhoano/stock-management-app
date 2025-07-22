import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  recentChanges: any[];
  inventoryUpdates: any[];
  lastSyncTime: Date | null;
  syncStatus: 'syncing' | 'synced' | 'error' | 'unknown';
  connect: (token: string) => void;
  disconnect: () => void;
  updateSyncTime: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [recentChanges, setRecentChanges] = useState<any[]>([]);
  const [inventoryUpdates, setInventoryUpdates] = useState<any[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'error' | 'unknown'>('unknown');

  const connect = (token: string) => {
    if (socket) {
      console.log('Disconnecting existing socket...');
      socket.disconnect();
    }

    console.log('Connecting to WebSocket server...');
    const newSocket = io('http://localhost:3001', {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected successfully');
      setIsConnected(true);
      
      // Authenticate with the server
      console.log('Authenticating with server...');
      newSocket.emit('authenticate', { token });
    });

    newSocket.on('authenticated', (data) => {
      console.log('✅ WebSocket authenticated successfully:', data);
    });

    newSocket.on('auth_error', (error) => {
      console.error('❌ WebSocket authentication failed:', error);
      setIsConnected(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      setIsConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('🔄 WebSocket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('❌ WebSocket reconnection error:', error);
    });

    newSocket.on('inventory_update', (data) => {
      console.log('📦 Received inventory update:', data);
      // Only keep the latest update to prevent array growth
      setInventoryUpdates([data]);
    });

    newSocket.on('recent_changes', (data) => {
      console.log('📝 Received recent changes:', data);
      setRecentChanges(data.changes || []);
    });

    newSocket.on('user_activity', (data) => {
      console.log('👤 User activity:', data);
    });

    // Google Sheets sync status events
    newSocket.on('sheets_sync_start', () => {
      console.log('🔄 Google Sheets sync started');
      setSyncStatus('syncing');
    });

    newSocket.on('sheets_sync_success', (data) => {
      console.log('✅ Google Sheets sync successful:', data);
      setSyncStatus('synced');
      setLastSyncTime(new Date());
    });

    newSocket.on('sheets_sync_error', (error) => {
      console.error('❌ Google Sheets sync error:', error);
      setSyncStatus('error');
    });

    newSocket.on('sheets_sync_status', (data) => {
      console.log('📊 Google Sheets sync status:', data);
      if (data.lastSync) {
        setLastSyncTime(new Date(data.lastSync));
      }
      if (data.status) {
        setSyncStatus(data.status);
      }
    });

    setSocket(newSocket);
  };

  const disconnect = () => {
    if (socket) {
      console.log('Disconnecting WebSocket...');
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
      setRecentChanges([]);
      setInventoryUpdates([]);
      setLastSyncTime(null);
      setSyncStatus('unknown');
    }
  };

  const updateSyncTime = () => {
    console.log('🔄 updateSyncTime called - setting new sync time');
    setLastSyncTime(new Date());
    setSyncStatus('synced');
    console.log('✅ Sync time updated to:', new Date().toLocaleTimeString());
  };

  useEffect(() => {
    return () => {
      if (socket) {
        console.log('Cleaning up WebSocket connection...');
        socket.disconnect();
      }
    };
  }, [socket]);

  const value: WebSocketContextType = {
    socket,
    isConnected,
    recentChanges,
    inventoryUpdates,
    lastSyncTime,
    syncStatus,
    connect,
    disconnect,
    updateSyncTime
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}; 