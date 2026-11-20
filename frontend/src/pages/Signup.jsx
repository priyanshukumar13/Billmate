import React, { useState } from 'react';
import { Eye, EyeOff, User, Mail, Lock, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Lamp from '../components/Lamp';
import GlassCard from '../components/GlassCard';
import { getApiBaseUrl } from '../apiConfig';

// ─── Inline error component ───────────────────────────────────────────────────
function InlineError({ message }) {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
      style={{
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        color: '#fca5a5',
      }}
      role="alert"
      aria-live="polite"
    >
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </motion.div>
  );
}

export default function Signup() {
  const [isLightOn, setIsLightOn] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Centralized API base URL resolver
  const BASE_URL = getApiBaseUrl();

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Client-side validation
    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please confirm your password.');
      return;
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters and contain a letter and a number.');
      return;
    }

    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let res;
      try {
        res = await fetch(`${BASE_URL}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmedName, email: trimmedEmail, password }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Parse response safely
      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        const status = res.status;
        if (status === 503) {
          setError('The server is starting up. Please wait a few seconds and try again.');
        } else if (status === 429) {
          setError('Too many signup attempts. Please wait 15 minutes and try again.');
        } else if (status === 409) {
          setError(data?.message || data?.msg || 'An account with this email or username already exists.');
        } else if (status === 400) {
          setError(data?.message || data?.msg || 'Please check your details and try again.');
        } else if (status === 500) {
          setError('A server error occurred. Please try again shortly.');
        } else {
          setError(data?.message || data?.msg || `Signup failed (${status}). Please try again.`);
        }
        return;
      }

      // If token provided, persist session and go to dashboard
      if (data?.token) {
        localStorage.setItem('billmateToken', data.token);
        localStorage.setItem('billmateUser', data?.user?.username || trimmedName);
        localStorage.setItem('billmateEmail', data?.user?.email || trimmedEmail);
        localStorage.setItem('billmateProfilePicture', data?.user?.profile_picture || '');
        window.location.href = 'dashboard.html';
      } else {
        // Account created: direct user to login screen
        try {
          sessionStorage.setItem('billmateSignupNotice', 'Account created! Please sign in with your password.');
          sessionStorage.setItem('billmatePrefillUser', trimmedEmail);
        } catch (_) {}
        window.location.href = 'login.html';
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setError('Signup request timed out. Please try again.');
      } else if (!navigator.onLine) {
        setError('No internet connection. Please check your network.');
      } else {
        setError('Unable to reach the server. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center pt-0 px-4 relative overflow-hidden transition-colors duration-700 select-none"
      style={{ backgroundColor: isLightOn ? '#0A0A0A' : '#020202' }}
    >
      {/* Instruction text above the lamp */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{
          opacity: isLightOn ? 0 : 1,
          y: isLightOn ? -8 : 0,
        }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        className="absolute top-10 text-center pointer-events-none z-30"
      >
        <motion.p
          animate={{ y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut', repeatDelay: 1.2 }}
          className="text-xs font-semibold tracking-widest text-warmAmber-light uppercase px-4 py-2 border border-white/[0.03] rounded-full bg-black/40 backdrop-blur-sm"
          style={{ textShadow: '0 0 8px rgba(245, 169, 59, 0.2)' }}
        >
          Pull the string to illuminate the signup
        </motion.p>
      </motion.div>

      {/* Hanging Lamp */}
      <Lamp isOn={isLightOn} onToggle={() => setIsLightOn(!isLightOn)} />

      {/* Signup Card */}
      <GlassCard isLightOn={isLightOn} className="-mt-3 mb-10">
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center space-x-2 mb-1">
            <Sparkles
              className="w-5 h-5 transition-colors duration-500"
              style={{ color: isLightOn ? '#F5A93B' : '#444' }}
            />
            <h2 className="text-2xl font-bold tracking-tight text-white transition-colors duration-500">Create Account</h2>
          </div>
          <p className="text-sm text-neutral-400 text-center transition-colors duration-500">Join BillMate and never miss a bill again</p>
        </div>

        <form onSubmit={handleSignupSubmit} className="space-y-4" noValidate>
          {/* Inline error display */}
          <AnimatePresence mode="wait">
            {error && <InlineError key="signup-error" message={error} />}
          </AnimatePresence>

          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Username</label>
            <div className="relative h-14 w-full">
              <User
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500"
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                id="signup-username"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                className="w-full h-full rounded-2xl pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter username"
                autoComplete="username"
                disabled={loading}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Email Address</label>
            <div className="relative h-14 w-full">
              <Mail
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500"
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className="w-full h-full rounded-2xl pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter email address"
                autoComplete="email"
                disabled={loading}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Password</label>
            <div className="relative h-14 w-full">
              <Lock
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500"
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="w-full h-full rounded-2xl pl-12 pr-12 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter password (min 6 chars)"
                autoComplete="new-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Confirm Password</label>
            <div className="relative h-14 w-full">
              <Lock
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500"
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                id="signup-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                className="w-full h-full rounded-2xl pl-12 pr-12 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Confirm password"
                autoComplete="new-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            id="signup-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full py-3 text-black font-semibold rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-6"
            style={{
              background: isLightOn
                ? 'linear-gradient(to right, #F5A93B, #E08A27)'
                : 'linear-gradient(to right, #664b24, #523714)',
              color: isLightOn ? '#000' : '#888',
              boxShadow: isLightOn ? '0 0 15px rgba(245, 169, 59, 0.3)' : 'none',
            }}
          >
            {loading ? 'Creating Account…' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/[0.05] text-center">
          <p className="text-xs text-neutral-400">
            Already have an account?{' '}
            <a
              href="login.html"
              className="hover:underline font-semibold transition-colors duration-500"
              style={{ color: isLightOn ? '#F5A93B' : '#777' }}
            >
              Login
            </a>
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
