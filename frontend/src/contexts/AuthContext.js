import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Set up axios interceptor to automatically add auth header per request
  useEffect(() => {
    // Request interceptor to add auth header to each request
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle JWT errors automatically
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Clear invalid token automatically
          localStorage.removeItem('token');
          setUser(null);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await axios.get('/api/auth/profile');
          const userData = response.data.user;
          setUser(userData);
          
          // If user has a current room, redirect to it
          if (userData.currentRoom && window.location.pathname === '/') {
            window.location.href = `/room/${userData.currentRoom}`;
          }
        } catch (error) {
          // Clear invalid token automatically
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
          setUser(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    try {
      setError('');
      const response = await axios.post('/api/auth/login', { email, password });
      const { token, user } = response.data;
      
      localStorage.setItem('token', token);
      setUser(user);
      return { success: true };
    } catch (error) {
      setError(error.response?.data?.message || 'Login failed');
      return { success: false, error: error.response?.data?.message || 'Login failed' };
    }
  };

  const register = async (username, email, password) => {
    try {
      setError('');
      const response = await axios.post('/api/auth/register', { username, email, password });
      const { token, user } = response.data;
      
      localStorage.setItem('token', token);
      setUser(user);
      return { success: true };
    } catch (error) {
      setError(error.response?.data?.message || 'Registration failed');
      return { success: false, error: error.response?.data?.message || 'Registration failed' };
    }
  };

  const logout = () => {
    // Clean up user's room before logout
    const cleanupUserRoom = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          // Leave current room if any
          await axios.post('/api/rooms/leave');
        }
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    };

    cleanupUserRoom();
    
    localStorage.removeItem('token');
    setUser(null);
    setError('');
  };

  const clearAuth = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const updateProfile = async (updates) => {
    try {
      const response = await axios.put('/api/auth/profile', updates);
      setUser(response.data.user);
      return { success: true };
    } catch (error) {
      setError(error.response?.data?.message || 'Profile update failed');
      return { success: false, error: error.response?.data?.message || 'Profile update failed' };
    }
  };

  const clearError = () => {
    setError('');
  };

  const updateCurrentRoom = (roomId) => {
    setUser(prev => prev ? { ...prev, currentRoom: roomId } : null);
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    clearAuth,
    updateProfile,
    clearError,
    updateCurrentRoom
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 