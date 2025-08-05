const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  gameType: {
    type: String,
    enum: ['tic-tac-toe', 'quiz'],
    required: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  players: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isReady: {
      type: Boolean,
      default: false
    },
    score: {
      type: Number,
      default: 0
    },
    isSpectator: {
      type: Boolean,
      default: false
    }
  }],
  maxPlayers: {
    type: Number,
    required: true,
    default: 2
  },
  gameState: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting'
  },
  gameData: {
    // For Tic Tac Toe
    board: {
      type: [[String]],
      default: [['', '', ''], ['', '', ''], ['', '', '']]
    },
    currentTurn: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    // For Quiz
    currentQuestion: {
      type: Number,
      default: 0
    },
    questions: [{
      question: String,
      options: [String],
      correctAnswer: Number,
      timeLimit: Number
    }],
    questionTimer: {
      type: Number,
      default: 0
    },
    answers: [{
      player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      answer: Number,
      timeAnswered: Number
    }]
  },
  readyTimer: {
    type: Number,
    default: 60
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update maxPlayers based on game type
roomSchema.pre('save', function(next) {
  if (this.gameType === 'tic-tac-toe') {
    this.maxPlayers = 2;
  } else if (this.gameType === 'quiz') {
    this.maxPlayers = 4;
  }
  next();
});

// Virtual for checking if room is full
roomSchema.virtual('isFull').get(function() {
  return this.players.length >= this.maxPlayers;
});

// Virtual for checking if all players are ready
roomSchema.virtual('allReady').get(function() {
  const activePlayers = this.players.filter(p => !p.isSpectator);
  return activePlayers.length > 0 && activePlayers.every(p => p.isReady);
});

module.exports = mongoose.model('Room', roomSchema); 