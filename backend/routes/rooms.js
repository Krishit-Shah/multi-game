const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const User = require('../models/User');
const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`Auth middleware - User ${user.username} currentRoom:`, user.currentRoom);
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Create a new room
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { name, gameType, isPublic } = req.body;
    
    // Generate unique room code
    let code;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      attempts++;
      
      // Check if code already exists
      const existingRoom = await Room.findOne({ code });
      if (!existingRoom) break;
      
      if (attempts >= maxAttempts) {
        return res.status(500).json({ message: 'Failed to generate unique room code' });
      }
    } while (true);
    
    // Leave current room if user is in one
    if (req.user.currentRoom) {
      const currentRoom = await Room.findById(req.user.currentRoom);
      if (currentRoom) {
        // Remove user from current room
        currentRoom.players = currentRoom.players.filter(p => p.user.toString() !== req.user._id.toString());
        
        if (currentRoom.players.length === 0) {
          // Delete empty room
          await Room.findByIdAndDelete(currentRoom._id);
        } else {
          // Assign new host if needed
          if (currentRoom.host.toString() === req.user._id.toString()) {
            currentRoom.host = currentRoom.players[0].user;
          }
          await currentRoom.save();
        }
      }
    }
    
    const room = new Room({
      code,
      name,
      gameType,
      isPublic,
      host: req.user._id,
      players: [{
        user: req.user._id,
        isReady: false,
        score: 0
      }],
      gameState: 'waiting'
    });

        await room.save();
    
    // Update user's current room
    req.user.currentRoom = room._id;
    await req.user.save();

    // Populate the room data for response
    const populatedRoom = await Room.findById(room._id)
      .populate('host', 'username')
      .populate('players.user', 'username');

    console.log('Populated room data:', populatedRoom);

    res.status(201).json({
      message: 'Room created successfully',
      room: {
        id: populatedRoom._id,
        code: populatedRoom.code,
        name: populatedRoom.name,
        gameType: populatedRoom.gameType,
        isPublic: populatedRoom.isPublic,
        host: populatedRoom.host.username,
        players: populatedRoom.players.map(player => ({
          user: {
            id: player.user._id,
            username: player.user.username
          },
          isReady: player.isReady,
          score: player.score
        })),
        maxPlayers: populatedRoom.maxPlayers,
        gameState: populatedRoom.gameState
      }
    });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get public rooms
router.get('/public', async (req, res) => {
  try {
    const rooms = await Room.find({ 
      isPublic: true, 
      gameState: 'waiting',
      'players.0': { $exists: true } // Ensure room has at least one player
    })
    .populate('host', 'username')
    .populate('players.user', 'username')
    .sort({ createdAt: -1 })
    .limit(10);

    const formattedRooms = rooms.map(room => ({
      id: room._id,
      code: room.code,
      name: room.name,
      gameType: room.gameType,
      host: room.host.username,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      isFull: room.players.length >= room.maxPlayers
    }));

    res.json({ rooms: formattedRooms });
  } catch (error) {
    console.error('Get public rooms error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Debug endpoint to check if room exists (no auth required)
router.get('/debug/:roomId', async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (room) {
      res.json({ 
        exists: true, 
        roomId: room._id,
        name: room.name,
        players: room.players.length,
        gameState: room.gameState
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check room by code (no auth required)
router.get('/debug/code/:code', async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if (room) {
      res.json({ 
        exists: true, 
        roomId: room._id,
        code: room.code,
        name: room.name,
        players: room.players.length,
        gameState: room.gameState
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join room by code
router.post('/join/:code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.params;
    const roomCode = code.toUpperCase();
    
    // Check if user is already in a room with this code
    if (req.user.currentRoom) {
      const currentRoom = await Room.findById(req.user.currentRoom);
      if (currentRoom && currentRoom.code === roomCode) {
        // User is already in this room, just return the room data
        return res.json({
          message: 'Already in this room',
          room: {
            id: currentRoom._id,
            code: currentRoom.code,
            name: currentRoom.name,
            gameType: currentRoom.gameType,
            host: currentRoom.host.username,
            players: currentRoom.players.map(player => ({
              user: {
                id: player.user._id,
                username: player.user.username
              },
              isReady: player.isReady,
              score: player.score
            })),
            maxPlayers: currentRoom.maxPlayers,
            gameState: currentRoom.gameState,
            gameData: currentRoom.gameData
          }
        });
      }
    }

    // Find the room by code
    const room = await Room.findOne({ code: roomCode })
      .populate('host', 'username')
      .populate('players.user', 'username');

    if (!room) {
      console.log(`Room not found with code: ${roomCode}`);
      return res.status(404).json({ message: 'Room not found' });
    }

    console.log(`Found room: ${room.name} with ${room.players.length} players`);

    if (room.gameState !== 'waiting') {
      return res.status(400).json({ message: 'Game has already started' });
    }

    if (room.players.length >= room.maxPlayers) {
      return res.status(400).json({ message: 'Room is full' });
    }

    // Check if user is already in the room
    const existingPlayer = room.players.find(p => p.user._id.toString() === req.user._id.toString());
    if (existingPlayer) {
      return res.status(400).json({ message: 'You are already in this room' });
    }

    // Leave current room if user is in one
    if (req.user.currentRoom) {
      try {
        const currentRoom = await Room.findById(req.user.currentRoom);
        if (currentRoom && currentRoom._id.toString() !== room._id.toString()) {
          console.log(`User ${req.user.username} leaving current room to join new room`);
          // Remove user from current room
          currentRoom.players = currentRoom.players.filter(p => p.user.toString() !== req.user._id.toString());
          
          if (currentRoom.players.length === 0) {
            // Delete empty room
            await Room.findByIdAndDelete(currentRoom._id);
            console.log(`Deleted empty room: ${currentRoom._id}`);
          } else {
            // Assign new host if needed
            if (currentRoom.host.toString() === req.user._id.toString()) {
              currentRoom.host = currentRoom.players[0].user;
            }
            await currentRoom.save();
          }
        }
      } catch (error) {
        console.error('Error leaving current room:', error);
        // Continue with joining new room even if leaving current room fails
      }
    }

    // Add player to room using findOneAndUpdate to avoid version conflicts
    const updatedRoom = await Room.findOneAndUpdate(
      { _id: room._id },
      { 
        $push: { 
          players: {
            user: req.user._id,
            isReady: false,
            score: 0
          }
        }
      },
      { 
        new: true,
        runValidators: true 
      }
    ).populate('host', 'username').populate('players.user', 'username');

    if (!updatedRoom) {
      return res.status(404).json({ message: 'Room not found' });
    }

    console.log(`User ${req.user.username} added to room ${updatedRoom.name}`);

    // Update user's current room
    req.user.currentRoom = updatedRoom._id;
    await req.user.save();
    console.log(`User ${req.user.username} currentRoom updated to: ${updatedRoom._id}`);

    // Format room data for socket emission
    const formattedRoom = {
      id: updatedRoom._id,
      code: updatedRoom.code,
      name: updatedRoom.name,
      gameType: updatedRoom.gameType,
      host: updatedRoom.host.username,
      players: updatedRoom.players.map(player => ({
        user: {
          id: player.user._id,
          username: player.user.username
        },
        isReady: player.isReady,
        score: player.score,
        isSpectator: player.isSpectator || false
      })),
      maxPlayers: updatedRoom.maxPlayers,
      gameState: updatedRoom.gameState,
      gameData: updatedRoom.gameData
    };

    // Emit socket event to notify all players in the room about the new player
    const io = req.app.get('io');
    if (io) {
      // Emit immediately for instant feedback
      io.to(updatedRoom._id.toString()).emit('room-updated', { room: formattedRoom });
      
      // Check if we should start countdown when new player joins
      const { checkAndStartCountdown } = require('../socket/socketHandler');
      if (typeof checkAndStartCountdown === 'function') {
        checkAndStartCountdown(updatedRoom._id.toString(), io);
      }
      
      // Also emit after a small delay to ensure all clients receive the update
      setTimeout(() => {
        io.to(updatedRoom._id.toString()).emit('room-updated', { room: formattedRoom });
        console.log(`Emitted delayed room-updated event to room ${updatedRoom._id} with ${updatedRoom.players.length} players`);
      }, 500);
      
      console.log(`Emitted room-updated event to room ${updatedRoom._id} with ${updatedRoom.players.length} players`);
    } else {
      console.log('IO instance not available for socket emission');
    }

    res.json({
      message: 'Joined room successfully',
      room: {
        id: updatedRoom._id,
        code: updatedRoom.code,
        name: updatedRoom.name,
        gameType: updatedRoom.gameType,
        host: updatedRoom.host.username,
        players: updatedRoom.players.map(player => ({
          user: {
            id: player.user._id,
            username: player.user.username
          },
          isReady: player.isReady,
          score: player.score
        })),
        maxPlayers: updatedRoom.maxPlayers,
        gameState: updatedRoom.gameState,
        gameData: updatedRoom.gameData
      }
    });
  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Leave room
router.post('/leave', authenticateToken, async (req, res) => {
  try {
    const room = await Room.findById(req.user.currentRoom);
    
    if (!room) {
      // User is not in any room, just clear their current room
      req.user.currentRoom = null;
      await req.user.save();
      return res.json({ message: 'Left room successfully' });
    }

    // Use findOneAndUpdate to avoid version conflicts
    const updatedRoom = await Room.findOneAndUpdate(
      { _id: room._id },
      { 
        $pull: { 
          players: { user: req.user._id } 
        }
      },
      { new: true }
    );

    if (!updatedRoom) {
      // Room was deleted or not found, just clear user's current room
      req.user.currentRoom = null;
      await req.user.save();
      return res.json({ message: 'Left room successfully' });
    }

    // If no players left, delete the room
    if (updatedRoom.players.length === 0) {
      await Room.findByIdAndDelete(updatedRoom._id);
    } else {
      // If host left, assign new host
      if (updatedRoom.host.toString() === req.user._id.toString()) {
        await Room.findByIdAndUpdate(
          updatedRoom._id,
          { host: updatedRoom.players[0].user }
        );
      }
    }

    // Update user's current room
    req.user.currentRoom = null;
    await req.user.save();

    res.json({ message: 'Left room successfully' });
  } catch (error) {
    console.error('Leave room error:', error);
    // Even if there's an error, try to clear the user's current room
    try {
      req.user.currentRoom = null;
      await req.user.save();
    } catch (saveError) {
      console.error('Error clearing user current room:', saveError);
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Get room details
router.get('/:roomId', authenticateToken, async (req, res) => {
  try {
    console.log('Getting room details for:', req.params.roomId);
    console.log('User ID:', req.user._id);
    console.log('User currentRoom:', req.user.currentRoom);
    
    let room = await Room.findById(req.params.roomId)
      .populate('host', 'username')
      .populate('players.user', 'username')
      .populate('gameData.currentTurn', 'username')
      .populate('gameData.winner', 'username');

    if (!room) {
      console.log('Room not found:', req.params.roomId);
      return res.status(404).json({ message: 'Room not found' });
    }

    console.log('Room found:', room.name, 'Players:', room.players.length);

    // Check if user is in this room
    const userInRoom = room.players.some(p => p.user._id.toString() === req.user._id.toString());
    console.log('User in room:', userInRoom);
    
    // If user is not in room, add them back (for refresh cases)
    if (!userInRoom) {
      console.log('Adding user back to room');
      // Check if room has space
      if (room.players.length >= room.maxPlayers) {
        console.log('Room is full');
        return res.status(400).json({ message: 'Room is full' });
      }
      
      // Add user back to room using findOneAndUpdate to avoid version conflicts
      const updatedRoom = await Room.findOneAndUpdate(
        { _id: room._id },
        { 
          $push: { 
            players: {
              user: req.user._id,
              isReady: false,
              score: 0
            }
          }
        },
        { 
          new: true,
          runValidators: true 
        }
      ).populate('host', 'username').populate('players.user', 'username');
      
      if (updatedRoom) {
        console.log('User added back to room');
        
        // Update user's current room
        req.user.currentRoom = updatedRoom._id;
        await req.user.save();
        console.log('User currentRoom updated');
        
        // Use the updated room for response
        room = updatedRoom;
      } else {
        console.log('Failed to add user back to room');
        return res.status(404).json({ message: 'Room not found' });
      }
    }

    // Format room data for frontend
    const formattedRoom = {
      id: room._id,
      code: room.code,
      name: room.name,
      gameType: room.gameType,
      host: room.host.username, // Convert to string
      players: room.players.map(player => ({
        user: {
          id: player.user._id,
          username: player.user.username
        },
        isReady: player.isReady,
        score: player.score,
        isSpectator: player.isSpectator || false
      })),
      maxPlayers: room.maxPlayers,
      gameState: room.gameState,
      gameData: room.gameData
    };

    console.log('Sending formatted room data');
    res.json({ room: formattedRoom });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Update room settings (host only)
router.put('/:roomId/settings', authenticateToken, async (req, res) => {
  try {
    const { name, isPublic } = req.body;
    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only host can update room settings' });
    }

    if (name) room.name = name;
    if (typeof isPublic === 'boolean') room.isPublic = isPublic;

    await room.save();

    res.json({
      message: 'Room settings updated successfully',
      room: {
        id: room._id,
        name: room.name,
        isPublic: room.isPublic
      }
    });
  } catch (error) {
    console.error('Update room settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 