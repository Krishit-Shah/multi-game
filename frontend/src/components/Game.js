import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    showingResults: false,
    results: null,
    summary: null,
    summaryDetails: null,
    skippedMessage: null,
    waitingForPlayers: false,
    nextQuestionCountdown: 0
  });
  const [isMoving, setIsMoving] = useState(false);

  // Timer refs
  const timers = useRef([]);

  // Helper to clear all timers
  const clearAllTimers = () => {
    timers.current.forEach(timer => clearTimeout(timer));
    timers.current = [];
  };

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
        clearAllTimers();
        setQuizState(prev => ({
          ...prev,
          currentQuestion: question,
          questionIndex,
          timeLeft: timeLimit,
          selectedAnswer: null,
          showingResults: false,
          results: null,
          waitingForPlayers: false,
          nextQuestionCountdown: 0
        }));
        
        // Start countdown timer
        let timeRemaining = timeLimit;
        const countdownTimer = setInterval(() => {
          timeRemaining--;
          setQuizState(prev => ({ ...prev, timeLeft: timeRemaining }));
          
          if (timeRemaining <= 0) {
            clearInterval(countdownTimer);
          }
        }, 1000);
        
        timers.current.push(countdownTimer);
      };

      const handleQuizResults = ({ questionIndex, correctAnswer, answers, scores }) => {
        clearAllTimers();
        setQuizState(prev => ({
          ...prev,
          results: { questionIndex, correctAnswer, answers, scores },
          showingResults: true,
          waitingForPlayers: false,
          nextQuestionCountdown: 5
        }));
        
        // Start countdown for next question
        let countdown = 5;
        const countdownTimer = setInterval(() => {
          countdown--;
          setQuizState(prev => ({ ...prev, nextQuestionCountdown: countdown }));
          
          if (countdown <= 0) {
            clearInterval(countdownTimer);
            setQuizState(prev => ({
              ...prev,
              currentQuestion: null,
              showingResults: false,
              selectedAnswer: null,
              results: null,
              nextQuestionCountdown: 0
            }));
          }
        }, 1000);
        
        timers.current.push(countdownTimer);
      };

      const handleGameEnded = ({ finalScores, summaryDetails }) => {
        clearAllTimers();
        setQuizState(prev => ({
          ...prev,
          summary: finalScores,
          summaryDetails,
          currentQuestion: null,
          showingResults: false,
          selectedAnswer: null,
          results: null,
          waitingForPlayers: false,
          nextQuestionCountdown: 0
        }));
        setGameData(prev => ({ ...prev, gameState: 'finished' }));
      };

      socket.on('room-updated', handleRoomUpdated);
      socket.on('game-started', handleGameStarted);
      socket.on('game-updated', handleGameUpdated);
      socket.on('game-reset', handleGameReset);
      socket.on('quiz-question', handleQuizQuestion);
      socket.on('quiz-results', handleQuizResults);
      socket.on('question-skipped', ({ message }) => {
        setQuizState(prev => ({ ...prev, skippedMessage: message }));
        // Remove the message after a short delay
        const timer = setTimeout(() => {
          setQuizState(prev => ({ ...prev, skippedMessage: null }));
        }, 3000);
        timers.current.push(timer);
      });
      socket.on('game-ended', ({ finalScores, summaryDetails }) => {
        clearAllTimers();
        setQuizState(prev => ({
          ...prev,
          summary: finalScores,
          summaryDetails,
          currentQuestion: null,
          showingResults: false,
          selectedAnswer: null,
          results: null,
          waitingForPlayers: false,
          nextQuestionCountdown: 0
        }));
      });

      // Handle player disconnection
      socket.on('player-disconnected', ({ username }) => {
        // Show a brief notification that a player disconnected
        setQuizState(prev => ({ 
          ...prev, 
          skippedMessage: `${username} disconnected from the game` 
        }));
        
        // Remove the message after a short delay
        const timer = setTimeout(() => {
          setQuizState(prev => ({ ...prev, skippedMessage: null }));
        }, 2000);
        timers.current.push(timer);
      });

      return () => {
        clearAllTimers();
        socket.off('room-updated', handleRoomUpdated);
        socket.off('game-started', handleGameStarted);
        socket.off('game-updated', handleGameUpdated);
        socket.off('game-reset', handleGameReset);
        socket.off('quiz-question', handleQuizQuestion);
        socket.off('quiz-results', handleQuizResults);
        socket.off('question-skipped');
        socket.off('game-ended');
        socket.off('player-disconnected');
      };
    }
  }, [socket, room, roomId, navigate, joinRoom]);

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
    // Only allow answering if we have a current question, haven't selected an answer, and aren't showing results
    if (quizState.currentQuestion && quizState.selectedAnswer === null && !quizState.showingResults) {
      // Immediately disable buttons by setting selected answer
      setQuizState(prev => ({ 
        ...prev, 
        selectedAnswer: answerIndex,
        waitingForPlayers: true 
      }));
      
      // Send answer to server
      makeMove(roomId, {
        questionIndex: quizState.questionIndex,
        selectedAnswer: answerIndex
      });
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
    if (quizState.skippedMessage) {
      return (
        <div className="card">
          <h3>Quiz Game</h3>
          <div className="alert alert-warning">{quizState.skippedMessage}</div>
        </div>
      );
    }
    
    if (quizState.summary) {
      // Enhanced summary screen with correct answers
      return (
        <div className="card">
          <h3>🎉 Quiz Complete!</h3>
          <div className="quiz-summary">
            <div className="final-scores">
              <h4>Final Scores</h4>
              <div className="scores-list">
                {quizState.summary
                  .sort((a, b) => b.score - a.score)
                  .map((score, idx) => {
                    const player = room.players.find(p => p.user === score.userId || p.user.id === score.userId);
                    const isCurrentUser = (score.userId === user.id) || (score.userId.toString && score.userId.toString() === user.id);
                    return (
                      <div key={score.userId} className={`score-item ${isCurrentUser ? 'current-user' : ''}`}>
                        <span className="rank">#{idx + 1}</span>
                        <span className="player-name">
                          {player ? player.user.username : 'Unknown'}
                          {isCurrentUser && ' (You)'}
                        </span>
                        <span className="score">{score.score} pts</span>
                      </div>
                    );
                  })}
              </div>
            </div>
            
            {quizState.summaryDetails && (
              <div className="correct-answers">
                <h4>Correct Answers</h4>
                <div className="answers-list">
                  {quizState.summaryDetails.map((q, idx) => (
                    <div key={idx} className="answer-item">
                      <div className="question-number">Q{idx + 1}</div>
                      <div className="question-text">{q.question}</div>
                      <div className="correct-answer">
                        <strong>Correct Answer:</strong> {String.fromCharCode(65 + q.correctAnswer)}. {q.options[q.correctAnswer]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="summary-actions">
              <button className="btn btn-primary" onClick={handleRestartGame}>
                Play Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    if (!quizState.currentQuestion && !quizState.showingResults) {
      return (
        <div className="card">
          <h3>Quiz Game</h3>
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Waiting for next question...</p>
          </div>
        </div>
      );
    }
    
    if (quizState.showingResults && quizState.results) {
      const { correctAnswer, scores } = quizState.results;
      return (
        <div className="card">
          <h3>Quiz Game</h3>
          <div className="quiz-container">
            <div className="quiz-timer results-timer">
              Next question in {quizState.nextQuestionCountdown} seconds...
            </div>
            <div className="quiz-question">{quizState.currentQuestion?.question}</div>
            <div className="quiz-options">
              {quizState.currentQuestion.options.map((option, index) => {
                const isCorrect = index === correctAnswer;
                const wasSelected = quizState.selectedAnswer === index;
                return (
                  <div
                    key={index}
                    className={`quiz-option results-option ${isCorrect ? 'correct' : ''} ${wasSelected ? 'selected' : ''} ${wasSelected && !isCorrect ? 'incorrect' : ''}`}
                  >
                    <span className="option-letter">{String.fromCharCode(65 + index)}.</span>
                    <span className="option-text">{option}</span>
                    {isCorrect && <span className="correct-indicator">✓</span>}
                    {wasSelected && !isCorrect && <span className="incorrect-indicator">✗</span>}
                  </div>
                );
              })}
            </div>
            <div className="quiz-scores">
              <h4>Current Scores</h4>
              <div className="scores-grid">
                {scores
                  .sort((a, b) => b.score - a.score)
                  .map((score) => {
                    const player = room.players.find(p => p.user === score.userId || p.user.id === score.userId);
                    const isCurrentUser = (score.userId === user.id) || (score.userId.toString && score.userId.toString() === user.id);
                    return (
                      <div key={score.userId} className={`score-item ${isCurrentUser ? 'current-user' : ''}`}>
                        <span className="player-name">
                          {player ? player.user.username : 'Unknown'}
                          {isCurrentUser && ' (You)'}
                        </span>
                        <span className="score">{score.score}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Normal question state
    const answersDisabled = quizState.selectedAnswer !== null || quizState.showingResults;
    
    return (
      <div className="card">
        <h3>Quiz Game</h3>
        <div className="quiz-container">
          <div className="quiz-timer">
            {quizState.timeLeft > 0 ? `Time: ${quizState.timeLeft}s` : 'Time\'s up!'}
          </div>
          <div className="quiz-question">{quizState.currentQuestion.question}</div>
          <div className="quiz-options">
            {quizState.currentQuestion.options.map((option, index) => (
              <button
                key={index}
                className={`quiz-option ${quizState.selectedAnswer === index ? 'selected' : ''} ${answersDisabled ? 'disabled' : ''}`}
                onClick={() => !answersDisabled && handleQuizAnswer(index)}
                disabled={answersDisabled}
              >
                <span className="option-letter">{String.fromCharCode(65 + index)}.</span>
                <span className="option-text">{option}</span>
              </button>
            ))}
          </div>
          {quizState.waitingForPlayers && (
            <div className="quiz-waiting">
              <div className="loading-spinner small"></div>
              <p>Waiting for other players to answer...</p>
            </div>
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