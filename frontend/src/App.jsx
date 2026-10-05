import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Tv, 
  Crown, 
  Shield, 
  User, 
  Share2, 
  Check, 
  LogOut, 
  Users, 
  MessageSquare, 
  AlertCircle, 
  Copy,
  RotateCcw,
  Power,
  LogIn
} from 'lucide-react';

import Lobby from './components/Lobby';
import AuthModal from './components/AuthModal';
import YouTubePlayer from './components/YouTubePlayer';
import ParticipantsPanel from './components/ParticipantsPanel';
import ChatAndReactions from './components/ChatAndReactions';
import ChangeVideoBar from './components/ChangeVideoBar';
import ApprovalRequestsBanner from './components/ApprovalRequestsBanner';
import { KickedModal, RequestActionModal } from './components/Modals';

// Use the current origin by default so a single Render service handles the UI,
// API, and Socket.IO. Ignore loopback URLs in production; they only exist on
// the developer's machine and are unreachable from deployed browsers.
const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
const configuredServerIsLoopback = (() => {
  if (!configuredServerUrl) return false;
  try {
    const hostname = new URL(configuredServerUrl, window.location.origin).hostname;
    return hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || /^127(?:\.\d{1,3}){3}$/.test(hostname)
      || hostname === '[::1]';
  } catch {
    return false;
  }
})();
const SERVER_URL = import.meta.env.PROD && configuredServerIsLoopback
  ? window.location.origin
  : configuredServerUrl || window.location.origin;
const SOCKET_URL = SERVER_URL;
const API_URL = SERVER_URL.replace(/\/$/, '');
const AUTH_TOKEN_KEY = 'syncplay_host_token';
const HOST_ROOM_KEY = 'syncplay_host_room';

function readSavedHostRoom() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(HOST_ROOM_KEY) || 'null');
    return saved?.roomId && saved?.ownerId ? saved : null;
  } catch {
    window.localStorage.removeItem(HOST_ROOM_KEY);
    return null;
  }
}

function saveHostRoom(roomId, ownerId, displayName = '') {
  if (!roomId || !ownerId) return;
  try {
    window.localStorage.setItem(HOST_ROOM_KEY, JSON.stringify({
      roomId: roomId.toUpperCase(),
      ownerId,
      displayName
    }));
  } catch (error) {
    console.warn('[SyncPlay] Could not save the host room for automatic return:', error);
  }
}

function clearSavedHostRoom(roomId) {
  try {
    const saved = readSavedHostRoom();
    if (!roomId || saved?.roomId === roomId.toUpperCase()) {
      window.localStorage.removeItem(HOST_ROOM_KEY);
    }
  } catch {
    window.localStorage.removeItem(HOST_ROOM_KEY);
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[SyncPlay Crash caught by ErrorBoundary]:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="bg-slate-900 border border-rose-500/50 p-8 rounded-3xl max-w-lg shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-rose-400">Oops, playback interface error</h2>
            <p className="text-sm text-slate-300">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.href = '/'; }}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl font-medium text-sm transition cursor-pointer shadow-lg"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function WatchPartyMain() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [lobbyError, setLobbyError] = useState('');

  // Room & User State
  const [roomId, setRoomId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState('');
  const [userRole, setUserRole] = useState('participant'); // 'host' | 'moderator' | 'participant'
  const [participants, setParticipants] = useState([]);
  
  // Playback State
  const [syncState, setSyncState] = useState({
    videoId: 'jfKfPfyJRdk',
    playState: 'paused',
    currentTime: 0,
    lastUpdatedAt: Date.now(),
    hostId: null
  });

  // Chat & Reactions
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);

  // Modals & Requests
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [kickedMessage, setKickedMessage] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState('chat');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [roomNotice, setRoomNotice] = useState('');

  // Ref to track current userId without recreating socket
  const userIdRef = useRef(userId);
  const authUserRef = useRef(authUser);
  const roomSessionRef = useRef(null);
  const autoRejoinAttemptedRef = useRef(false);
  const autoRejoinInProgressRef = useRef(false);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  // Read URL query params for auto-join code
  const [initialRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    return code ? code.toUpperCase() : '';
  });

  // Initialize Socket connection once on mount
  useEffect(() => {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setAuthReady(true);
      return undefined;
    }

    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          const authError = new Error(data.error || 'Could not restore your account session.');
          authError.status = response.status;
          throw authError;
        }
        setAuthUser(data.user);
        authUserRef.current = data.user;
      })
      .catch((authError) => {
        if (authError.status === 401 || authError.status === 403) {
          window.localStorage.removeItem(AUTH_TOKEN_KEY);
          setAuthUser(null);
          authUserRef.current = null;
          return;
        }

        setLobbyError('Account service is temporarily unavailable. Your saved login and host room are kept; try again shortly.');
      })
      .finally(() => setAuthReady(true));
  }, []);

  // Initialize Socket connection once on mount
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      auth: (callback) => callback({ token: window.localStorage.getItem(AUTH_TOKEN_KEY) }),
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected to server, socketId:', newSocket.id);
      setIsConnected(true);
      if (roomSessionRef.current) {
        newSocket.emit('join_room', roomSessionRef.current);
      }
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
      setIsConnected(false);
    });

    // Joined room confirmation
    newSocket.on('joined_successfully', (data) => {
      console.log('[Socket] Joined successfully:', data);
      setRoomId(data.roomId);
      setLobbyError('');
      setRoomNotice('');
      setUserId(data.userId);
      setUserRole(data.role);
      if (data.username) setUsername(data.username);
      autoRejoinInProgressRef.current = false;
      const savedRoom = readSavedHostRoom();
      if (data.isRoomOwner && !authUserRef.current && savedRoom?.roomId === data.roomId) {
        const resumedUser = {
          id: savedRoom.ownerId,
          email: '',
          displayName: savedRoom.displayName || data.username || 'Host'
        };
        setAuthUser(resumedUser);
        authUserRef.current = resumedUser;
      }
      if (data.role === 'host' && data.isRoomOwner && authUserRef.current?.id) {
        saveHostRoom(data.roomId, authUserRef.current.id, authUserRef.current.displayName);
      }
      roomSessionRef.current = {
        roomId: data.roomId,
        username: data.username || username,
        isCreator: false
      };
      if (data.room) {
        setParticipants(data.room.participants || []);
        if (data.room.recentMessages) {
          setMessages(data.room.recentMessages);
        }
      }
    });

    // Central playback state broadcast
    newSocket.on('sync_state', (incomingState) => {
      setSyncState(incomingState);
    });

    // Participants updates
    newSocket.on('user_joined', ({ username, role, participants }) => {
      setParticipants(participants || []);
      showToast(`${username} joined as ${role}`);
    });

    newSocket.on('user_left', ({ username, participants }) => {
      setParticipants(participants || []);
      showToast(`${username} left the room`);
    });

    newSocket.on('role_assigned', ({ userId: targetId, username, role, isRoomOwner, participants }) => {
      setParticipants(participants || []);
      if (targetId === newSocket.id || targetId === userIdRef.current) {
        setUserRole(role);
        const activeRoomId = roomSessionRef.current?.roomId;
        if (role === 'host' && isRoomOwner && authUserRef.current?.id) {
          saveHostRoom(activeRoomId, authUserRef.current.id, authUserRef.current.displayName);
        } else {
          clearSavedHostRoom(activeRoomId);
        }
        showToast(`Your role was updated to ${role.toUpperCase()}!`);
      } else {
        showToast(`${username} is now ${role}`);
      }
    });

    newSocket.on('participant_removed', ({ username, participants }) => {
      setParticipants(participants || []);
      showToast(`${username} was removed from the party`);
    });

    // Kicked handler
    newSocket.on('kicked_from_room', ({ message }) => {
      roomSessionRef.current = null;
      setKickedMessage(message);
    });

    newSocket.on('room_ended', ({ message, roomId: endedRoomId }) => {
      clearSavedHostRoom(endedRoomId);
      autoRejoinInProgressRef.current = false;
      roomSessionRef.current = null;
      setRoomNotice(message || 'This watch party has ended.');
      setRoomId(null);
      setUserId(null);
      setUsername('');
      setUserRole('participant');
      setIsAuthModalOpen(false);
      setParticipants([]);
      setMessages([]);
      setPendingRequests([]);
      setSyncState({
        videoId: 'jfKfPfyJRdk',
        playState: 'paused',
        currentTime: 0,
        lastUpdatedAt: Date.now(),
        hostId: null
      });
    });

    // Chat messages
    newSocket.on('chat_message', (msg) => {
      if (msg) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    // Floating reaction
    newSocket.on('receive_reaction', (reaction) => {
      if (reaction) {
        setReactions((prev) => [...prev, reaction]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
        }, 2300);
      }
    });

    // Control requests from participants
    newSocket.on('control_request_received', (req) => {
      if (req) {
        setPendingRequests((prev) => [...prev, req]);
      }
    });

    newSocket.on('request_resolved', ({ requestId, approvedBy }) => {
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToast(`Request was approved by ${approvedBy}`);
    });

    // Permission denied notification
    newSocket.on('permission_denied', ({ message }) => {
      showToast(`⚠️ ${message}`, true);
    });

    newSocket.on('error_message', ({ message }) => {
      if (autoRejoinInProgressRef.current || roomSessionRef.current?.isCreator) {
        const failedSession = roomSessionRef.current;
        const isDefinitiveRoomFailure = /was not found|watch party has ended/i.test(message || '');
        if (failedSession?.isCreator || isDefinitiveRoomFailure) {
          clearSavedHostRoom(failedSession?.roomId);
          roomSessionRef.current = null;
        }
        autoRejoinInProgressRef.current = false;
        setRoomNotice('');
      }
      setLobbyError(message || 'Could not join this room.');
      showToast(`❌ ${message}`, true);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Return a signed-in host to their last room after a tab close or refresh.
  useEffect(() => {
    if (!authReady || !socket?.connected || roomId || autoRejoinAttemptedRef.current) return;

    const savedRoom = readSavedHostRoom();
    const hasAuthToken = Boolean(window.localStorage.getItem(AUTH_TOKEN_KEY));
    if (!savedRoom || (!authUser && !hasAuthToken)) return;
    if (authUser && savedRoom.ownerId !== authUser.id) return;
    if (initialRoomCode && savedRoom.roomId !== initialRoomCode) return;

    autoRejoinAttemptedRef.current = true;
    autoRejoinInProgressRef.current = true;
    const session = {
      roomId: savedRoom.roomId,
      username: authUser?.displayName || savedRoom.displayName || 'Host',
      isCreator: false,
      restoreHostAccountId: savedRoom.ownerId
    };
    roomSessionRef.current = session;
    if (authUser?.displayName) setUsername(authUser.displayName);
    setRoomNotice('Returning to your last watch room…');
    socket.emit('join_room', session);
  }, [authReady, authUser, socket, isConnected, roomId, initialRoomCode]);

  const showToast = (msg, isError = false) => {
    setToastMessage({ text: msg, isError });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Join Room from Lobby
  const handleJoinRoom = ({ roomId: code, username: name, isCreator, initialVideoId }) => {
    if (!socket) return;
    setLobbyError('');
    setRoomNotice('');
    setUsername(name);
    const joinPayload = {
      roomId: code,
      username: name,
      isCreator,
      initialVideoId
    };
    if (isCreator && authUser?.id) {
      saveHostRoom(code, authUser.id, authUser.displayName);
    }
    roomSessionRef.current = joinPayload;
    if (socket.connected) socket.emit('join_room', joinPayload);
  };

  const handleAuthSuccess = async ({ mode, displayName, email, password }) => {
    const response = await fetch(`${API_URL}/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, email, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not authenticate.');

    window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setAuthUser(data.user);
    authUserRef.current = data.user;
    if (socket) {
      socket.auth = (callback) => callback({ token: data.token });
      if (socket.connected) socket.disconnect();
      socket.connect();
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthUser(null);
    authUserRef.current = null;
    if (socket) {
      socket.auth = (callback) => callback({});
      if (socket.connected) socket.disconnect();
      socket.connect();
    }
  };

  // Leave Room
  const handleLeaveRoom = () => {
    if (userRole === 'host' && roomId) clearSavedHostRoom(roomId);
    autoRejoinInProgressRef.current = false;
    roomSessionRef.current = null;
    setIsAuthModalOpen(false);
    if (socket && roomId) {
      socket.emit('leave_room', { roomId });
    }
    setRoomId(null);
    setUserId(null);
    setUserRole('participant');
    setParticipants([]);
    setMessages([]);
    setPendingRequests([]);
  };

  const handleEndRoom = () => {
    if (socket && roomId) socket.emit('end_room');
  };

  // Playback Control Callbacks
  const handlePlay = (currentTime) => {
    if (socket) {
      socket.emit('play', { currentTime });
    }
  };

  const handlePause = (currentTime) => {
    if (socket) {
      socket.emit('pause', { currentTime });
    }
  };

  const handleSeek = (time) => {
    if (socket) {
      socket.emit('seek', { time });
    }
  };

  const handleChangeVideo = (videoId) => {
    if (socket) {
      socket.emit('change_video', { videoId });
    }
  };

  // Role Management Callbacks (Host Only)
  const handleAssignRole = (targetUserId, newRole) => {
    if (socket) {
      socket.emit('assign_role', { userId: targetUserId, role: newRole });
    }
  };

  const handleTransferHost = (targetUserId) => {
    if (socket) {
      socket.emit('transfer_host', { userId: targetUserId });
    }
  };

  const handleRemoveParticipant = (targetUserId) => {
    if (socket) {
      socket.emit('remove_participant', { userId: targetUserId });
    }
  };

  // Participant Request Action
  const handleRequestAction = (requestData) => {
    if (socket) {
      socket.emit('request_action', requestData);
      showToast('Request submitted to Host!');
    }
  };

  const handleApproveRequest = (requestId) => {
    if (socket) {
      socket.emit('approve_request', { requestId });
    }
  };

  const handleDismissRequest = (requestId) => {
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  // Chat & Reaction Callbacks
  const handleSendMessage = (text) => {
    if (socket) {
      socket.emit('chat_message', { text });
    }
  };

  const handleSendReaction = (emoji) => {
    if (socket) {
      socket.emit('send_reaction', { emoji });
    }
  };

  // Copy Invite Link
  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    showToast('Room invite link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const isHost = userRole === 'host';
  const canControl = userRole === 'host' || userRole === 'moderator';

  // If not joined in a room yet, render Lobby
  if (!roomId) {
    return (
      <Lobby 
        onJoinRoom={handleJoinRoom} 
        defaultRoomCode={initialRoomCode} 
        authUser={authUser}
        authLoading={!authReady}
        onAuthSuccess={handleAuthSuccess}
        onLogout={handleLogout}
        serverError={lobbyError}
        roomNotice={roomNotice}
      />
    );
  }

  return (
    <div className="watch-app min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Toast Alert */}
      {toastMessage && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 border animate-in slide-in-from-top-2 ${
          toastMessage.isError
            ? 'bg-rose-950/90 text-rose-200 border-rose-800'
            : 'bg-slate-900/90 text-slate-100 border-slate-700'
        }`}>
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Approval Requests Banner for Host/Mod */}
      <ApprovalRequestsBanner
        requests={pendingRequests}
        onApprove={handleApproveRequest}
        onDismiss={handleDismissRequest}
      />

      {/* Kicked Modal */}
      <KickedModal
        message={kickedMessage}
        onConfirm={() => {
          setKickedMessage(null);
          handleLeaveRoom();
        }}
      />

      {/* Request Action Modal for Participants */}
      <RequestActionModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSubmitRequest={handleRequestAction}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Top Navigation Bar */}
      <header className="watch-header h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between z-30 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-indigo-600 flex items-center justify-center shadow-md">
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-white text-base leading-none">SyncPlay</h1>
              <span className="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded font-mono font-medium">
                ROOM: {roomId}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>{(participants || []).length} watching</span>
              <span>•</span>
              <span className="text-emerald-400">● Live Synced</span>
            </p>
          </div>
        </div>

        {/* Center / Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* User Role Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs">
            {isHost ? (
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                <Crown className="w-3.5 h-3.5 fill-amber-400" /> Host
              </span>
            ) : userRole === 'moderator' ? (
              <span className="flex items-center gap-1 text-indigo-400 font-semibold">
                <Shield className="w-3.5 h-3.5 fill-indigo-400" /> Moderator
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-400 font-medium">
                <User className="w-3.5 h-3.5" /> Participant
              </span>
            )}
            <span className="text-slate-500">|</span>
            <span className="text-slate-200 font-medium">{username}</span>
          </div>

          {/* Copy Link Button */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
            title="Copy Invite Link"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Invite Link</span>
          </button>

          {!authUser && (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-600/20 hover:text-white cursor-pointer"
              title="Log in or register"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log in</span>
            </button>
          )}

          {isHost && (
            <button
              onClick={() => {
                if (window.confirm('End this watch party for everyone?')) handleEndRoom();
              }}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 hover:text-amber-200 cursor-pointer"
              title="End this watch party for everyone"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">End Room</span>
            </button>
          )}

          {/* Leave Button */}
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 hover:text-rose-300 text-xs font-semibold border border-rose-500/20 transition cursor-pointer"
            title="Leave Watch Party"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="watch-layout flex-1 p-3 sm:p-5 max-w-[1700px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-hidden">
        {/* Left Column: Video Player & Video Change Controls */}
        <section className="watch-main lg:col-span-8 flex flex-col gap-4">
          {/* Synchronized Player */}
          <YouTubePlayer
            videoId={syncState?.videoId || 'jfKfPfyJRdk'}
            syncState={syncState}
            canControl={canControl}
            userRole={userRole}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRequestControl={() => setIsRequestModalOpen(true)}
          />

          {/* Video Change Bar */}
          <ChangeVideoBar
            currentVideoId={syncState?.videoId || 'jfKfPfyJRdk'}
            canControl={canControl}
            onChangeVideo={handleChangeVideo}
            onRequestVideoChange={(vid) => handleRequestAction({ action: 'change_video', videoId: vid })}
          />
        </section>

        {/* Right Column: Participants List & Live Chat */}
        <section className="watch-side lg:col-span-4 flex flex-col gap-4 min-h-[500px] lg:h-[calc(100vh-6.5rem)]">
          {/* Mobile Tab Selector */}
          <div className="flex sm:hidden bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveMobileTab('chat')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 ${
                activeMobileTab === 'chat' ? 'bg-rose-600 text-white' : 'text-slate-400'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Chat
            </button>
            <button
              onClick={() => setActiveMobileTab('participants')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 ${
                activeMobileTab === 'participants' ? 'bg-rose-600 text-white' : 'text-slate-400'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Participants ({(participants || []).length})
            </button>
          </div>

          {/* Desktop Dual View / Mobile Tab View */}
          <div className="flex-1 flex flex-col gap-4 h-full overflow-hidden">
            {/* Participants Panel */}
            <div className={`h-1/3 min-h-[160px] ${activeMobileTab === 'participants' ? 'block' : 'hidden sm:block'}`}>
              <ParticipantsPanel
                participants={participants || []}
                currentUserId={userId}
                isHost={isHost}
                onAssignRole={handleAssignRole}
                onRemoveParticipant={handleRemoveParticipant}
                onTransferHost={handleTransferHost}
              />
            </div>

            {/* Chat & Floating Reactions */}
            <div className={`flex-1 min-h-[280px] ${activeMobileTab === 'chat' ? 'block' : 'hidden sm:block'}`}>
              <ChatAndReactions
                messages={messages || []}
                reactions={reactions || []}
                currentUserId={userId}
                onSendMessage={handleSendMessage}
                onSendReaction={handleSendReaction}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WatchPartyMain />
    </ErrorBoundary>
  );
}
