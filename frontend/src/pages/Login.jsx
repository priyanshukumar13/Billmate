import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Mail, Lock, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Lamp from '../components/Lamp';
import GlassCard from '../components/GlassCard';

// ─── Inline message component ────────────────────────────────────────────────
function InlineMessage({ message, type = 'error' }) {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
      style={{
        backgroundColor: isError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)',
        border: `1px solid ${isError ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)'}`,
        color: isError ? '#fca5a5' : '#86efac',
      }}
      role="alert"
      aria-live="polite"
    >
      {isError
        ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        : <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <span>{message}</span>
    </motion.div>
  );
}

// ─── Helper — parse API error message safely ──────────────────────────────────
function parseApiError(err, fallback) {
  if (err?.name === 'AbortError') return 'Request timed out. Please try again.';
  if (!navigator.onLine) return 'No internet connection. Please check your network.';
  return fallback;
}

export default function Login() {
  const [isLightOn, setIsLightOn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot password modal states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Resolve backend base URL at runtime (no hardcoded production URL in source)
  const BASE_URL = window.BILLMATE_API_BASE_URL ||
    ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5000'
      : 'https://billmate-backend.onrender.com');

  // Load saved remember-me preference on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('billmateRememberedUser');
    if (savedUser) {
      setUsername(savedUser);
      setRememberMe(true);
    }
  }, []);

  // ─── LOGIN ──────────────────────────────────────────────────────────────────
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const identifier = username.trim();
    if (!identifier || !password) {
      setError('Please enter your username/email and password.');
      return;
    }

    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let res;
      try {
        res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: identifier,
            email: identifier,
            usernameOrEmail: identifier,
            password,
          }),
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
          setError('Too many login attempts. Please wait 15 minutes and try again.');
        } else if (status === 401 || status === 400) {
          setError(data?.message || data?.msg || 'Invalid email or password.');
        } else if (status === 500) {
          setError('A server error occurred. Please try again shortly.');
        } else {
          setError(data?.message || data?.msg || `Login failed (${status}). Please try again.`);
        }
        return;
      }

      // Success — persist session
      localStorage.setItem('billmateToken', data.token);
      localStorage.setItem('billmateUser', data?.user?.username || identifier);
      localStorage.setItem('billmateEmail', data?.user?.email || '');
      localStorage.setItem('billmateProfilePicture', data?.user?.profile_picture || '');

      if (rememberMe) {
        localStorage.setItem('billmateRememberedUser', identifier);
      } else {
        localStorage.removeItem('billmateRememberedUser');
      }

      window.location.href = 'dashboard.html';
    } catch (err) {
      setError(parseApiError(err, `Unable to reach the server. Please check your connection.`));
    } finally {
      setLoading(false);
    }
  };

  // ─── FORGOT PASSWORD — Step 1: Send OTP ─────────────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotIdentifier.trim()) {
      setForgotError('Please enter your username or email.');
      return;
    }

    setForgotLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let res;
      try {
        res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail: forgotIdentifier.trim() }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        if (res.status === 503) {
          setForgotError('Server is starting up. Please try again in a moment.');
        } else {
          setForgotError(data?.message || data?.msg || 'Could not send OTP. Please try again.');
        }
        return;
      }

      setForgotEmail(data?.email || '');
      setForgotStep(2);
    } catch (err) {
      setForgotError(parseApiError(err, 'Network error while sending OTP. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  // ─── FORGOT PASSWORD — Step 2: Verify OTP + Reset ───────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!otp.trim() || !newPassword || !confirmNewPassword) {
      setForgotError('Please fill in the OTP and both password fields.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setForgotError('New password and confirm password do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setForgotError('New password must be at least 6 characters.');
      return;
    }

    setForgotLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let res;
      try {
        res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: forgotEmail || forgotIdentifier,
            otp: otp.trim(),
            newPassword,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        setForgotError(data?.message || data?.msg || 'OTP reset failed. Please check your OTP and try again.');
        return;
      }

      // Success — show message, close modal after 2 seconds
      setForgotSuccess('Password reset successfully! You can now log in with your new password.');
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep(1);
        setForgotIdentifier('');
        setOtp('');
        setNewPassword('');
        setConfirmNewPassword('');
        setForgotSuccess('');
      }, 2500);
    } catch (err) {
      setForgotError(parseApiError(err, 'Network error while resetting password. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
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
          Pull the string to illuminate the login
        </motion.p>
      </motion.div>

      {/* Hanging Lamp */}
      <Lamp isOn={isLightOn} onToggle={() => setIsLightOn(!isLightOn)} />

      {/* Login Card */}
      <GlassCard isLightOn={isLightOn} className="-mt-3 mb-10">
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center space-x-2 mb-1">
            <Sparkles
              className="w-5 h-5 transition-colors duration-500"
              style={{ color: isLightOn ? '#F5A93B' : '#444' }}
            />
            <h2 className="text-2xl font-bold tracking-tight text-white transition-colors duration-500">Welcome Back</h2>
          </div>
          <p className="text-sm text-neutral-400 text-center transition-colors duration-500">Login to manage your bills smartly</p>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
          {/* Inline error display */}
          <AnimatePresence mode="wait">
            {error && <InlineMessage key="login-error" message={error} type="error" />}
          </AnimatePresence>

          {/* Username / Email */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Username / Email</label>
            <div className="relative h-14 w-full">
              <Mail
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500"
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                className="w-full h-full rounded-2xl pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter username or email"
                autoComplete="username"
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
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="w-full h-full rounded-2xl pl-12 pr-12 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter password"
                autoComplete="current-password"
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

          {/* Remember me + forgot password */}
          <div className="flex items-center justify-between text-xs font-medium pt-1">
            <label className="flex items-center space-x-2 text-neutral-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded bg-neutral-900 border-white/[0.08] text-[#F5A93B] focus:ring-[#F5A93B]/20 cursor-pointer"
              />
              <span>Remember me</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setShowForgotModal(true);
                setForgotStep(1);
                setForgotError('');
                setForgotSuccess('');
              }}
              className="transition-colors duration-500 hover:text-white font-semibold"
              style={{ color: isLightOn ? '#F5A93B' : '#888' }}
            >
              Forgot password?
            </button>
          </div>

          {/* Submit */}
          <button
            id="login-submit-btn"
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
            {loading ? 'Signing in…' : 'Login'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/[0.05] text-center">
          <p className="text-xs text-neutral-400">
            Don't have an account?{' '}
            <a
              href="signup.html"
              className="hover:underline font-semibold transition-colors duration-500"
              style={{ color: isLightOn ? '#F5A93B' : '#777' }}
            >
              Create new account
            </a>
          </p>
        </div>
      </GlassCard>

      {/* ── Forgot Password Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForgotModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowForgotModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-neutral-950 border border-white/[0.08] rounded-3xl p-8 shadow-glass relative"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-2">Reset your password</h3>
              <p className="text-xs text-neutral-400 mb-6">
                {forgotStep === 1
                  ? 'Enter your username or email. We will send an OTP to your registered email.'
                  : `We sent a code to ${forgotEmail || forgotIdentifier}. Enter it below.`}
              </p>

              {/* Inline messages for modal */}
              <AnimatePresence mode="wait">
                {forgotError && <InlineMessage key="fp-error" message={forgotError} type="error" />}
                {forgotSuccess && <InlineMessage key="fp-success" message={forgotSuccess} type="success" />}
              </AnimatePresence>

              <div className="mt-4">
                {forgotStep === 1 ? (
                  <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Username or Email</label>
                      <input
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => { setForgotIdentifier(e.target.value); setForgotError(''); }}
                        className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none transition-all duration-300 focus:ring-2 focus:ring-[#F5A93B]/20"
                        placeholder="Enter username or email"
                        autoComplete="email"
                        disabled={forgotLoading}
                      />
                    </div>
                    <div className="flex space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setShowForgotModal(false)}
                        className="flex-1 py-3 bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-neutral-300 font-semibold rounded-xl text-sm transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="flex-1 py-3 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {forgotLoading ? 'Sending…' : 'Send OTP'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">OTP</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={otp}
                        onChange={(e) => { setOtp(e.target.value); setForgotError(''); }}
                        className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none tracking-widest text-center text-lg font-bold"
                        placeholder="------"
                        maxLength={6}
                        autoComplete="one-time-code"
                        disabled={forgotLoading}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); setForgotError(''); }}
                        className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A93B]/20"
                        placeholder="Enter new password (min 6 chars)"
                        autoComplete="new-password"
                        disabled={forgotLoading}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => { setConfirmNewPassword(e.target.value); setForgotError(''); }}
                        className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A93B]/20"
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        disabled={forgotLoading}
                      />
                    </div>
                    <div className="flex space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={() => { setForgotStep(1); setForgotError(''); setForgotSuccess(''); }}
                        className="flex-1 py-3 bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-neutral-300 font-semibold rounded-xl text-sm transition-all"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="flex-1 py-3 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {forgotLoading ? 'Resetting…' : 'Reset Password'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
