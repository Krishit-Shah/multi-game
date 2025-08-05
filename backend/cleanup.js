const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const Room = require('./models/Room');
const User = require('./models/User');

async function cleanupDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/multiplayer-game');
    console.log('Connected to MongoDB');

    // Find and delete empty rooms
    const emptyRooms = await Room.find({ 'players.0': { $exists: false } });
    console.log(`Found ${emptyRooms.length} empty rooms`);
    
    if (emptyRooms.length > 0) {
      await Room.deleteMany({ 'players.0': { $exists: false } });
      console.log('Deleted empty rooms');
    }

    // Find and delete rooms with no players
    const roomsWithNoPlayers = await Room.find({ players: { $size: 0 } });
    console.log(`Found ${roomsWithNoPlayers.length} rooms with no players`);
    
    if (roomsWithNoPlayers.length > 0) {
      await Room.deleteMany({ players: { $size: 0 } });
      console.log('Deleted rooms with no players');
    }

    // Reset all users' currentRoom to null
    await User.updateMany({}, { currentRoom: null });
    console.log('Reset all users currentRoom to null');

    // Find rooms that have been in 'playing' state for more than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oldPlayingRooms = await Room.find({
      gameState: 'playing',
      updatedAt: { $lt: oneHourAgo }
    });
    console.log(`Found ${oldPlayingRooms.length} old playing rooms`);
    
    if (oldPlayingRooms.length > 0) {
      await Room.deleteMany({
        gameState: 'playing',
        updatedAt: { $lt: oneHourAgo }
      });
      console.log('Deleted old playing rooms');
    }

    console.log('Cleanup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup error:', error);
    process.exit(1);
  }
}

cleanupDatabase(); 