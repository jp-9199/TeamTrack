'use client';

import React, { useState } from 'react';
import { useAuth } from '../../components/auth/AuthContext';
import Link from 'next/link';
import {
  PersonRegular,
  MailRegular,
  LockClosedRegular,
  EyeRegular,
  EyeOffRegular,
  ArrowRightRegular,
  DismissCircleRegular,
} from '@fluentui/react-icons';
import { Tooltip, Spinner } from '@fluentui/react-components';

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
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#F3F4F6] text-[#242424] font-sans relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#EBF3FC] via-[#F3F4F6] to-[#ECEEF0] -z-10" />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] border border-[#E1DFDD] p-8 sm:p-10 transition-all">
          {/* Teams / TeamTrack Brand Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#5B5FC7] to-[#7B83EB] flex items-center justify-center text-white font-bold text-lg shadow-md shadow-[#5B5FC7]/20">
              <span>T</span>
            </div>
            <div>
              <span className="text-[17px] font-bold text-[#242424] tracking-tight block">
                TeamTrack
              </span>
              <span className="text-[11px] text-[#616161] font-medium tracking-wide uppercase">
                Microsoft Teams Collaboration
              </span>
            </div>
          </div>

          <h1 className="text-[22px] font-bold text-[#242424] tracking-tight mb-1">
            Create account
          </h1>
          <p className="text-[13px] text-[#616161] mb-6">
            Sign up to get started with TeamTrack
          </p>

          {/* Error Message Box */}
          {error && (
            <div className="mb-5 p-3 bg-[#FDF3F2] border border-[#F1707B] rounded-lg flex items-start gap-2.5 text-[#A80000] text-[13px] animate-fadeIn">
              <DismissCircleRegular fontSize={18} className="shrink-0 mt-0.5 text-[#D83B01]" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#242424]">
                Full name
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-[#5B5FC7] pointer-events-none flex items-center">
                  <PersonRegular fontSize={18} />
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  placeholder="Jane Doe"
                  className="w-full h-[40px] pl-10 pr-3 rounded-lg border border-[#D1D5DB] bg-white text-[13.5px] text-[#242424] placeholder-[#8A8886] focus:outline-none focus:border-[#5B5FC7] focus:ring-1 focus:ring-[#5B5FC7] transition-all hover:border-[#B0B5BA]"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#242424]">
                Email address
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-[#5B5FC7] pointer-events-none flex items-center">
                  <MailRegular fontSize={18} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="user@company.com"
                  className="w-full h-[40px] pl-10 pr-3 rounded-lg border border-[#D1D5DB] bg-white text-[13.5px] text-[#242424] placeholder-[#8A8886] focus:outline-none focus:border-[#5B5FC7] focus:ring-1 focus:ring-[#5B5FC7] transition-all hover:border-[#B0B5BA]"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#242424]">
                Password
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-[#5B5FC7] pointer-events-none flex items-center">
                  <LockClosedRegular fontSize={18} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Create a strong password"
                  className="w-full h-[40px] pl-10 pr-10 rounded-lg border border-[#D1D5DB] bg-white text-[13.5px] text-[#242424] placeholder-[#8A8886] focus:outline-none focus:border-[#5B5FC7] focus:ring-1 focus:ring-[#5B5FC7] transition-all hover:border-[#B0B5BA]"
                />
                {/* Show / Hide Password Button */}
                <Tooltip content={showPassword ? 'Hide password' : 'Show password'} relationship="label">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 p-1 text-[#616161] hover:text-[#242424] hover:bg-black/5 rounded transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOffRegular fontSize={18} />
                    ) : (
                      <EyeRegular fontSize={18} />
                    )}
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Create Account Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[42px] mt-2 bg-[#5B5FC7] hover:bg-[#4F52B2] active:bg-[#43469C] text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-[14px] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Spinner size="extra-small" appearance="inverted" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create account</span>
                  <ArrowRightRegular fontSize={16} />
                </>
              )}
            </button>
          </form>

          {/* Sign in link */}
          <div className="mt-6 pt-5 border-t border-[#E1DFDD] text-center text-[13px]">
            <span className="text-[#616161]">Already have an account? </span>
            <Link
              href="/login"
              className="text-[#5B5FC7] hover:underline font-semibold transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Microsoft Teams Footer */}
      <footer className="py-4 px-6 text-center text-[12px] text-[#616161] flex items-center justify-center gap-4 flex-wrap">
        <span>&copy; 2026 TeamTrack Corporation</span>
        <a href="#" className="hover:underline">Privacy &amp; Cookies</a>
        <a href="#" className="hover:underline">Terms of use</a>
      </footer>
    </div>
  );
}
