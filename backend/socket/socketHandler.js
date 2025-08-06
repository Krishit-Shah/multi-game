const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { generateQuizQuestions } = require('../utils/quizQuestions');

// Store active socket connections
const connectedUsers = new Map();

// Define shared functions before module.exports
async function checkAndStartCountdown(roomId, io) {
  try {
    const room = await Room.findById(roomId);
    if (!room || room.gameState !== 'waiting') return;

    const activePlayers = room.players.filter(p => !p.isSpectator);
    
    // Start countdown if there are at least 2 players
    if (activePlayers.length >= 2) {
      console.log(`Starting countdown for room ${roomId} with ${activePlayers.length} players`);
      startCountdown(roomId, io);
    }
  } catch (error) {
    console.error('Check and start countdown error:', error);
  }
}

async function startCountdown(roomId, io) {
  try {
    const room = await Room.findById(roomId);
    if (!room) return;

    let countdown = 5; // 5 second countdown
    
    const countdownInterval = setInterval(async () => {
      // Emit countdown update
      io.to(roomId).emit('countdown-update', { countdown });
      
      countdown--;
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        startGame(roomId, io);
      }
    }, 1000);
    
  } catch (error) {
    console.error('Countdown error:', error);
  }
}

async function startGame(roomId, io) {
  try {
    const room = await Room.findById(roomId);
    if (!room) return;

    room.gameState = 'playing';
    
    if (room.gameType === 'tic-tac-toe') {
      // Initialize Tic Tac Toe
      room.gameData.board = [['', '', ''], ['', '', ''], ['', '', '']];
      // Set first turn to first active (non-spectator) player
      const activePlayers = room.players.filter(p => !p.isSpectator);
      room.gameData.currentTurn = activePlayers[0].user;
      room.gameData.winner = null;
    } else if (room.gameType === 'quiz') {
      // Initialize Quiz
      room.gameData.questions = generateQuizQuestions();
      room.gameData.currentQuestion = 0;
      room.gameData.answers = [];
      
      // Start first question
      setTimeout(() => {
        startQuizQuestion(roomId, io);
      }, 3000);
    }

    await room.save();

    // Emit game started event to all players
    io.to(roomId).emit('game-started', {
      gameType: room.gameType,
      gameData: room.gameData
    });

    // Also emit room update to ensure all clients have latest data
    const updatedRoom = await Room.findById(roomId)
      .populate('players.user', 'username')
      .populate('host', 'username');
    
    if (updatedRoom) {
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
      
      io.to(roomId).emit('room-updated', { room: formattedRoom });
    }

  } catch (error) {
    console.error('Start game error:', error);
  }
}

async function startQuizQuestion(roomId, io) {
  try {
    const room = await Room.findById(roomId);
    if (!room || room.gameState !== 'playing') return;

    const currentQuestion = room.gameData.questions[room.gameData.currentQuestion];
    
    io.to(roomId).emit('quiz-question', {
      question: currentQuestion,
      questionIndex: room.gameData.currentQuestion,
      timeLimit: 20
    });

    // Set timer
    setTimeout(() => {
      processQuizQuestion(roomId, room.gameData.currentQuestion, io);
    }, 20000);

  } catch (error) {
    console.error('Start quiz question error:', error);
  }
}

async function processQuizQuestion(roomId, questionIndex, io) {
  try {
    const room = await Room.findById(roomId);
    if (!room) return;

    const question = room.gameData.questions[questionIndex];
    const answers = room.gameData.answers.filter(a => a.questionIndex === questionIndex);

    // Calculate scores
    answers.forEach(answer => {
      const player = room.players.find(p => p.user.toString() === answer.player.toString());
      if (player) {
        if (answer.answer === question.correctAnswer) {
          let points = 10;
          // Bonus for quick answer
          if (answer.timeAnswered < 5) {
            points += 5;
          }
          player.score += points;
        }
      }
    });

    // Emit results
    io.to(roomId).emit('quiz-results', {
      questionIndex,
      correctAnswer: question.correctAnswer,
      answers,
      scores: room.players.map(p => ({
        userId: p.user,
        score: p.score
      }))
    });

    // Move to next question or end game
    room.gameData.currentQuestion++;
    if (room.gameData.currentQuestion >= room.gameData.questions.length) {
      room.gameState = 'finished';
      await room.save();
      
      io.to(roomId).emit('game-ended', {
        finalScores: room.players.map(p => ({
          userId: p.user,
          score: p.score
        }))
      });
    } else {
      await room.save();
      
      // Start next question after 3 seconds
      setTimeout(() => {
        startQuizQuestion(roomId, io);
      }, 3000);
    }

  } catch (error) {
    console.error('Process quiz question error:', error);
  }
}

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('No token provided'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.userId = user._id;
        socket.username = user.username;
        next();
      } catch (jwtError) {
        console.log('JWT verification failed:', jwtError.message);
        return next(new Error('Invalid token'));
      }
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username}`);
    
    // Store user connection
    connectedUsers.set(socket.userId.toString(), {
      socketId: socket.id,
      username: socket.username,
      userId: socket.userId
    });

    // Update user online status
    User.findByIdAndUpdate(socket.userId, { isOnline: true }).catch(console.error);

    // Join user's current room if exists
    socket.on('join-current-room', async () => {
      try {
        const user = await User.findById(socket.userId).lean();
        if (user && user.currentRoom) {
          socket.join(user.currentRoom.toString());
          socket.emit('joined-room', { roomId: user.currentRoom });
        }
      } catch (error) {
        console.error('Join current room error:', error);
      }
    });

    // Join room
    socket.on('join-room', async (roomId) => {
      try {
        const room = await Room.findById(roomId)
          .populate('players.user', 'username')
          .populate('host', 'username');

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check if user is actually a player in this room
        const isPlayer = room.players.some(p => p.user._id.toString() === socket.userId.toString());
        if (!isPlayer) {
          socket.emit('error', { message: 'You are not a member of this room' });
          return;
        }

        socket.join(roomId);
        
        // Format room data for frontend
        const formattedRoom = {
          id: room._id,
          code: room.code,
          name: room.name,
          gameType: room.gameType,
          host: room.host.username,
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
        
        // Send the current room state to the joining user
        socket.emit('room-updated', {
          room: formattedRoom
        });

        // Notify all other players in the room that someone joined
        socket.to(roomId).emit('player-socket-connected', {
          userId: socket.userId,
          username: socket.username,
          room: formattedRoom
        });

        // No need for additional room-updated emission here - already sent above

        // Check if we should start countdown based on room settings
        await checkAndStartCountdown(roomId, io);

        // If game is already in progress, emit game-started event to new player
        if (room.gameState === 'playing') {
          socket.emit('game-started', {
            gameType: room.gameType,
            gameData: room.gameData
          });
        }

        // Load chat history
        const messages = await Message.find({ room: roomId })
          .populate('sender', 'username')
          .sort({ createdAt: 1 })
          .limit(50);

        // Format messages for frontend
        const formattedMessages = messages.map(message => ({
          id: message._id,
          content: message.content,
          sender: message.sender.username,
          messageType: message.messageType,
          timestamp: message.timestamp
        }));

        socket.emit('chat-history', { messages: formattedMessages });

      } catch (error) {
        console.error('Join room error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave room
    socket.on('leave-room', async (roomId) => {
      try {
        socket.leave(roomId);
        
        // Use findOneAndUpdate to avoid version conflicts
        const updatedRoom = await Room.findOneAndUpdate(
          { _id: roomId },
          { 
            $pull: { 
              players: { user: socket.userId } 
            }
          },
          { new: true }
        );

        if (!updatedRoom) {
          // Room was already deleted or not found
          return;
        }

        // If no players left, delete the room
        if (updatedRoom.players.length === 0) {
          await Room.findByIdAndDelete(roomId);
          io.to(roomId).emit('room-destroyed');
          console.log(`Room ${roomId} deleted - no players left`);
        } else {
          // Assign new host if needed
          if (updatedRoom.host.toString() === socket.userId.toString()) {
            await Room.findByIdAndUpdate(
              roomId,
              { host: updatedRoom.players[0].user }
            );
          }
          
          // Populate and format room data
          const populatedRoom = await Room.findById(roomId)
            .populate('players.user', 'username')
            .populate('host', 'username');
          
          if (populatedRoom) {
            const formattedRoom = {
              id: populatedRoom._id,
              code: populatedRoom.code,
              name: populatedRoom.name,
              gameType: populatedRoom.gameType,
              host: populatedRoom.host.username,
              players: populatedRoom.players.map(player => ({
                user: {
                  id: player.user._id,
                  username: player.user.username
                },
                isReady: player.isReady,
                score: player.score,
                isSpectator: player.isSpectator || false
              })),
              maxPlayers: populatedRoom.maxPlayers,
              gameState: populatedRoom.gameState,
              gameData: populatedRoom.gameData
            };
            
            // Emit room update
            io.to(roomId).emit('room-updated', { room: formattedRoom });
          }
        }

        // Don't clear currentRoom here - let the API endpoint handle it
        // This prevents issues with page refresh

      } catch (error) {
        console.error('Leave room error:', error);
      }
    });

    // Toggle ready status
    socket.on('toggle-ready', async (roomId) => {
      try {
        const room = await Room.findById(roomId);
        if (!room) return;

        const player = room.players.find(p => p.user.toString() === socket.userId.toString());
        if (player) {
          // Use findOneAndUpdate to avoid version conflicts
          const updatedRoom = await Room.findOneAndUpdate(
            { 
              _id: roomId,
              'players.user': socket.userId 
            },
            { 
              $set: { 
                'players.$.isReady': !player.isReady 
              }
            },
            { new: true }
          );

          if (updatedRoom) {
            const updatedPlayer = updatedRoom.players.find(p => p.user.toString() === socket.userId.toString());
            
            io.to(roomId).emit('player-ready-toggled', {
              userId: socket.userId,
              isReady: updatedPlayer.isReady
            });

            // Check if all players are ready
            const activePlayers = updatedRoom.players.filter(p => !p.isSpectator);
            if (activePlayers.length > 0 && activePlayers.every(p => p.isReady)) {
              // Start countdown instead of immediately starting game
              startCountdown(roomId, io);
            } else {
              // If not all ready, cancel any existing countdown
              io.to(roomId).emit('countdown-cancelled');
            }
          }
        }
      } catch (error) {
        console.error('Toggle ready error:', error);
      }
    });

    // Chat message
    socket.on('send-message', async (data) => {
      try {
        const { roomId, content, messageType = 'chat' } = data;
        
        // Emit message immediately for instant chat response
        const tempMessageId = new Date().getTime().toString(); // Temporary ID
        io.to(roomId).emit('new-message', {
          message: {
            id: tempMessageId,
            content: content,
            sender: socket.username, // Use socket username directly
            messageType: messageType,
            timestamp: new Date()
          }
        });

        // Save to database asynchronously
        const message = new Message({
          room: roomId,
          sender: socket.userId,
          content,
          messageType
        });

        message.save().then(savedMessage => {
          // Send updated message with real ID if needed
          io.to(roomId).emit('message-saved', {
            tempId: tempMessageId,
            realId: savedMessage._id
          });
        }).catch(error => {
          console.error('Error saving message:', error);
          // Optionally emit error to remove the temporary message
          io.to(roomId).emit('message-error', {
            tempId: tempMessageId,
            error: 'Failed to save message'
          });
        });

      } catch (error) {
        console.error('Send message error:', error);
      }
    });

    // Handle game moves
    socket.on('game-move', async (data) => {
      try {
        const { roomId, move } = data;
        // Only log for debugging if needed
        // console.log(`Game move received from ${socket.username}:`, move);
        
        // Use lean() for faster query without full document features
        const room = await Room.findById(roomId).lean();
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.gameState !== 'playing') {
          socket.emit('error', { message: 'Game is not in progress' });
          return;
        }

        if (room.gameType === 'tic-tac-toe') {
          await handleTicTacToeMove(room, move, socket, io, roomId);
        } else if (room.gameType === 'quiz') {
          await handleQuizMove(room, move, socket, io);
        }
      } catch (error) {
        console.error('Game move error:', error);
        socket.emit('error', { message: 'Failed to process move' });
      }
    });

    // Restart game
    socket.on('restart-game', async (roomId) => {
      try {
        console.log(`Restart game requested by ${socket.username} for room ${roomId}`);
        
        const room = await Room.findById(roomId);
        if (!room) {
          console.log('Room not found for restart');
          return;
        }

        // Reset game state to waiting
        room.gameState = 'waiting';
        room.gameData = {
          board: [['', '', ''], ['', '', ''], ['', '', '']],
          currentTurn: null,
          winner: null,
          currentQuestion: 0,
          questions: [],
          answers: []
        };
        
        // Reset all player ready status and scores
        room.players.forEach(player => {
          player.isReady = false;
          player.score = 0;
        });

        await room.save();
        console.log('Game reset to waiting state');

        // Emit game reset to all players
        io.to(roomId).emit('game-reset', {
          gameState: room.gameState,
          gameData: room.gameData
        });

        // Also emit room update
        const updatedRoom = await Room.findById(roomId)
          .populate('players.user', 'username')
          .populate('host', 'username');
        
        if (updatedRoom) {
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
          
          io.to(roomId).emit('room-updated', { room: formattedRoom });
        }

        console.log('Restart game events emitted');

      } catch (error) {
        console.error('Restart game error:', error);
      }
    });

    // Handle disconnect - preserve room for potential refresh
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.username}`);
      
      try {
        // Remove from connected users
        connectedUsers.delete(socket.userId.toString());
        
        // Update user offline status
        await User.findByIdAndUpdate(socket.userId, { isOnline: false });
        
        // Don't clear currentRoom - preserve it for refresh
        console.log(`User ${socket.username} disconnected - room preserved for potential refresh`);
        
      } catch (error) {
        console.error('Disconnect cleanup error:', error);
      }
    });
  });

  // Game logic functions are now defined at the top of the file

  async function handleTicTacToeMove(room, move, socket, io, roomId) {
    const { row, col } = move;
    
    // Get the latest room data to avoid race conditions
    const latestRoom = await Room.findById(roomId);
    if (!latestRoom || latestRoom.gameState !== 'playing') {
      socket.emit('error', { message: 'Game is not in progress' });
      return;
    }
    
    // Validate move
    if (latestRoom.gameData.currentTurn.toString() !== socket.userId.toString()) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    if (row < 0 || row > 2 || col < 0 || col > 2) {
      socket.emit('error', { message: 'Invalid move position' });
      return;
    }

    if (latestRoom.gameData.board[row][col] !== '') {
      socket.emit('error', { message: 'Invalid move - cell already occupied' });
      return;
    }

    // Get only active (non-spectator) players for turn management
    const activePlayers = latestRoom.players.filter(p => !p.isSpectator);
    const playerIndex = activePlayers.findIndex(p => p.user.toString() === socket.userId.toString());
    
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in active players' });
      return;
    }
    
    const symbol = playerIndex === 0 ? 'X' : 'O';
    
    // Create updated game data for immediate response
    const updatedGameData = {
      ...latestRoom.gameData,
      board: latestRoom.gameData.board.map((boardRow, r) => 
        boardRow.map((cell, c) => (r === row && c === col) ? symbol : cell)
      )
    };
    
    // Check for win
    const winner = checkTicTacToeWinner(updatedGameData.board);
    let updatedGameState = latestRoom.gameState;
    
    if (winner) {
      updatedGameData.winner = socket.userId;
      updatedGameState = 'finished';
      console.log(`Game won by ${socket.username}`);
    } else if (isBoardFull(updatedGameData.board)) {
      updatedGameState = 'finished';
      console.log('Game ended in draw');
    } else {
      // Switch turns - only consider active players
      const currentPlayerIndex = activePlayers.findIndex(p => p.user.toString() === latestRoom.gameData.currentTurn.toString());
      const nextPlayerIndex = (currentPlayerIndex + 1) % activePlayers.length;
      updatedGameData.currentTurn = activePlayers[nextPlayerIndex].user;
      
      console.log(`Turn switched from player ${currentPlayerIndex} to player ${nextPlayerIndex}`);
    }

    // Emit game update immediately for instant feedback
    io.to(roomId).emit('game-updated', {
      gameData: updatedGameData,
      gameState: updatedGameState
    });

    // Update database asynchronously using atomic operations
    // Get the actual player index in the full players array for scoring
    const fullPlayerIndex = latestRoom.players.findIndex(p => p.user.toString() === socket.userId.toString());
    
    const updateOperations = {
      [`gameData.board.${row}.${col}`]: symbol,
      'gameData.currentTurn': updatedGameData.currentTurn,
      'gameState': updatedGameState
    };

    if (winner) {
      updateOperations['gameData.winner'] = socket.userId;
      updateOperations[`players.${fullPlayerIndex}.score`] = latestRoom.players[fullPlayerIndex].score + 10;
    }

    Room.findByIdAndUpdate(roomId, { $set: updateOperations }).catch(error => {
      console.error('Error updating room after move:', error);
    });
  }

  async function handleQuizMove(room, move, socket, io) {
    const { questionIndex, selectedAnswer, timeAnswered } = move;
    
    // Check if answer already submitted
    const existingAnswer = room.gameData.answers.find(
      a => a.player.toString() === socket.userId.toString() && a.questionIndex === questionIndex
    );
    
    if (existingAnswer) return;

    // Add answer
    room.gameData.answers.push({
      player: socket.userId,
      questionIndex,
      answer: selectedAnswer,
      timeAnswered
    });

    await Room.findByIdAndUpdate(room._id, { 
      $set: { 'gameData.answers': room.gameData.answers } 
    });

    // Check if all players answered or time is up
    const activePlayers = room.players.filter(p => !p.isSpectator);
    const answersForQuestion = room.gameData.answers.filter(a => a.questionIndex === questionIndex);
    
    if (answersForQuestion.length === activePlayers.length) {
      setTimeout(() => {
        processQuizQuestion(room._id.toString(), questionIndex, io);
      }, 1000);
    }
  }

  async function handleQuizAnswer(room, answer, socket) {
    const { questionIndex, selectedAnswer, timeAnswered } = answer;
    
    // Check if answer already submitted
    const existingAnswer = room.gameData.answers.find(
      a => a.player.toString() === socket.userId.toString() && a.questionIndex === questionIndex
    );
    
    if (existingAnswer) return;

    // Add answer
    room.gameData.answers.push({
      player: socket.userId,
      questionIndex,
      answer: selectedAnswer,
      timeAnswered
    });

    await room.save();

    // Check if all players answered or time is up
    const activePlayers = room.players.filter(p => !p.isSpectator);
    const answersForQuestion = room.gameData.answers.filter(a => a.questionIndex === questionIndex);
    
    if (answersForQuestion.length === activePlayers.length) {
      setTimeout(() => {
        processQuizQuestion(room._id.toString(), questionIndex, io);
      }, 1000);
    }
  }

  // Duplicate functions removed - using the ones defined at the top

  function checkTicTacToeWinner(board) {
    // Check rows, columns, and diagonals
    for (let i = 0; i < 3; i++) {
      if (board[i][0] && board[i][0] === board[i][1] && board[i][0] === board[i][2]) {
        return board[i][0];
      }
      if (board[0][i] && board[0][i] === board[1][i] && board[0][i] === board[2][i]) {
        return board[0][i];
      }
    }
    
    if (board[0][0] && board[0][0] === board[1][1] && board[0][0] === board[2][2]) {
      return board[0][0];
    }
    if (board[0][2] && board[0][2] === board[1][1] && board[0][2] === board[2][0]) {
      return board[0][2];
    }
    
    return null;
  }

  function isBoardFull(board) {
    return board.every(row => row.every(cell => cell !== ''));
  }

  // Functions are defined at the top and available via closure
};

// Export the checkAndStartCountdown function for use in routes
module.exports.checkAndStartCountdown = checkAndStartCountdown; 