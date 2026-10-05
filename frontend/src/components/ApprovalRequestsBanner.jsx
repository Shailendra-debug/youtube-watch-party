import React from 'react';
import { Check, X, Bell, Play, Video } from 'lucide-react';

export default function ApprovalRequestsBanner({
  requests = [],
  onApprove,
  onDismiss
}) {
  if (!requests || requests.length === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-auto">
      {requests.map((req) => (
        <div
          key={req.id}
          className="bg-slate-900 border border-amber-500/40 shadow-2xl rounded-xl p-3.5 flex items-center justify-between gap-3 text-sm animate-in slide-in-from-right"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg shrink-0">
              {req.requestedAction === 'change_video' ? (
                <Video className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white text-xs truncate">
                {req.username} requested {req.requestedAction === 'change_video' ? 'video change' : req.requestedAction}
              </p>
              {req.requestedVideoId && (
                <p className="text-[11px] text-slate-400 truncate">
                  ID: {req.requestedVideoId}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onApprove(req.id)}
              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition cursor-pointer shadow"
              title="Approve Action"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDismiss(req.id)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
