import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const Dashboard = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    gameType: 'tic-tac-toe',
    isPublic: true
  });
  const navigate = useNavigate();
  const { updateCurrentRoom } = useAuth();

  const fetchPublicRooms = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/rooms/public');
      setRooms(response.data.rooms);
    } catch (error) {
      setError('Failed to fetch rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPublicRooms();
    
    // Refresh rooms every 10 seconds
    const interval = setInterval(fetchPublicRooms, 10000);
    return () => clearInterval(interval);
  }, [fetchPublicRooms]);

  const handleCreateRoom = useCallback(async (e) => {
    e.preventDefault();
    try {
      setError(''); // Clear previous errors
      const response = await axios.post('/api/rooms/create', createForm);
      updateCurrentRoom(response.data.room.id);
      navigate(`/room/${response.data.room.id}`);
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to create room');
    }
  }, [createForm, navigate, updateCurrentRoom]);

  const handleJoinRoom = useCallback(async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    try {
      setError(''); // Clear previous errors
      const response = await axios.post(`/api/rooms/join/${joinCode.trim()}`);
      updateCurrentRoom(response.data.room.id);
      navigate(`/room/${response.data.room.id}`);
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to join room');
    }
  }, [joinCode, navigate, updateCurrentRoom]);

  const handleJoinPublicRoom = useCallback(async (roomCode) => {
    try {
      setError(''); // Clear previous errors
      const response = await axios.post(`/api/rooms/join/${roomCode}`);
      updateCurrentRoom(response.data.room.id);
      navigate(`/room/${response.data.room.id}`);
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to join room');
    }
  }, [navigate, updateCurrentRoom]);

  const handleCancelCreate = useCallback(() => {
    setShowCreateForm(false);
    setCreateForm({
      name: '',
      gameType: 'tic-tac-toe',
      isPublic: true
    });
    setError(''); // Clear errors when canceling
  }, []);

  if (loading) {
    return <div className="loading">Loading rooms...</div>;
  }

  return (
    <div>
      <h1 style={{ textAlign: 'center', marginBottom: '32px', color: 'white' }}>
        Welcome to the Game Platform!
      </h1>

      {error && (
        <div className="alert alert-danger">
          {error}
          <button 
            onClick={() => setError('')} 
            style={{ float: 'right', background: 'none', border: 'none', color: 'inherit' }}
          >
            ×
          </button>
        </div>
      )}

      <div className="game-grid">
        {/* Create Room Card */}
        <div className="card">
          <h3>Create a New Room</h3>
          <p>Start a new game with your friends</p>
          
          {!showCreateForm ? (
            <button 
              className="btn" 
              onClick={() => setShowCreateForm(true)}
            >
              Create Room
            </button>
          ) : (
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label htmlFor="roomName">Room Name</label>
                <input
                  type="text"
                  id="roomName"
                  className="form-control"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="gameType">Game Type</label>
                <select
                  id="gameType"
                  className="form-control"
                  value={createForm.gameType}
                  onChange={(e) => setCreateForm({...createForm, gameType: e.target.value})}
                >
                  <option value="tic-tac-toe">Tic Tac Toe (2 players)</option>
                  <option value="quiz">Quiz (4 players)</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={createForm.isPublic}
                    onChange={(e) => setCreateForm({...createForm, isPublic: e.target.checked})}
                  />
                  Public Room
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn">
                  Create Room
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={handleCancelCreate}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Join Room Card */}
        <div className="card">
          <h3>Join by Code</h3>
          <p>Enter a room code to join a private game</p>
          
          <form onSubmit={handleJoinRoom}>
            <div className="form-group">
              <input
                type="text"
                className="form-control"
                placeholder="Enter room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength="6"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <button type="submit" className="btn" disabled={!joinCode.trim()}>
              Join Room
            </button>
          </form>
        </div>
      </div>

      {/* Public Rooms */}
      <div className="card">
        <h3>Public Rooms ({rooms.length})</h3>
        <p>Join an open game</p>
        
        {rooms.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666' }}>
            No public rooms available. Create one to get started!
          </p>
        ) : (
          <div className="game-grid">
            {rooms.map(room => (
              <div key={room.id} className="room-card">
                <h4>{room.name}</h4>
                <p>Game: {room.gameType === 'tic-tac-toe' ? 'Tic Tac Toe' : 'Quiz'}</p>
                <p>Host: {room.host}</p>
                <p>Players: {room.playerCount}/{room.maxPlayers}</p>
                <p>Code: {room.code}</p>
                
                <button
                  className="btn"
                  onClick={() => handleJoinPublicRoom(room.code)}
                  disabled={room.isFull}
                >
                  {room.isFull ? 'Room Full' : 'Join Room'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard; 