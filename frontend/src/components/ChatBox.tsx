import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '../types/game';

interface ChatBoxProps {
  socket: Socket | null;
  roomId: string;
  userId: string;
}

const EMOJIS = ['😀', '😂', '😎', '😍', '😭', '😡', '👍', '🎉', '🔥', '🃏'];

export default function ChatBox({ socket, roomId, userId }: ChatBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleChatHistory = (history: ChatMessage[]) => {
      setMessages(history);
    };

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    socket.on('chatHistory', handleChatHistory);
    socket.on('chatMessage', handleNewMessage);

    return () => {
      socket.off('chatHistory', handleChatHistory);
      socket.off('chatMessage', handleNewMessage);
    };
  }, [socket, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    socket?.emit('sendMessage', { roomId, text: inputText }, (res: any) => {
      if (!res.success) alert(res.message);
    });
    
    setInputText('');
  };

  const addEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {/* Floating Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="bg-gray-800 border border-gray-700 w-80 sm:w-96 rounded-2xl shadow-2xl mb-4 overflow-hidden flex flex-col h-[28rem]"
          >
            {/* Header */}
            <div className="bg-gray-900 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                💬 Room Chat
              </h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition"
              >
                ✖
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-grow p-4 overflow-y-auto flex flex-col gap-3">
              {messages.length === 0 ? (
                <p className="text-gray-500 text-center m-auto font-medium">No messages yet. Say hi!</p>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === userId;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {!isMe && (
                        <span className="text-xs text-gray-400 mb-1 ml-1 font-bold">
                          Player {msg.senderId.substring(0, 4)}
                        </span>
                      )}
                      <div 
                        className={`px-4 py-2 rounded-2xl max-w-[85%] break-words ${
                          isMe 
                            ? 'bg-uno-blue text-white rounded-tr-sm' 
                            : 'bg-gray-700 text-gray-100 rounded-tl-sm'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-gray-900 p-3 border-t border-gray-700 flex flex-col gap-2">
              <div className="flex justify-between px-1">
                {EMOJIS.map(emoji => (
                  <button 
                    key={emoji} 
                    onClick={() => addEmoji(emoji)}
                    className="hover:scale-125 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={100}
                  className="flex-grow bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-uno-blue"
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim()}
                  className="bg-uno-blue hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-xl font-bold transition"
                >
                  Send
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="bg-uno-blue text-white w-14 h-14 rounded-full shadow-[0_0_15px_rgba(0,114,188,0.5)] flex items-center justify-center text-2xl relative border-2 border-white"
      >
        💬
        <AnimatePresence>
          {unreadCount > 0 && !isOpen && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-2 -right-2 bg-uno-red text-white text-xs font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-gray-900 shadow-lg"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

    </div>
  );
}
