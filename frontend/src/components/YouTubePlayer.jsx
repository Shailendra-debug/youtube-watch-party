import React, { useEffect, useRef, useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Lock, 
  Sparkles,
  RefreshCw,
  HandMetal
} from 'lucide-react';
import { formatTime } from '../utils/youtube';

export default function YouTubePlayer({
  videoId = 'jfKfPfyJRdk',
  syncState,
  canControl,
  userRole,
  onPlay,
  onPause,
  onSeek,
  onRequestControl,
  canRequestControl = true
}) {
  const containerRef = useRef(null);
  const playerMountRef = useRef(null);
  const playerRef = useRef(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Lock flag to prevent echo loops when remote sync commands are executed
  const isRemoteAction = useRef(false);
  const liveCallbacks = useRef({ canControl, onPlay, onPause });
  liveCallbacks.current = { canControl, onPlay, onPause };

  // Load YouTube IFrame API script safely
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }

    const checkYT = setInterval(() => {
      if (window.YT && window.YT.Player && playerMountRef.current) {
        clearInterval(checkYT);
        initPlayer();
      }
    }, 150);

    return () => {
      clearInterval(checkYT);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // ignore cleanup errors
        }
        playerRef.current = null;
      }
    };
  }, []);

  // Initialize YT Player
  const initPlayer = () => {
    if (playerRef.current || !playerMountRef.current || !window.YT || !window.YT.Player) return;

    try {
      playerRef.current = new window.YT.Player(playerMountRef.current, {
        videoId: videoId || 'jfKfPfyJRdk',
        playerVars: {
          autoplay: 0,
          controls: 0, // Disable default controls for synchronized unified controls
          disablekb: 1,
          enablejsapi: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          fs: 0
        },
        events: {
          onReady: (event) => {
            setIsPlayerReady(true);
            try {
              setDuration(event.target.getDuration() || 0);
              event.target.setVolume(80);
            } catch (e) {}
          },
          onStateChange: (event) => {
            try {
              if (event.data === window.YT.PlayerState.BUFFERING) {
                setIsBuffering(true);
              } else {
                setIsBuffering(false);
              }

              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                const d = playerRef.current?.getDuration?.();
                if (d) setDuration(d);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              }

              // If state change was caused by remote sync, ignore
              if (isRemoteAction.current) {
                return;
              }

              // Role check: Only Host or Moderator can propagate user-initiated state changes
              const callbacks = liveCallbacks.current;
              if (callbacks.canControl && playerRef.current) {
                const cur = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
                if (event.data === window.YT.PlayerState.PLAYING) {
                  callbacks.onPlay(cur);
                } else if (event.data === window.YT.PlayerState.PAUSED) {
                  callbacks.onPause(cur);
                }
              }
            } catch (err) {
              console.warn('[YouTube onStateChange]', err);
            }
          },
          onError: (e) => {
            console.error('[YouTube API Error]', e);
          }
        }
      });
    } catch (err) {
      console.error('[YouTube initPlayer Error]', err);
    }
  };

  // Poll current time for scrubber progress
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        if (playerRef.current && isPlayerReady && typeof playerRef.current.getCurrentTime === 'function') {
          const time = playerRef.current.getCurrentTime();
          if (typeof time === 'number' && !isNaN(time)) {
            setCurrentTime(time);
          }
          const dur = playerRef.current.getDuration();
          if (dur && dur !== duration) {
            setDuration(dur);
          }
        }
      } catch (e) {}
    }, 500);

    return () => clearInterval(timer);
  }, [isPlayerReady, duration]);

  // Synchronize incoming server sync_state
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady || !syncState) return;

    try {
      const { videoId: incomingVideoId, playState, currentTime: incomingTime } = syncState;

      isRemoteAction.current = true;

      // Check if video changed
      let currentVid = null;
      if (typeof playerRef.current.getVideoData === 'function') {
        const data = playerRef.current.getVideoData();
        currentVid = data?.video_id;
      }

      if (incomingVideoId && currentVid !== incomingVideoId && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.loadVideoById({
          videoId: incomingVideoId,
          startSeconds: incomingTime || 0
        });
        if (playState === 'paused' && typeof playerRef.current.pauseVideo === 'function') {
          playerRef.current.pauseVideo();
        }
        setTimeout(() => {
          isRemoteAction.current = false;
        }, 1000);
        return;
      }

      // Check seek drift (threshold: > 1.8 seconds)
      if (typeof playerRef.current.getCurrentTime === 'function') {
        const localTime = playerRef.current.getCurrentTime();
        const drift = Math.abs(localTime - (incomingTime || 0));
        if (drift > 1.8 && typeof playerRef.current.seekTo === 'function') {
          playerRef.current.seekTo(incomingTime, true);
        }
      }

      // Check play/pause state
      if (typeof playerRef.current.getPlayerState === 'function') {
        const currentYTState = playerRef.current.getPlayerState();
        if (playState === 'playing' && currentYTState !== window.YT.PlayerState.PLAYING) {
          playerRef.current.playVideo?.();
        } else if (playState === 'paused' && currentYTState === window.YT.PlayerState.PLAYING) {
          playerRef.current.pauseVideo?.();
        }
      }
    } catch (err) {
      console.warn('[Sync Handler Error]', err);
    }

    const timeout = setTimeout(() => {
      isRemoteAction.current = false;
    }, 600);

    return () => clearTimeout(timeout);
  }, [syncState, isPlayerReady, canControl]);

  // UI Handlers
  const handleTogglePlay = () => {
    if (!canControl || !playerRef.current) return;

    try {
      if (isPlaying) {
        const cur = playerRef.current.getCurrentTime?.() || 0;
        isRemoteAction.current = true;
        playerRef.current.pauseVideo?.();
        onPause(cur);
        setTimeout(() => { isRemoteAction.current = false; }, 300);
      } else {
        const cur = playerRef.current.getCurrentTime?.() || 0;
        isRemoteAction.current = true;
        playerRef.current.playVideo?.();
        onPlay(cur);
        setTimeout(() => { isRemoteAction.current = false; }, 300);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSeekChange = (e) => {
    if (!canControl || !playerRef.current) return;
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    try {
      isRemoteAction.current = true;
      playerRef.current.seekTo?.(newTime, true);
      onSeek(newTime);
      setTimeout(() => { isRemoteAction.current = false; }, 400);
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualSync = () => {
    if (!syncState || !playerRef.current) return;
    try {
      isRemoteAction.current = true;
      playerRef.current.seekTo?.(syncState.currentTime || 0, true);
      if (syncState.playState === 'playing') {
        playerRef.current.playVideo?.();
      } else {
        playerRef.current.pauseVideo?.();
      }
      setTimeout(() => { isRemoteAction.current = false; }, 500);
    } catch (e) {}
  };

  const handleVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (playerRef.current) {
      try {
        playerRef.current.setVolume?.(val);
        if (val === 0) {
          setIsMuted(true);
        } else if (isMuted) {
          setIsMuted(false);
          playerRef.current.unMute?.();
        }
      } catch (e) {}
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    try {
      if (isMuted) {
        playerRef.current.unMute?.();
        playerRef.current.setVolume?.(volume || 50);
        setIsMuted(false);
      } else {
        playerRef.current.mute?.();
        setIsMuted(true);
      }
    } catch (e) {}
  };

  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.();
      }
    } catch (e) {}
  };

  const safeDuration = duration > 0 ? duration : 100;
  const safeTime = Math.min(currentTime, safeDuration);
  const progressPercent = Math.min(100, Math.max(0, (safeTime / safeDuration) * 100));

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800/80 group select-none flex flex-col justify-end"
    >
      {/* YouTube IFrame Mount Target */}
      <div className={`absolute inset-0 w-full h-full ${canControl ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div ref={playerMountRef} className="w-full h-full" />
      </div>

      {/* Participant Read-Only / Control Overlay */}
      {!canControl && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/50 text-xs font-medium text-slate-300 shadow-lg">
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>{userRole === 'viewer' ? 'Viewer mode · watching together' : 'Synced with Host'}</span>
          {canRequestControl && (
            <button
              onClick={onRequestControl}
              className="ml-2 px-2 py-0.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
              title="Request Host to allow playback control"
            >
              <HandMetal className="w-3 h-3" />
              Request Action
            </button>
          )}
        </div>
      )}

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500" />
        </div>
      )}

      {/* Unified Synchronized Custom Control Bar */}
      <div className="relative z-20 w-full bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pt-12 pb-3 px-4 transition-opacity duration-200">
        {/* Scrubber Progress Bar */}
        <div className="relative flex items-center group/scrubber mb-2">
          <input
            type="range"
            min={0}
            max={safeDuration}
            step={0.5}
            value={safeTime}
            onChange={handleSeekChange}
            disabled={!canControl}
            className="w-full h-1.5 rounded-lg appearance-none bg-slate-700/60 accent-rose-500 hover:h-2 transition-all cursor-pointer disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(to right, #f43f5e ${progressPercent}%, rgba(51, 65, 85, 0.7) ${progressPercent}%)`
            }}
          />
        </div>

        <div className="flex items-center justify-between text-white text-sm">
          {/* Left Controls: Play/Pause, Rewind, Time Display */}
          <div className="flex items-center gap-3">
            {canControl ? (
              <button
                onClick={handleTogglePlay}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-rose-600 hover:bg-rose-500 text-white transition shadow-md hover:scale-105 active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pause for everyone' : 'Play for everyone'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>
            ) : (
              <div 
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 cursor-not-allowed opacity-80"
                title="Participant mode: Host controls playback"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </div>
            )}

            {/* Quick Seek Rewind 10s */}
            {canControl && (
              <button
                onClick={() => {
                  const targetTime = Math.max(0, currentTime - 10);
                  try {
                    playerRef.current?.seekTo?.(targetTime, true);
                    onSeek(targetTime);
                  } catch (e) {}
                }}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}

            {/* Re-sync Button */}
            <button
              onClick={handleManualSync}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700/60 cursor-pointer"
              title="Force re-align your player to server sync time"
            >
              <RefreshCw className="w-3 h-3 text-rose-400" />
              <span>Sync</span>
            </button>

            {/* Current / Total Time */}
            <span className="text-xs font-mono text-slate-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls: Volume Slider & Fullscreen */}
          <div className="flex items-center gap-4">
            {/* Volume Control */}
            <div className="flex items-center gap-2 group/volume">
              <button 
                onClick={toggleMute}
                className="text-slate-300 hover:text-white transition cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 rounded-lg appearance-none bg-slate-700 accent-rose-500 cursor-pointer"
              />
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullScreen}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
              title="Toggle Fullscreen"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
