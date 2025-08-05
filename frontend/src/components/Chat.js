import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';

const Chat = ({ roomId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const { socket, sendMessage } = useSocket();
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (socket) {
      const handleChatHistory = ({ messages: history }) => {
        console.log('Received chat history:', history);
        setMessages(history || []);
      };

      const handleNewMessage = ({ message }) => {
        console.log('Received new message:', message);
        if (message && message.sender && message.content) {
          setMessages(prev => {
            // Avoid duplicate messages by checking if message already exists
            const messageExists = prev.some(m => 
              m.id === message.id || 
              (m.content === message.content && 
               m.sender === message.sender && 
               Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) < 1000)
            );
            
            if (messageExists) {
              return prev;
            }
            
            return [...prev, message];
          });
        }
      };

      const handleMessageSaved = ({ tempId, realId }) => {
        setMessages(prev => prev.map(msg => 
          msg.id === tempId ? { ...msg, id: realId } : msg
        ));
      };

      const handleMessageError = ({ tempId, error }) => {
        console.error('Message error:', error);
        setMessages(prev => prev.filter(msg => msg.id !== tempId));
      };

      socket.on('chat-history', handleChatHistory);
      socket.on('new-message', handleNewMessage);
      socket.on('message-saved', handleMessageSaved);
      socket.on('message-error', handleMessageError);

      return () => {
        socket.off('chat-history', handleChatHistory);
        socket.off('new-message', handleNewMessage);
        socket.off('message-saved', handleMessageSaved);
        socket.off('message-error', handleMessageError);
      };
    }
  }, [socket]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      const messageContent = newMessage.trim();
      
      // Clear input immediately for better UX
      setNewMessage('');
      
      // Send message to server - server will emit immediately for instant feedback
      sendMessage(roomId, messageContent);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.messageType || 'chat'}`}>
            <div className="sender">{message.sender || 'Unknown'}</div>
            <div className="content">{message.content || ''}</div>
            <div className="timestamp">{formatTime(message.timestamp)}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="chat-input">
        <input
          type="text"
          className="form-control"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          disabled={!socket}
        />
        <button type="submit" className="btn" disabled={!newMessage.trim() || !socket}>
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat; 