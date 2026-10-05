import React, { useState } from 'react';
import { AlertTriangle, LogOut, HandMetal, Video, Send, X } from 'lucide-react';
import { extractYouTubeId } from '../utils/youtube';

export function KickedModal({ message, onConfirm }) {
  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-rose-500/50 rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl space-y-4">
        <div className="w-14 h-14 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Removed from Room</h3>
          <p className="text-sm text-slate-400 mt-2">{message}</p>
        </div>
        <button
          onClick={onConfirm}
          className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Return to Lobby</span>
        </button>
      </div>
    </div>
  );
}

export function RequestActionModal({ isOpen, onClose, onSubmitRequest }) {
  const [actionType, setActionType] = useState('play'); // 'play' | 'pause' | 'change_video'
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    let vid = null;
    if (actionType === 'change_video') {
      vid = extractYouTubeId(videoUrl);
      if (!vid) {
        setError('Please provide a valid YouTube URL or ID.');
        return;
      }
    }

    onSubmitRequest({
      action: actionType,
      videoId: vid
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <HandMetal className="w-6 h-6 text-rose-500" />
          <h3 className="text-lg font-bold text-white">Request Host Action</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          As a participant, you can ask the Host & Moderators to execute a playback action or switch to your favorite video.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Action Request
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setActionType('play')}
                className={`py-2 px-3 text-xs rounded-xl font-medium border transition cursor-pointer ${
                  actionType === 'play'
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                Play Video
              </button>
              <button
                type="button"
                onClick={() => setActionType('pause')}
                className={`py-2 px-3 text-xs rounded-xl font-medium border transition cursor-pointer ${
                  actionType === 'pause'
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                Pause Video
              </button>
              <button
                type="button"
                onClick={() => setActionType('change_video')}
                className={`py-2 px-3 text-xs rounded-xl font-medium border transition cursor-pointer ${
                  actionType === 'change_video'
                    ? 'bg-rose-600 border-rose-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                Suggest Video
              </button>
            </div>
          </div>

          {actionType === 'change_video' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                YouTube Link / Video ID
              </label>
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtu.be/..."
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-400 font-medium">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg"
            >
              <Send className="w-4 h-4" />
              <span>Send Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
