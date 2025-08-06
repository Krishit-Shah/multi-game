# 🎮 Multiplayer Game Platform

A real-time multiplayer game platform built with the MERN stack (MongoDB, Express, React, Node.js) and Socket.IO for real-time functionality.

## ✨ Features

### 🎯 Game Types
- **Tic Tac Toe**: 2-player turn-based game
- **Quiz**: 4-player real-time quiz with multiple choice questions

### 🏠 Room System
- Create rooms with custom names and game types
- Public/private room options
- Unique room codes for private joining
- Host controls (delete room, change settings, toggle visibility)
- Display of 10 random public rooms

### 👥 Player Management
- Join rooms by code or from public room list
- Automatic room capacity enforcement
- Ready system with 60-second auto-start
- Leave room functionality

### 🎮 Game Features
- Real-time turn-based gameplay
- Server-side game logic validation
- Anti-cheat measures
- Real-time scoreboard updates
- Game state synchronization

### 💬 Chat System
- In-game chat room scoped to each room
- Real-time messaging
- Message history
- System and game event messages

### 📊 Post-Game Features
- Game results and final scores
- Chat remains open after game ends
- Rematch options
- Game state reset functionality

## 🛠️ Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **Socket.IO** - Real-time communication
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **bcryptjs** - Password hashing

### Frontend
- **React** - UI framework
- **React Router** - Client-side routing
- **Socket.IO Client** - Real-time communication
- **Axios** - HTTP client
- **CSS3** - Styling with modern design

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local installation or MongoDB Atlas)
- npm or yarn

### 1. Clone the Repository
```bash
git clone <repository-url>
cd multiplayer-game
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### 3. Environment Setup

#### Backend Configuration
Create a `.env` file in the `backend` directory:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/multiplayer-game
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

#### MongoDB Setup
1. Install MongoDB locally or use MongoDB Atlas
2. Create a database named `multiplayer-game`
3. Update the `MONGODB_URI` in your `.env` file

### 4. Start the Application

#### Development Mode
```bash
# Start both backend and frontend concurrently
npm run dev
```

#### Individual Services
```bash
# Start backend only
npm run server

# Start frontend only
npm run client
```

### 5. Access the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## 🎮 How to Play

### 1. Registration & Login
- Create an account with username, email, and password
- Login with your credentials

### 2. Creating a Room
- Click "Create Room" on the dashboard
- Choose game type (Tic Tac Toe or Quiz)
- Set room name and visibility
- Share the room code with friends

### 3. Joining a Room
- Enter a room code to join private rooms
- Browse and join public rooms from the list
- Wait for all players to join

### 4. Ready System
- All players must click "Ready"
- Game starts automatically after 60 seconds
- Host can manually start when all players are ready

### 5. Gameplay

#### Tic Tac Toe
- Turn-based gameplay
- Click on empty cells to make moves
- First player to get 3 in a row wins

#### Quiz
- All players answer simultaneously
- 20-second timer per question
- 5 questions total
- Bonus points for quick answers
- Real-time score updates

### 6. Chat
- Use the chat panel to communicate
- Messages are scoped to the room
- System messages for game events

## 📁 Project Structure

```
multiplayer-game/
├── backend/
│   ├── models/
│   │   ├── User.js
│   │   ├── Room.js
│   │   └── Message.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── rooms.js
│   ├── socket/
│   │   └── socketHandler.js
│   ├── utils/
│   │   └── quizQuestions.js
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── Login.js
│   │   │   │   └── Register.js
│   │   │   ├── Chat.js
│   │   │   ├── Dashboard.js
│   │   │   ├── Game.js
│   │   │   ├── Loading.js
│   │   │   ├── Navbar.js
│   │   │   └── Room.js
│   │   ├── contexts/
│   │   │   ├── AuthContext.js
│   │   │   └── SocketContext.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
├── package.json
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Rooms
- `POST /api/rooms/create` - Create a new room
- `GET /api/rooms/public` - Get public rooms
- `POST /api/rooms/join/:code` - Join room by code
- `POST /api/rooms/leave` - Leave current room
- `GET /api/rooms/:roomId` - Get room details
- `PUT /api/rooms/:roomId/settings` - Update room settings

## 🔌 Socket.IO Events

### Client to Server
- `join-room` - Join a game room
- `leave-room` - Leave a game room
- `toggle-ready` - Toggle ready status
- `send-message` - Send chat message
- `game-move` - Make a game move

### Server to Client
- `room-updated` - Room state update
- `player-ready-toggled` - Player ready status change
- `game-started` - Game initialization
- `game-updated` - Game state update
- `quiz-question` - New quiz question
- `quiz-results` - Quiz question results
- `game-ended` - Game completion
- `chat-history` - Load chat history
- `new-message` - New chat message

## 🎯 Game Rules

### Tic Tac Toe
- 2 players maximum
- Turn-based gameplay
- X goes first, O goes second
- Win by getting 3 in a row (horizontal, vertical, or diagonal)
- Draw if board is full with no winner

### Quiz
- 4 players maximum
- All players answer simultaneously
- 20 seconds per question
- 5 questions total
- 10 points for correct answer
- 5 bonus points for answering within 5 seconds
- Real-time score updates

## 🛡️ Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Input validation and sanitization
- Anti-cheat measures for game moves
- Server-side game logic validation
- CORS protection

## 🚀 Deployment

### Backend Deployment
1. Set up MongoDB Atlas or local MongoDB
2. Configure environment variables
3. Deploy to Heroku, Vercel, or similar platform

### Frontend Deployment
1. Build the React app: `npm run build`
2. Deploy to Netlify, Vercel, or similar platform
3. Update API endpoints for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🎮 Future Enhancements

- [ ] Spectator mode
- [ ] More game types
- [ ] User profiles and statistics
- [ ] Tournament system
- [ ] Mobile app
- [ ] Voice chat
- [ ] Custom themes
- [ ] Leaderboards
- [ ] Achievement system

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check connection string in `.env`
   - Verify database exists

2. **Socket.IO Connection Issues**
   - Check CORS settings
   - Verify frontend proxy configuration
   - Ensure ports are not blocked

3. **Authentication Errors**
   - Clear browser localStorage
   - Check JWT secret configuration
   - Verify token expiration

4. **Game Not Starting**
   - Ensure all players are ready
   - Check room capacity limits
   - Verify game state synchronization

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation

---


**Happy Gaming! 🎮** 




Frontend:

Add a "showing results" state to the quiz UI, so users see the correct answer and scores for a few seconds before the next question.
Disable answer buttons immediately after an answer is selected to prevent double submissions.
Ensure all timers are cleared before setting a new one to prevent leaks.
Show a summary screen at the end of the quiz with final scores and correct answers.
Backend:

When a player disconnects, remove them from the list of active players for the current question.
Consider emitting a "question-skipped" or "auto-advance" event if not all players answer within the time limit.
Store the timestamp when the question is sent and calculate the actual answer time on the backend for more accurate scoring.
Add more robust error handling/logging for quiz state transitions.
General:

Add more feedback to users (e.g., "Waiting for other players to answer..." or "Next question in 3 seconds...").
