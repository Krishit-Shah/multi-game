import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user, clearAuth } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (user && !socketRef.current) {
      const token = sessionStorage.getItem('token');
      const newSocket = io('http://localhost:5000', {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        timeout: 10000,
        forceNew: false
      });

      newSocket.on('connect', () => {
        console.log('Connected to server');
        setIsConnected(true);
        // Try to rejoin current room if user was in one
        newSocket.emit('join-current-room');
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from server');
        setIsConnected(false);
      });

      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
        if (error.message === 'Authentication error') {
          // Clear invalid token and user
          clearAuth();
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        if (error.message === 'Authentication error') {
          // Clear invalid token and user
          clearAuth();
        }
      });

      socketRef.current = newSocket;
      setSocket(newSocket);

      return () => {
        if (newSocket) {
          newSocket.close();
          socketRef.current = null;
        }
      };
    } else if (!user && socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    }
  }, [user, clearAuth]);

  const joinRoom = (roomId) => {
    if (socket && isConnected) {
      socket.emit('join-room', roomId);
    }
  };

  const leaveRoom = (roomId) => {
    if (socket && isConnected) {
      socket.emit('leave-room', roomId);
    }
  };

  const toggleReady = (roomId) => {
    if (socket && isConnected) {
      socket.emit('toggle-ready', roomId);
    }
  };

  const sendMessage = useCallback((roomId, content, messageType = 'chat') => {
    if (socket) {
      socket.emit('send-message', { roomId, content, messageType });
    }
  }, [socket]);

  const makeMove = (roomId, move) => {
    if (socket && isConnected) {
      socket.emit('game-move', { roomId, move });
    }
  };

  const restartGame = (roomId) => {
    if (socket && isConnected) {
      socket.emit('restart-game', roomId);
    }
  };

  const value = {
    socket,
    isConnected,
    joinRoom,
    leaveRoom,
    sendMessage,
    makeMove,
    restartGame,
    toggleReady
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}; 