import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import axios from 'axios';
import Chat from './Chat';

const Game = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const { socket, joinRoom, leaveRoom, makeMove, restartGame } = useSocket();
  const navigate = useNavigate();
  
  const [room, setRoom] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quizState, setQuizState] = useState({
    currentQuestion: null,
    questionIndex: null,
    selectedAnswer: null,
    timeLeft: 0,
    timer: null,
    showingResults: false,
    results: null,
    summary: null
  });
  const [isMoving, setIsMoving] = useState(false);

  const fetchRoom = useCallback(async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomId}`);
      setRoom(response.data.room);
      setGameData(response.data.room.gameData);
    } catch (error) {
      setError('Failed to load game');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (socket && room) {
      joinRoom(room.id);
      
      const handleRoomUpdated = ({ room: updatedRoom }) => {
        // Only log significant room updates, not every single one
        if (updatedRoom.gameState !== room?.gameState) {
          console.log('Game state changed:', updatedRoom.gameState);
        }
        setRoom(updatedRoom);
        setGameData(updatedRoom.gameData);
        
        // If game is reset to waiting, redirect back to room
        if (updatedRoom.gameState === 'waiting') {
          console.log('Game reset to waiting, redirecting to room');
          navigate(`/room/${roomId}`);
        }
      };

      const handleGameStarted = ({ gameType, gameData: newGameData }) => {
        console.log('Game started:', gameType);
        setGameData(newGameData);
      };

      const handleGameUpdated = ({ gameData: updatedGameData, gameState }) => {
        // Only log when game state changes or game ends
        if (gameState === 'finished' || gameState !== gameData?.gameState) {
          console.log('Game state updated:', gameState);
        }
        setGameData(updatedGameData);
        setIsMoving(false); // Reset moving state when game is updated
        if (gameState === 'finished') {
          // Game ended, stay in room for chat
        }
      };

      const handleGameReset = ({ gameState, gameData: resetGameData }) => {
        console.log('Game reset to:', gameState);
        setGameData(resetGameData);
        // Redirect back to room when game is reset
        navigate(`/room/${roomId}`);
      };

      const handleQuizQuestion = ({ question, questionIndex, timeLimit }) => {
        if (quizState.timer) clearInterval(quizState.timer);
        setQuizState({
          currentQuestion: question,
          questionIndex,
          selectedAnswer: null,
          timeLeft: timeLimit,
          timer: setInterval(() => {
            setQuizState(prev => ({
              ...prev,
              timeLeft: prev.timeLeft - 1
            }));
          }, 1000),
          showingResults: false,
          results: null,
          summary: null
        });
      };

      const handleQuizResults = ({ questionIndex, correctAnswer, answers, scores }) => {
        if (quizState.timer) clearInterval(quizState.timer);
        setQuizState(prev => ({
          ...prev,
          showingResults: true,
          results: { questionIndex, correctAnswer, answers, scores },
          timer: null
        }));
        setTimeout(() => {
          setQuizState(prev => ({
            ...prev,
            currentQuestion: null,
            selectedAnswer: null,
            showingResults: false,
            results: null,
            timer: null
          }));
        }, 3000);
      };

      const handleGameEnded = ({ finalScores }) => {
        setQuizState(prev => ({
          ...prev,
          summary: finalScores,
          currentQuestion: null,
          showingResults: false,
          results: null,
          timer: null
        }));
        setGameData(prev => ({ ...prev, gameState: 'finished' }));
      };

      socket.on('room-updated', handleRoomUpdated);
      socket.on('game-started', handleGameStarted);
      socket.on('game-updated', handleGameUpdated);
      socket.on('game-reset', handleGameReset);
      socket.on('quiz-question', handleQuizQuestion);
      socket.on('quiz-results', handleQuizResults);
      socket.on('game-ended', handleGameEnded);

      return () => {
        socket.off('room-updated', handleRoomUpdated);
        socket.off('game-started', handleGameStarted);
        socket.off('game-updated', handleGameUpdated);
        socket.off('game-reset', handleGameReset);
        socket.off('quiz-question', handleQuizQuestion);
        socket.off('quiz-results', handleQuizResults);
        socket.off('game-ended', handleGameEnded);
      };
    }
  }, [socket, room, roomId, navigate, joinRoom, quizState.timer]);

  useEffect(() => {
    // Cleanup timer on unmount
    return () => {
      if (quizState.timer) {
        clearInterval(quizState.timer);
      }
    };
  }, [quizState.timer]);

  const handleLeaveGame = async () => {
    try {
      await axios.post('/api/rooms/leave');
      leaveRoom(roomId);
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to leave game');
    }
  };

  const handleTicTacToeMove = (row, col) => {
    console.log('Move attempt:', {
      gameData: !!gameData,
      currentTurn: gameData?.currentTurn,
      userId: user.id,
      isMyTurn: gameData?.currentTurn === user.id,
      cellEmpty: !gameData?.board[row][col],
      isMoving,
      canMove: gameData && gameData.currentTurn === user.id && !gameData.board[row][col] && !isMoving
    });
    
    if (gameData && gameData.currentTurn === user.id && !gameData.board[row][col] && !isMoving) {
      console.log('Making move:', row, col);
      
      // Set moving state to prevent double-clicks
      setIsMoving(true);
      
      // Determine player symbol based on active player index in room
      const activePlayers = room?.players?.filter(p => !p.isSpectator) || [];
      const playerIndex = activePlayers.findIndex(p => p.user.id === user.id);
      const symbol = playerIndex === 0 ? 'X' : 'O';
      
      // Optimistic UI update - immediately update the board
      const optimisticGameData = {
        ...gameData,
        board: gameData.board.map((r, i) => 
          i === row ? r.map((c, j) => j === col ? symbol : c) : r
        )
      };
      setGameData(optimisticGameData);
      
      // Send move to server
      makeMove(roomId, { row, col });
      
      // Reset moving state after a short delay
      setTimeout(() => {
        setIsMoving(false);
      }, 500);
    }
  };

  const handleQuizAnswer = (answerIndex) => {
    if (quizState.currentQuestion && quizState.selectedAnswer === null && !quizState.showingResults) {
      setQuizState(prev => ({ ...prev, selectedAnswer: answerIndex }));
      makeMove(roomId, {
        questionIndex: quizState.questionIndex,
        selectedAnswer: answerIndex,
        timeAnswered: quizState.timeLeft
      });
      // Immediately show results state (disable buttons, show waiting)
      setQuizState(prev => ({ ...prev, showingResults: true }));
    }
  };

  const handleRestartGame = () => {
    console.log('Restarting game');
    restartGame(roomId);
  };

  if (loading) {
    return <div className="loading">Loading game...</div>;
  }

  if (error) {
    return (
      <div className="card">
        <div className="alert alert-danger">{error}</div>
        <button className="btn" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!room || !gameData) {
    return <div className="loading">Game not found</div>;
  }

  const renderTicTacToe = () => {
    if (!gameData.board) return null;

    const isMyTurn = gameData.currentTurn === user.id;
    const gameFinished = gameData.winner || gameData.board.every(row => row.every(cell => cell !== ''));
    
    // Debug logging for turn validation
    console.log('Turn Debug:', {
      currentTurn: gameData.currentTurn,
      userId: user.id,
      isMyTurn,
      gameData: gameData
    });

    return (
      <div className="card">
        <h3>Tic Tac Toe</h3>
        
        {gameFinished ? (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {gameData.winner ? (
              <div className="alert alert-success">
                {gameData.winner === user.id ? 'You won! 🎉' : 'You lost! 😔'}
              </div>
            ) : (
              <div className="alert alert-info">It's a draw! 🤝</div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {isMyTurn ? (
              <div className="alert alert-info">Your turn! Make your move</div>
            ) : (
              <div className="alert alert-warning">Waiting for opponent...</div>
            )}
          </div>
        )}

        <div className="game-board" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '4px', 
          maxWidth: '300px', 
          margin: '0 auto' 
        }}>
          {gameData.board.map((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`game-cell ${cell.toLowerCase()}`}
                onClick={() => !gameFinished && isMyTurn && !cell && !isMoving && handleTicTacToeMove(rowIndex, colIndex)}
                style={{ 
                  cursor: (!gameFinished && isMyTurn && !cell && !isMoving) ? 'pointer' : 'default',
                  border: '2px solid #333',
                  height: '80px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  fontWeight: 'bold',
                  backgroundColor: (!gameFinished && isMyTurn && !cell && !isMoving) ? '#f0f0f0' : 'white',
                  opacity: isMoving ? 0.7 : 1
                }}
              >
                {cell}
              </div>
            ))
          )}
        </div>

        {gameFinished && (
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button className="btn btn-primary" onClick={handleRestartGame}>
              Play Again
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderQuiz = () => {
    if (quizState.summary) {
      // Summary screen
      return (
        <div className="card">
          <h3>Quiz Summary</h3>
          <div>
            <h4>Final Scores</h4>
            <ul>
              {quizState.summary.map((score, idx) => {
                const player = room.players.find(p => p.user === score.userId || p.user.id === score.userId);
                return (
                  <li key={score.userId}>
                    {player ? player.user.username : 'Unknown'}: {score.score}
                  </li>
                );
              })}
            </ul>
          </div>
          <button className="btn btn-primary" onClick={handleRestartGame}>Play Again</button>
        </div>
      );
    }
    if (!quizState.currentQuestion && !quizState.showingResults) {
      return (
        <div className="card">
          <h3>Quiz Game</h3>
          <div className="loading">Waiting for question...</div>
        </div>
      );
    }
    if (quizState.showingResults && quizState.results) {
      // Show results state
      const { correctAnswer, scores } = quizState.results;
      return (
        <div className="card">
          <h3>Quiz Game</h3>
          <div className="quiz-container">
            <div className="quiz-timer">Next question in 3 seconds...</div>
            <div className="quiz-question">{quizState.currentQuestion?.question}</div>
            <div className="quiz-options">
              {quizState.currentQuestion.options.map((option, index) => (
                <div
                  key={index}
                  className={`quiz-option ${index === correctAnswer ? 'correct' : ''} ${quizState.selectedAnswer === index ? 'selected' : ''}`}
                  style={{ cursor: 'default', opacity: index === correctAnswer ? 1 : 0.6 }}
                >
                  {String.fromCharCode(65 + index)}. {option}
                </div>
              ))}
            </div>
            <div className="quiz-scores">
              <h4>Scores</h4>
              <ul>
                {scores.map((score, idx) => {
                  const player = room.players.find(p => p.user === score.userId || p.user.id === score.userId);
                  return (
                    <li key={score.userId}>
                      {player ? player.user.username : 'Unknown'}: {score.score}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      );
    }
    // Normal question state
    return (
      <div className="card">
        <h3>Quiz Game</h3>
        <div className="quiz-container">
          <div className="quiz-timer">Time: {quizState.timeLeft}s</div>
          <div className="quiz-question">{quizState.currentQuestion.question}</div>
          <div className="quiz-options">
            {quizState.currentQuestion.options.map((option, index) => (
              <div
                key={index}
                className={`quiz-option ${quizState.selectedAnswer === index ? 'selected' : ''}`}
                onClick={() => quizState.selectedAnswer === null && !quizState.showingResults && handleQuizAnswer(index)}
                style={{ cursor: quizState.selectedAnswer === null && !quizState.showingResults ? 'pointer' : 'default', opacity: quizState.selectedAnswer !== null || quizState.showingResults ? 0.6 : 1 }}
              >
                {String.fromCharCode(65 + index)}. {option}
              </div>
            ))}
          </div>
          {quizState.selectedAnswer !== null && !quizState.showingResults && (
            <div className="quiz-waiting">Waiting for other players to answer...</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>{room.name} - {room.gameType === 'tic-tac-toe' ? 'Tic Tac Toe' : 'Quiz'}</h2>
        <button className="btn btn-secondary" onClick={handleLeaveGame}>
          Leave Game
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Game Area */}
        <div>
          {room.gameType === 'tic-tac-toe' ? renderTicTacToe() : renderQuiz()}
        </div>

        {/* Chat */}
        <div>
          <h3>Chat</h3>
          <Chat roomId={roomId} />
        </div>
      </div>
    </div>
  );
};

export default Game; 