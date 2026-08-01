import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Sparkles, Trash2, Bot, User, CornerDownLeft } from 'lucide-react';

export default function FloatingAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const BASE_URL = window.BILLMATE_API_BASE_URL ||
    ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:5000"
      : "https://billmate-backend.onrender.com");

  const suggestionPrompts = [
    "How much did I spend this month?",
    "Show bills due this week.",
    "Generate my July report.",
    "How much am I spending on subscriptions?",
    "Show unpaid electricity bills.",
    "What is my largest expense?",
    "Help me save money."
  ];

  const token = localStorage.getItem("billmateToken");

  useEffect(() => {
    if (isOpen && token) {
      fetchChatHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchChatHistory = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/ai/chat/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching chat history:', err);
    }
  };

  const handleSend = async (textToSend) => {
    const messageText = textToSend || input;
    if (!messageText.trim()) return;

    if (!token) {
      alert("Please log in first.");
      return;
    }

    // Add user message locally
    const userMsg = { role: 'user', content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: messageText })
      });

      if (!res.ok) {
        throw new Error('Failed to get response from assistant');
      }

      const data = await res.json();
      
      // Simulate streaming / typing effect for smooth UX
      simulateStreamingResponse(data.reply);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '⚠️ Sorry, I encountered a connection issue. Ensure the backend server is running.',
        timestamp: new Date() 
      }]);
      setIsLoading(false);
    }
  };

  const simulateStreamingResponse = (fullText) => {
    const botMsgPlaceholder = { role: 'assistant', content: '', timestamp: new Date() };
    setMessages(prev => [...prev, botMsgPlaceholder]);
    setIsLoading(false);

    let index = 0;
    const words = fullText.split(' ');
    const interval = setInterval(() => {
      if (index < words.length) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            last.content = words.slice(0, index + 1).join(' ');
          }
          return updated;
        });
        index++;
      } else {
        clearInterval(interval);
      }
    }, 45); // Smooth word-by-word streaming speed
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Are you sure you want to clear chat history?")) return;
    try {
      await fetch(`${BASE_URL}/api/ai/chat/history`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setMessages([]);
    } catch (err) {
      console.error('Error clearing chat:', err);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans select-none pointer-events-auto">
      
      {/* Chat Panel Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-16 right-0 w-[380px] h-[520px] bg-[#0c0c0c]/90 backdrop-blur-xl border border-white/[0.08] rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden z-50"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/[0.08] bg-black/40 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-[#F5A93B]" />
                <div>
                  <h3 className="text-sm font-semibold text-white">BillMate AI</h3>
                  <span className="text-[10px] text-green-400/90 flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse"></span>
                    Online Assistant
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {messages.length > 0 && (
                  <button 
                    onClick={handleClearHistory} 
                    className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-white/[0.03] transition-colors"
                    title="Clear Conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.03] transition-colors"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.length === 0 ? (
                /* Empty state design */
                <div className="h-full flex flex-col justify-center items-center text-center px-4 py-8">
                  <div className="w-12 h-12 rounded-full bg-[#F5A93B]/10 flex items-center justify-center mb-3">
                    <Bot className="w-6 h-6 text-[#F5A93B]" />
                  </div>
                  <h4 className="text-sm font-medium text-white mb-1">Meet your AI Assistant</h4>
                  <p className="text-xs text-neutral-400 max-w-[240px] mb-6">Ask questions about bills, categories, monthly reports, or schedule reminders.</p>
                  
                  <div className="w-full space-y-2">
                    <span className="block text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">Try asking:</span>
                    <div className="grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto">
                      {suggestionPrompts.map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(p)}
                          className="w-full text-left text-xs bg-neutral-900/60 hover:bg-neutral-800/80 border border-white/[0.04] hover:border-white/[0.1] text-neutral-300 rounded-xl p-2.5 transition-all text-ellipsis overflow-hidden whitespace-nowrap"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start space-x-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                        msg.role === 'user' ? 'bg-[#FFE29A]/10 text-[#FFE29A]' : 'bg-[#F5A93B]/10 text-[#F5A93B]'
                      }`}>
                        {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>
                      <div className={`rounded-2xl p-3 text-xs leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-[#F5A93B] text-black font-medium rounded-tr-none' 
                          : 'bg-neutral-900/85 text-neutral-200 border border-white/[0.04] rounded-tl-none whitespace-pre-line'
                      }`}>
                        {msg.content}
                        <div className={`text-[8px] mt-1 text-right ${msg.role === 'user' ? 'text-black/60' : 'text-neutral-500'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-start space-x-2">
                    <div className="w-6 h-6 rounded-full bg-[#F5A93B]/10 text-[#F5A93B] flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="bg-neutral-900/85 border border-white/[0.04] rounded-2xl rounded-tl-none p-3 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-white/[0.08] bg-black/20">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type a message..."
                  className="w-full bg-neutral-900 border border-white/[0.06] focus:border-[#F5A93B] focus:ring-1 focus:ring-[#F5A93B]/20 rounded-xl py-2.5 pl-4 pr-10 text-white text-xs placeholder-neutral-500 focus:outline-none transition-all duration-300"
                />
                <button
                  onClick={() => handleSend()}
                  className="absolute right-2 p-1.5 text-neutral-400 hover:text-[#F5A93B] transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="w-14 h-14 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(245,169,59,0.35)] text-black cursor-pointer hover:shadow-[0_8px_30px_rgba(245,169,59,0.5)] transition-shadow"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}
