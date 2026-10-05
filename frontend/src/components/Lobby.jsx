import React, { useState, useEffect } from 'react';
import { 
  Tv, 
  Users, 
  Sparkles,
  LogIn, 
  Zap, 
  MessageSquare
} from 'lucide-react';
import { extractYouTubeId } from '../utils/youtube';

export default function Lobby({
  onJoinRoom,
  defaultRoomCode = '',
  authUser,
  authLoading = false,
  onAuthSuccess,
  onLogout,
  serverError = '',
  roomNotice = ''
}) {
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'join'
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState(defaultRoomCode);
  const [initialVideoUrl, setInitialVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Auto-switch to join tab if roomCode is in query params
  useEffect(() => {
    if (defaultRoomCode) {
      setRoomCode(defaultRoomCode);
      setActiveTab('join');
    }
  }, [defaultRoomCode]);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!authUser) {
      setError('Log in or register to host a watch party.');
      return;
    }
    let vid = 'jfKfPfyJRdk'; // Default Lofi Hip Hop
    if (initialVideoUrl.trim()) {
      const extracted = extractYouTubeId(initialVideoUrl);
      if (!extracted) {
        setError('Invalid YouTube URL or ID.');
        return;
      }
      vid = extracted;
    }

    // Generate readable random code
    const generatedCode = 'WP-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    onJoinRoom({
      roomId: generatedCode,
      username: authUser.displayName,
      isCreator: true,
      initialVideoId: vid
    });
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmittingAuth(true);
    try {
      await onAuthSuccess({
        mode: authMode,
        displayName: authName,
        email: authEmail,
        password: authPassword
      });
      setAuthPassword('');
    } catch (authError) {
      setError(authError.message || 'Could not authenticate. Please try again.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code.');
      return;
    }

    onJoinRoom({
      roomId: roomCode.trim().toUpperCase(),
      username: username.trim(),
      isCreator: false
    });
  };

  return (
    <div className="club-lobby min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      <div className="lobby-shell relative z-10 w-full">
        <section className="lobby-story">
          <div className="lobby-brandline">
            <span className="lobby-brandmark"><Tv className="w-5 h-5" /></span>
            <span>SyncPlay <i>Social Cinema</i></span>
          </div>
          <p className="lobby-edition">A little room for your people</p>
          <h1 className="lobby-headline">Pick a film.<br /><em>Pull up a chair.</em></h1>
          <p className="lobby-intro">A shared screen for the clips, concerts, comfort shows and late-night rabbit holes you want to watch together.</p>
          <div className="lobby-rule" />
          <div className="lobby-notes">
            <div><span className="lobby-note-index">01</span><span><strong>One room, one rhythm</strong><small>Playback stays together for everyone.</small></span><Zap /></div>
            <div><span className="lobby-note-index">02</span><span><strong>Bring the whole crew</strong><small>Friends can join with a room code.</small></span><Users /></div>
            <div><span className="lobby-note-index">03</span><span><strong>Keep the side comments</strong><small>Chat and reactions live beside the video.</small></span><MessageSquare /></div>
          </div>
          <p className="lobby-footnote"><span className="lobby-live-dot" /> MADE FOR WATCHING TOGETHER</p>
        </section>

        <section className="lobby-workspace">
          <div className="lobby-form-topline"><span>{activeTab === 'create' ? 'YOUR SCREENING ROOM' : 'YOU’RE INVITED'}</span><span>SYNCPLAY / 01</span></div>

        {/* Tab Toggle */}
        <div className="lobby-tabs flex bg-slate-900/90 border border-slate-800 p-1 rounded-2xl mb-6 shadow-inner">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setError('');
            }}
            className={`lobby-tab flex-1 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'create'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Create Party</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('join');
              setError('');
            }}
            className={`lobby-tab flex-1 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'join'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Join Room</span>
          </button>
        </div>

        {/* Card Form */}
        <div className="lobby-form-panel bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          {roomNotice && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
              {roomNotice}
            </div>
          )}
          {(error || serverError) && (
            <div className="mb-4 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 px-3.5 py-2 rounded-xl">
              {error || serverError}
            </div>
          )}

          {activeTab === 'create' && !authUser ? (
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{authMode === 'register' ? 'Create your host account' : 'Host login'}</h2>
                <p className="text-xs text-slate-400 mt-1">You need an account to host. Guests can join with a room code without logging in.</p>
              </div>

              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Your Name</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="e.g., Alex"
                    autoComplete="name"
                    minLength={2}
                    maxLength={60}
                    required
                    className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Email</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  maxLength={254}
                  required
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder={authMode === 'register' ? 'At least 8 characters' : 'Your password'}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  minLength={authMode === 'register' ? 8 : undefined}
                  maxLength={128}
                  required
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth || authLoading}
                className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 disabled:opacity-60 text-white font-semibold rounded-xl shadow-lg shadow-rose-900/40 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{isSubmittingAuth ? 'Please wait…' : authMode === 'register' ? 'Register as Host' : 'Log in to Host'}</span>
              </button>

              <p className="text-center text-xs text-slate-400">
                {authMode === 'register' ? 'Already have a host account?' : 'New to SyncPlay?'}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'register' ? 'login' : 'register');
                    setError('');
                  }}
                  className="text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                >
                  {authMode === 'register' ? 'Log in' : 'Create an account'}
                </button>
              </p>
            </form>
          ) : activeTab === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs text-emerald-300 font-semibold">Logged in as {authUser.displayName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{authUser.email}</p>
                </div>
                <button type="button" onClick={onLogout} className="text-xs text-slate-400 hover:text-white cursor-pointer">Log out</button>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Host Name</p>
                <p className="text-sm text-white px-1">{authUser.displayName}</p>
              </div>

              <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Starting Video (Optional)
                </label>
                <input
                  type="text"
                  value={initialVideoUrl}
                  onChange={(e) => setInitialVideoUrl(e.target.value)}
                  placeholder="YouTube URL or leave empty for Lofi Beats"
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition text-sm"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Defaults to relaxed Lofi Girl radio if not provided.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-semibold rounded-xl shadow-lg shadow-rose-900/40 flex items-center justify-center gap-2 transition hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Start Watch Party (Host)</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Room Code
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WP-4829"
                  required
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono tracking-widest text-sm uppercase transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Your Display Name
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g., Sarah"
                  required
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition text-sm"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold rounded-xl shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 transition hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Join Watch Room</span>
                </button>
              </div>
            </form>
          )}
        </div>

        </section>
      </div>
    </div>
  );
}
