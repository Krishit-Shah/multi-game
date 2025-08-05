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

  const fetchRoom = useCallback(async () => {
    try {
      console.log('Fetching room:', roomId);
      const response = await axios.get(`/api/rooms/${roomId}`);
      console.log('Room data received:', response.data);
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

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (socket && room && !hasJoined) {
      joinRoom(room.id);
      setHasJoined(true);
      
      const handleRoomUpdated = ({ room: updatedRoom }) => {
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

      socket.on('room-updated', handleRoomUpdated);
      socket.on('player-ready-toggled', handlePlayerReadyToggled);
      socket.on('game-started', handleGameStarted);
      socket.on('room-destroyed', handleRoomDestroyed);

      return () => {
        socket.off('room-updated', handleRoomUpdated);
        socket.off('player-ready-toggled', handlePlayerReadyToggled);
        socket.off('game-started', handleGameStarted);
        socket.off('room-destroyed', handleRoomDestroyed);
      };
    }
  }, [socket, room, roomId, navigate, joinRoom, hasJoined]);

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
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>{room.name}</h2>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={handleLeaveRoom}>
              Leave Room
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