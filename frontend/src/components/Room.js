import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';
import Chat from './Chat';

const Room = () => {
  const { roomId } = useParams();
  const { user, updateCurrentRoom } = useAuth();
  const { socket, joinRoom, leaveRoom, toggleReady } = useSocket();
  const navigate = useNavigate();
  
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [showCountdown, setShowCountdown] = useState(false);

  const fetchRoom = useCallback(async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomId}`);
      setRoom(response.data.room);
    } catch (error) {
      console.error('Failed to load room:', error.response?.data || error.message);
      if (error.response?.status === 404) {
        setError('Room not found. It may have been deleted or you may not have access to it.');
      } else {
        setError(error.response?.data?.message || 'Failed to load room');
      }
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Setup socket event listeners first
  useEffect(() => {
    if (socket) {
      const handleRoomUpdated = ({ room: updatedRoom }) => {
        // Only log significant room updates
        if (!room || updatedRoom.gameState !== room.gameState || updatedRoom.players.length !== room.players.length) {
          console.log('Room updated:', { 
            gameState: updatedRoom.gameState, 
            players: updatedRoom.players.length 
          });
        }
        setRoom(updatedRoom);
      };

      const handlePlayerReadyToggled = ({ userId, isReady: readyStatus }) => {
        setRoom(prev => ({
          ...prev,
          players: prev.players.map(p => 
            p.user.id === userId ? { ...p, isReady: readyStatus } : p
          )
        }));
      };

      const handleGameStarted = ({ gameType, gameData }) => {
        navigate(`/game/${roomId}`);
      };

      const handleRoomDestroyed = () => {
        navigate('/dashboard');
      };

      const handlePlayerSocketConnected = ({ userId, username, room: updatedRoom }) => {
        setRoom(updatedRoom);
      };

      const handleCountdownUpdate = ({ countdown: countdownValue }) => {
        setCountdown(countdownValue);
        setShowCountdown(true);
      };

      const handleCountdownCancelled = () => {
        setCountdown(null);
        setShowCountdown(false);
      };

      const handleSocketConnect = () => {
        console.log('Socket reconnected');
        setSocketReady(true);
        // Refresh room data when socket reconnects
        fetchRoom();
      };

      const handleSocketDisconnect = () => {
        console.log('Socket disconnected');
        setSocketReady(false);
        setHasJoined(false);
      };

      // Set up all event listeners
      socket.on('room-updated', handleRoomUpdated);
      socket.on('player-ready-toggled', handlePlayerReadyToggled);
      socket.on('game-started', handleGameStarted);
      socket.on('room-destroyed', handleRoomDestroyed);
      socket.on('player-socket-connected', handlePlayerSocketConnected);
      socket.on('countdown-update', handleCountdownUpdate);
      socket.on('countdown-cancelled', handleCountdownCancelled);
      socket.on('connect', handleSocketConnect);
      socket.on('disconnect', handleSocketDisconnect);

      // Check if already connected
      if (socket.connected) {
        setSocketReady(true);
      }

      return () => {
        socket.off('room-updated', handleRoomUpdated);
        socket.off('player-ready-toggled', handlePlayerReadyToggled);
        socket.off('game-started', handleGameStarted);
        socket.off('room-destroyed', handleRoomDestroyed);
        socket.off('player-socket-connected', handlePlayerSocketConnected);
        socket.off('countdown-update', handleCountdownUpdate);
        socket.off('countdown-cancelled', handleCountdownCancelled);
        socket.off('connect', handleSocketConnect);
        socket.off('disconnect', handleSocketDisconnect);
      };
    }
  }, [socket, roomId, navigate, fetchRoom]);

  // Initial room fetch
  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  // Join socket room when both socket is ready and room data is loaded
  useEffect(() => {
    if (socketReady && room && !hasJoined) {
      joinRoom(room.id);
      setHasJoined(true);
    }
  }, [socketReady, room, joinRoom, hasJoined]);

  const handleLeaveRoom = useCallback(async () => {
    try {
      await axios.post('/api/rooms/leave');
      leaveRoom(roomId);
      updateCurrentRoom(null);
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to leave room');
    }
  }, [roomId, leaveRoom, navigate, updateCurrentRoom]);

  const handleToggleReady = useCallback(() => {
    toggleReady(roomId);
    setIsReady(!isReady);
  }, [roomId, toggleReady, isReady]);

  const handleStartGame = useCallback(() => {
    navigate(`/game/${roomId}`);
  }, [roomId, navigate]);

  const handleRefreshRoom = useCallback(() => {
    fetchRoom();
  }, [fetchRoom]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      // Don't leave room on component unmount - let the backend handle reconnection
      // This prevents issues with page refresh
    };
  }, []);

  if (loading) {
    return <div className="loading">Loading room...</div>;
  }

  if (error) {
    return (
      <div className="card">
        <div className="alert alert-danger">
          <h3>Error Loading Room</h3>
          <p>{error}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return <div className="loading">Room not found</div>;
  }

  // Handle host display - could be string or object
  const hostName = typeof room.host === 'string' ? room.host : room.host?.username || 'Unknown';
  const isHost = hostName === user.username;
  const allReady = room.players.every(p => p.isReady);
  const canStart = isHost && allReady && room.players.length >= 2;

  return (
    <div>
      {showCountdown && countdown !== null && (
        <div className="card" style={{ 
          backgroundColor: '#f8f9fa', 
          border: '2px solid #007bff', 
          marginBottom: '20px',
          textAlign: 'center',
          padding: '20px'
        }}>
          <h3 style={{ color: '#007bff', margin: '0' }}>
            Game starts in {countdown} second{countdown !== 1 ? 's' : ''}...
          </h3>
          <p style={{ margin: '10px 0 0 0', color: '#666' }}>
            Get ready! The game will begin automatically.
          </p>
        </div>
      )}
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>{room.name}</h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={handleLeaveRoom}>
              Leave Room
            </button>
            <button className="btn btn-outline" onClick={handleRefreshRoom} title="Refresh room data">
              🔄
            </button>
            {canStart && (
              <button className="btn btn-success" onClick={handleStartGame}>
                Start Game
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Room Info */}
          <div>
            <h3>Room Information</h3>
            <p><strong>Code:</strong> {room.code}</p>
            <p><strong>Game:</strong> {room.gameType === 'tic-tac-toe' ? 'Tic Tac Toe' : 'Quiz'}</p>
            <p><strong>Host:</strong> {hostName}</p>
            <p><strong>Players:</strong> {room.players.length}/{room.maxPlayers}</p>
            <p><strong>Status:</strong> {room.gameState}</p>
            <p><strong>Connection:</strong> 
              <span style={{ color: socketReady ? 'green' : 'red' }}>
                {socketReady ? '● Connected' : '● Disconnected'}
              </span>
              {hasJoined && <span style={{ color: 'blue', marginLeft: '8px' }}>✓ Joined</span>}
            </p>

            <div style={{ marginTop: '20px' }}>
              <h4>Players</h4>
              <div className="player-list">
                {room.players.map((player, index) => {
                  // Handle user object - could be string or object
                  const playerName = typeof player.user === 'string' 
                    ? player.user 
                    : player.user?.username || 'Unknown';
                  const playerId = typeof player.user === 'string' 
                    ? player.user 
                    : player.user?.id || player.user?._id || index;
                  
                  return (
                    <div key={playerId} className="player-tag">
                      {playerName}
                      {player.isReady && <span className="ready-indicator"> ✓</span>}
                      {!player.isReady && <span className="not-ready-indicator"> ⏳</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <button 
                className={`btn ${isReady ? 'btn-success' : 'btn-secondary'}`}
                onClick={handleToggleReady}
              >
                {isReady ? 'Ready ✓' : 'Not Ready'}
              </button>
            </div>
          </div>

          {/* Chat */}
          <div>
            <h3>Chat</h3>
            <Chat roomId={roomId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room; 