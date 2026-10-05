import React, { useState } from 'react';
import { Video, Search, Check, Sparkles, SendHorizontal } from 'lucide-react';
import { extractYouTubeId, POPULAR_VIDEOS } from '../utils/youtube';

export default function ChangeVideoBar({
  currentVideoId,
  canControl,
  onChangeVideo,
  onRequestVideoChange
}) {
  const [inputUrl, setInputUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleApply = (urlToUse) => {
    setError('');
    setSuccess('');
    const target = urlToUse || inputUrl;
    const extractedId = extractYouTubeId(target);

    if (!extractedId) {
      setError('Please enter a valid YouTube URL or 11-character video ID.');
      return;
    }

    if (canControl) {
      onChangeVideo(extractedId);
      setInputUrl('');
      setSuccess('Video updated for all room members!');
      setTimeout(() => setSuccess(''), 3000);
    } else {
      onRequestVideoChange(extractedId);
      setInputUrl('');
      setSuccess('Video change request sent to Host/Moderator for approval!');
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Video className="w-5 h-5 text-rose-500" />
          </div>
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => {
              setInputUrl(e.target.value);
              setError('');
            }}
            placeholder="Paste YouTube link (e.g., https://youtu.be/... or watch?v=...)"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
          />
        </div>

        <button
          onClick={() => handleApply()}
          className={`px-5 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
            canControl
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {canControl ? (
            <>
              <Video className="w-4 h-4" />
              <span>Change Video</span>
            </>
          ) : (
            <>
              <SendHorizontal className="w-4 h-4" />
              <span>Suggest to Host</span>
            </>
          )}
        </button>
      </div>

      {/* Preset Quick Picks */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-slate-400 font-medium flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Quick Picks:
        </span>
        {POPULAR_VIDEOS.map((vid) => (
          <button
            key={vid.id}
            onClick={() => handleApply(vid.id)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] transition cursor-pointer ${
              currentVideoId === vid.id
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-semibold'
                : 'bg-slate-800/80 border-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {vid.title.split('-')[0].trim()}
          </button>
        ))}
      </div>

      {/* Feedback Messages */}
      {error && (
        <p className="text-xs text-rose-400 font-medium bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> {success}
        </p>
      )}
    </div>
  );
}
