'use client';

import React, { useState } from 'react';
import { useAuth } from '../../components/auth/AuthContext';
import Link from 'next/link';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Zap,
  Shield,
  Video,
} from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await register({ email, password, displayName });
      if (!res.success) {
        setError(res.error || 'Registration failed. Please check your information.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to connect to the server. Please check your network.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans relative overflow-hidden select-none transition-colors duration-200">
      {/* Ambient backdrop */}
      <div className="absolute inset-0 bg-radial from-indigo-500/10 via-transparent to-transparent pointer-events-none -z-10" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] bg-[var(--bg-surface)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] p-8 sm:p-10 transition-all backdrop-blur-xl">
          {/* Brand Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-indigo-500/25 shrink-0">
              T
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                  TeamTrack
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 uppercase tracking-wide">
                  Enterprise
                </span>
              </div>
              <span className="text-xs text-[var(--text-secondary)] font-medium">
                Unified Collaboration Workspace
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight mb-1">
            Create your account
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mb-6">
            Sign up to join your organization&apos;s workspace and collaborate with your team.
          </p>

          {/* Error Message Box */}
          {error && (
            <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-rose-400 text-xs animate-fadeIn">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                Full name
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-[var(--text-secondary)] pointer-events-none flex items-center">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  placeholder="Jane Doe"
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all hover:border-[var(--text-secondary)]/30"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                Work email
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-[var(--text-secondary)] pointer-events-none flex items-center">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="jane@company.com"
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all hover:border-[var(--text-secondary)]/30"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                Password
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-[var(--text-secondary)] pointer-events-none flex items-center">
                  <Lock size={16} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Create a strong password (min 8 chars)"
                  className="w-full h-10 pl-10 pr-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all hover:border-[var(--text-secondary)]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Create Account Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 mt-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
            >
              {isLoading ? (
                <span>Creating account...</span>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-5 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-secondary)]">
            <span>Already have an account? </span>
            <Link
              href="/login"
              className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
            >
              Sign in &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Modern Studio Footer */}
      <footer className="py-4 px-6 text-center text-xs text-[var(--text-secondary)] flex items-center justify-center gap-4 flex-wrap">
        <span>&copy; 2026 TeamTrack Studio &bull; Free Modern Collaboration</span>
        <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Privacy</a>
        <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Terms</a>
      </footer>
    </div>
  );
}
