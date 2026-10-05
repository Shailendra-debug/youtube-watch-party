import React from 'react';
import { 
  Crown, 
  Shield, 
  User, 
  MoreVertical, 
  UserMinus, 
  ArrowUpRight, 
  ShieldCheck, 
  ShieldAlert,
  Users
} from 'lucide-react';

export default function ParticipantsPanel({
  participants = [],
  currentUserId,
  isHost,
  onAssignRole,
  onRemoveParticipant,
  onTransferHost
}) {
  return (
    <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl flex flex-col h-full overflow-hidden shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-rose-500" />
          <h3 className="font-semibold text-white text-base">Participants</h3>
        </div>
        <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-300 font-mono">
          {participants.length} online
        </span>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {participants.map((p) => {
          const isCurrentUser = p.userId === currentUserId;
          const isUserHost = p.role === 'host';
          const isUserMod = p.role === 'moderator';

          return (
            <div
              key={p.userId}
              className={`flex items-center justify-between p-2.5 rounded-xl transition-all border ${
                isCurrentUser
                  ? 'bg-rose-950/20 border-rose-900/40'
                  : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-800/60'
              }`}
            >
              {/* User Avatar & Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-inner ${
                    isUserHost
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : isUserMod
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {(p?.username || 'U').charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-200 text-sm truncate">
                      {p?.username || 'Anonymous'}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.2 rounded font-mono">
                        You
                      </span>
                    )}
                  </div>

                  {/* Role Badge */}
                  <div className="flex items-center gap-1 text-xs mt-0.5">
                    {isUserHost && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                        <Crown className="w-3 h-3 fill-amber-400" /> Host
                      </span>
                    )}
                    {isUserMod && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-indigo-400 font-semibold">
                        <Shield className="w-3 h-3 fill-indigo-400" /> Moderator
                      </span>
                    )}
                    {!isUserHost && !isUserMod && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <User className="w-3 h-3" /> Participant
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Host Actions Dropdown/Menu for other participants */}
              {isHost && !isCurrentUser && (
                <div className="flex items-center gap-1">
                  {/* Role Toggle Button */}
                  {isUserMod ? (
                    <button
                      onClick={() => onAssignRole(p.userId, 'participant')}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700/60 rounded-lg transition"
                      title="Demote to Participant"
                    >
                      <ShieldAlert className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onAssignRole(p.userId, 'moderator')}
                      className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700/60 rounded-lg transition"
                      title="Promote to Moderator"
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                  )}

                  {/* Transfer Host */}
                  <button
                    onClick={() => {
                      if (window.confirm(`Transfer Host privileges to ${p.username}?`)) {
                        onTransferHost(p.userId);
                      }
                    }}
                    disabled={!p.isRegistered}
                    className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700/60 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                    title={p.isRegistered ? 'Transfer Host' : 'The new Host must have an account'}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>

                  {/* Kick Participant */}
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove ${p.username} from the watch party?`)) {
                        onRemoveParticipant(p.userId);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                    title="Remove user"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
