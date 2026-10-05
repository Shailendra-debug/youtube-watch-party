import React, { useState } from 'react';
import { LogIn, UserPlus, X } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onAuthSuccess({ mode, displayName, email, password });
      setPassword('');
      onClose();
    } catch (authError) {
      setError(authError.message || 'Could not authenticate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Close login dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-xl font-bold text-white">{mode === 'register' ? 'Create an account' : 'Log in'}</h2>
        <p className="mt-1 text-sm text-slate-400">Sign in while you watch to make your account available for host transfers.</p>

        {error && <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'register' && (
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Name
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={60}
                required
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm normal-case tracking-normal text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                placeholder="Your display name"
              />
            </label>
          )}

          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              maxLength={254}
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm normal-case tracking-normal text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder="you@example.com"
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={mode === 'register' ? 8 : undefined}
              maxLength={128}
              required
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm normal-case tracking-normal text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 font-semibold text-white hover:bg-rose-500 disabled:cursor-wait disabled:opacity-60"
          >
            {mode === 'register' ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {isSubmitting ? 'Please wait…' : mode === 'register' ? 'Register' : 'Log in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          {mode === 'register' ? 'Already registered?' : 'Need an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register');
              setError('');
            }}
            className="font-semibold text-rose-400 hover:text-rose-300"
          >
            {mode === 'register' ? 'Log in' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}
