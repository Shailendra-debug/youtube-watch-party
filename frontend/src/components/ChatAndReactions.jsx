import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Sparkles, Eye } from 'lucide-react';

const EMOJI_LIST = ['🔥', '❤️', '😂', '👏', '🍿', '😮', '🚀', '🎉'];

export default function ChatAndReactions({
  messages = [],
  reactions = [],
  currentUserId,
  onSendMessage,
  onSendReaction,
  readOnly = false
}) {
  const [inputText, setInputText] = useState('');
  const chatBottomRef = useRef(null);

  // Auto scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl flex flex-col h-full overflow-hidden shadow-xl relative">
      {/* Floating Reactions Portal Container */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-20 reaction-bubble flex flex-col items-center"
            style={{
              left: `${Math.max(10, Math.min(85, Math.random() * 80 + 10))}%`
            }}
          >
            <span className="text-3xl filter drop-shadow-md">{r.emoji}</span>
            <span className="text-[10px] text-white/90 bg-black/60 px-1.5 py-0.5 rounded-full mt-1">
              {r.senderName}
            </span>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-base">Party Chat</h3>
        </div>
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Live
        </span>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center px-4">
            <MessageSquare className="w-8 h-8 mb-2 opacity-30 text-slate-400" />
            <p>No messages yet.</p>
            <p className="mt-1 text-slate-600">Say hello to the watch party!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            const isHost = msg.senderRole === 'host';
            const isMod = msg.senderRole === 'moderator';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400">
                  <span className="font-medium text-slate-300">
                    {isMe ? 'You' : msg.senderName}
                  </span>
                  {isHost && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 rounded">
                      Host
                    </span>
                  )}
                  {isMod && (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1 rounded">
                      Mod
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {(() => {
                      if (!msg?.timestamp) return '';
                      try {
                        const d = new Date(msg.timestamp);
                        return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      } catch {
                        return '';
                      }
                    })()}
                  </span>
                </div>

                <div
                  className={`px-3 py-2 rounded-2xl text-sm max-w-[85%] break-words shadow-sm ${
                    isMe
                      ? 'bg-rose-600 text-white rounded-tr-none'
                      : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/60'
                  }`}
                >
                  {msg?.text || ''}
                </div>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      {readOnly ? (
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-center gap-2 text-xs text-emerald-300">
          <Eye className="w-3.5 h-3.5" /> Viewer access · chat is read-only
        </div>
      ) : (
        <>
          {/* Quick Emoji Reaction Bar */}
          <div className="px-3 py-1.5 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between gap-1 overflow-x-auto">
            <span className="text-[11px] text-slate-500 font-medium shrink-0 ml-1">React:</span>
            <div className="flex items-center gap-1">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onSendReaction(emoji)}
                  className="text-lg p-1 hover:bg-slate-800 rounded-lg hover:scale-125 active:scale-95 transition cursor-pointer"
                  title={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Send a message..."
              maxLength={300}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white rounded-xl transition flex items-center justify-center cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
