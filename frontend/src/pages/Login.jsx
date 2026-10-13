import React, { useState, useEffect, useRef } from 'react';
import { 
  Eye, EyeOff, Mail, Lock, Sparkles, AlertCircle, CheckCircle, 
  RefreshCw, ShieldCheck, ArrowLeft, Clock, KeyRound 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Lamp from '../components/Lamp';
import GlassCard from '../components/GlassCard';
import { getApiBaseUrl } from '../apiConfig';

// ─── Inline message component ────────────────────────────────────────────────
function InlineMessage({ message, type = 'error' }) {
  if (!message) return null;
  const isError = type === 'error';
  const isInfo = type === 'info';
  
  let bg = 'rgba(239, 68, 68, 0.08)';
  let border = 'rgba(239, 68, 68, 0.25)';
  let text = '#fca5a5';
  
  if (!isError && !isInfo) {
    // success
    bg = 'rgba(34, 197, 94, 0.08)';
    border = 'rgba(34, 197, 94, 0.25)';
    text = '#86efac';
  } else if (isInfo) {
    bg = 'rgba(245, 158, 11, 0.08)';
    border = 'rgba(245, 158, 11, 0.25)';
    text = '#fcd34d';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
      style={{ backgroundColor: bg, border: `1px solid ${border}`, color: text }}
      role="alert"
      aria-live="polite"
    >
      {isError && <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      {!isError && !isInfo && <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      {isInfo && <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <span className="leading-snug">{message}</span>
    </motion.div>
  );
}

// ─── 6-Digit Segmented OTP Input ─────────────────────────────────────────────
function SegmentedOtpInput({ value, onChange, disabled }) {
  const inputRefs = useRef([]);

  const digits = (value || '').padEnd(6, '').slice(0, 6).split('');

  const handleChange = (e, index) => {
    const val = e.target.value.replace(/\D/g, '');
    if (!val) {
      // deleted
      const newOtp = (value || '').slice(0, index) + ' ' + (value || '').slice(index + 1);
      onChange(newOtp.trimEnd());
      return;
    }
    const char = val.slice(-1);
    const chars = (value || '').split('');
    while (chars.length < 6) chars.push('');
    chars[index] = char;
    const updated = chars.join('').slice(0, 6);
    onChange(updated);

    // auto advance
    if (index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && (!digits[index] || digits[index] === ' ')) {
      if (index > 0 && inputRefs.current[index - 1]) {
        inputRefs.current[index - 1].focus();
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasteData) {
      onChange(pasteData);
      const nextIndex = Math.min(pasteData.length, 5);
      if (inputRefs.current[nextIndex]) {
        inputRefs.current[nextIndex].focus();
      }
    }
  };

  return (
    <div className="flex justify-between items-center gap-2 max-w-xs mx-auto my-3" onPaste={handlePaste}>
      {[0, 1, 2, 3, 4, 5].map((idx) => (
        <input
          key={idx}
          ref={(el) => (inputRefs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digits[idx] && digits[idx] !== ' ' ? digits[idx] : ''}
          onChange={(e) => handleChange(e, idx)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          disabled={disabled}
          className="w-11 h-13 text-center text-xl font-bold bg-neutral-900 border border-white/[0.12] rounded-xl text-white focus:outline-none focus:border-[#F5A93B] focus:ring-2 focus:ring-[#F5A93B]/30 transition-all selection:bg-[#F5A93B]/20"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function Login() {
  const [isLightOn, setIsLightOn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // First-time login OTP state
  const [showFirstLoginModal, setShowFirstLoginModal] = useState(false);
  const [firstLoginChallengeId, setFirstLoginChallengeId] = useState('');
  const [firstLoginEmailMasked, setFirstLoginEmailMasked] = useState('');
  const [firstLoginOtp, setFirstLoginOtp] = useState('');
  const [firstLoginCountdown, setFirstLoginCountdown] = useState(300);
  const [firstLoginCooldown, setFirstLoginCooldown] = useState(60);
  const [firstLoginLoading, setFirstLoginLoading] = useState(false);
  const [firstLoginError, setFirstLoginError] = useState('');

  // Forgot password modal states (Steps: 1: Request, 2: Verify OTP, 3: Set Password)
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotEmailMasked, setForgotEmailMasked] = useState('');
  const [forgotChallengeId, setForgotChallengeId] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotCountdown, setForgotCountdown] = useState(300);
  const [forgotCooldown, setForgotCooldown] = useState(60);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const BASE_URL = getApiBaseUrl();

  // Load saved preferences & notices on mount
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('billmateRememberedUser');
      if (savedUser) {
        setUsername(savedUser);
        setRememberMe(true);
      }
      const logoutNotice = sessionStorage.getItem('billmateLogoutNotice');
      if (logoutNotice) {
        setNotice(logoutNotice);
        sessionStorage.removeItem('billmateLogoutNotice');
      }
      const signupNotice = sessionStorage.getItem('billmateSignupNotice');
      if (signupNotice) {
        setNotice(signupNotice);
        sessionStorage.removeItem('billmateSignupNotice');
      }
      const prefill = sessionStorage.getItem('billmatePrefillUser');
      if (prefill) {
        setUsername(prefill);
        sessionStorage.removeItem('billmatePrefillUser');
      }
    } catch (_) {}
  }, []);

  // Countdown timer effect for First-Login OTP
  useEffect(() => {
    if (!showFirstLoginModal) return;
    const interval = setInterval(() => {
      setFirstLoginCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      setFirstLoginCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [showFirstLoginModal]);

  // Countdown timer effect for Forgot-Password OTP
  useEffect(() => {
    if (!showForgotModal || forgotStep !== 2) return;
    const interval = setInterval(() => {
      setForgotCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      setForgotCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [showForgotModal, forgotStep]);

  // ─── LOGIN SUBMIT ───────────────────────────────────────────────────────────
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const identifier = username.trim();
    if (!identifier || !password) {
      setError('Please enter your username/email and password.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: identifier,
          email: identifier,
          usernameOrEmail: identifier,
          password,
        }),
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        const status = res.status;
        if (status === 503) {
          setError(data?.message || data?.msg || 'The server or email service is currently unavailable. Please try again.');
        } else if (status === 429) {
          setError(data?.message || data?.msg || 'Too many login attempts. Please wait 15 minutes and try again.');
        } else {
          setError(data?.message || data?.msg || 'Invalid email or password.');
        }
        return;
      }

      // Check if First-Login Verification is required
      if (data?.requireOtp && data?.purpose === 'FIRST_LOGIN') {
        setFirstLoginChallengeId(data.challengeId);
        setFirstLoginEmailMasked(data.emailMasked);
        setFirstLoginOtp('');
        setFirstLoginError('');
        setFirstLoginCountdown(data.expiresInSeconds || 300);
        setFirstLoginCooldown(data.cooldownSeconds || 60);
        setShowFirstLoginModal(true);
        return;
      }

      // Normal Login: Verified user received token
      if (data?.token) {
        localStorage.setItem('billmateToken', data.token);
        localStorage.setItem('billmateUser', data?.user?.full_name || data?.user?.username || identifier);
        localStorage.setItem('billmateEmail', data?.user?.email || '');
        localStorage.setItem('billmateProfilePicture', data?.user?.profile_picture || '');

        if (rememberMe) {
          localStorage.setItem('billmateRememberedUser', identifier);
        } else {
          localStorage.removeItem('billmateRememberedUser');
        }

        window.location.href = 'dashboard.html';
      } else {
        setError('Unexpected authentication response. Please try again.');
      }
    } catch (err) {
      setError('Unable to reach the server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // ─── VERIFY FIRST-LOGIN OTP ─────────────────────────────────────────────────
  const handleVerifyFirstLoginOtp = async (e) => {
    e.preventDefault();
    setFirstLoginError('');

    const cleanOtp = firstLoginOtp.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setFirstLoginError('Please enter a valid 6-digit verification code.');
      return;
    }

    setFirstLoginLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/verify-first-login-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: firstLoginChallengeId,
          otp: cleanOtp,
        }),
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        setFirstLoginError(data?.message || data?.msg || 'Verification failed. Please check the code.');
        return;
      }

      // Successful verification and login!
      localStorage.setItem('billmateToken', data.token);
      localStorage.setItem('billmateUser', data?.user?.full_name || data?.user?.username || 'User');
      localStorage.setItem('billmateEmail', data?.user?.email || '');
      localStorage.setItem('billmateProfilePicture', data?.user?.profile_picture || '');

      setShowFirstLoginModal(false);
      window.location.href = 'dashboard.html';
    } catch (err) {
      setFirstLoginError('Network error verifying code. Please try again.');
    } finally {
      setFirstLoginLoading(false);
    }
  };

  // ─── RESEND FIRST-LOGIN OTP ─────────────────────────────────────────────────
  const handleResendFirstLoginOtp = async () => {
    if (firstLoginCooldown > 0 || firstLoginLoading) return;
    setFirstLoginError('');
    setFirstLoginLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: firstLoginChallengeId }),
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        setFirstLoginError(data?.message || data?.msg || 'Could not resend code. Please try again.');
        return;
      }

      setFirstLoginChallengeId(data.challengeId);
      setFirstLoginCountdown(data.expiresInSeconds || 300);
      setFirstLoginCooldown(data.cooldownSeconds || 60);
      setFirstLoginOtp('');
    } catch (err) {
      setFirstLoginError('Network error resending code.');
    } finally {
      setFirstLoginLoading(false);
    }
  };

  // ─── FORGOT PASSWORD — STEP 1: REQUEST OTP ──────────────────────────────────
  const handleSendForgotOtp = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotIdentifier.trim()) {
      setForgotError('Please enter your username or email address.');
      return;
    }

    setForgotLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: forgotIdentifier.trim() }),
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        setForgotError(data?.message || data?.msg || 'Could not initiate reset. Please try again.');
        return;
      }

      setForgotChallengeId(data.challengeId);
      setForgotEmailMasked(data.emailMasked || forgotIdentifier);
      setForgotCountdown(data.expiresInSeconds || 300);
      setForgotCooldown(data.cooldownSeconds || 60);
      setForgotOtp('');
      setForgotStep(2);
    } catch (err) {
      setForgotError('Network error sending reset code. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // ─── FORGOT PASSWORD — STEP 2: VERIFY OTP ───────────────────────────────────
  const handleVerifyForgotOtp = async (e) => {
    e.preventDefault();
    setForgotError('');

    const cleanOtp = forgotOtp.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setForgotError('Please enter the 6-digit security code.');
      return;
    }

    setForgotLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: forgotChallengeId,
          otp: cleanOtp,
        }),
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        setForgotError(data?.message || data?.msg || 'Invalid or expired code.');
        return;
      }

      setResetToken(data.resetToken);
      setForgotStep(3);
    } catch (err) {
      setForgotError('Network error verifying code. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // ─── RESEND FORGOT OTP ──────────────────────────────────────────────────────
  const handleResendForgotOtp = async () => {
    if (forgotCooldown > 0 || forgotLoading) return;
    setForgotError('');
    setForgotLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: forgotChallengeId }),
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        setForgotError(data?.message || data?.msg || 'Could not resend code.');
        return;
      }

      setForgotChallengeId(data.challengeId);
      setForgotCountdown(data.expiresInSeconds || 300);
      setForgotCooldown(data.cooldownSeconds || 60);
      setForgotOtp('');
    } catch (err) {
      setForgotError('Network error resending reset code.');
    } finally {
      setForgotLoading(false);
    }
  };

  // ─── FORGOT PASSWORD — STEP 3: SET NEW PASSWORD ─────────────────────────────
  const handleCompletePasswordReset = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!newPassword || !confirmNewPassword) {
      setForgotError('Please fill in both password fields.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setForgotError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setForgotError('Password must be at least 8 characters.');
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setForgotError('Password must contain at least one letter and one number.');
      return;
    }

    setForgotLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetToken,
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok) {
        setForgotError(data?.message || data?.msg || 'Password reset failed. Please restart the process.');
        return;
      }

      setForgotSuccess('Password updated successfully! Please log in with your new password.');
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep(1);
        setForgotIdentifier('');
        setForgotOtp('');
        setResetToken('');
        setNewPassword('');
        setConfirmNewPassword('');
        setNotice('Your password was changed. Please authenticate with your new credentials.');
      }, 2500);
    } catch (err) {
      setForgotError('Network error updating password. Please try again.');
    } finally {
      setForgotLoading(false);
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
          className="text-xs font-semibold tracking-widest text-[#F5A93B] uppercase px-4 py-2 border border-white/[0.03] rounded-full bg-black/40 backdrop-blur-sm"
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
          {/* Status notices */}
          <AnimatePresence mode="wait">
            {notice && <InlineMessage key="login-notice" message={notice} type="info" />}
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
                onChange={(e) => { setUsername(e.target.value); setError(''); setNotice(''); }}
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
                onChange={(e) => { setPassword(e.target.value); setError(''); setNotice(''); }}
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
                setForgotIdentifier(username || '');
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

      {/* ── First-Time Login OTP Verification Modal ───────────────────────────── */}
      <AnimatePresence>
        {showFirstLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="w-full max-w-md bg-neutral-950 border border-white/[0.1] rounded-3xl p-8 shadow-2xl relative"
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[#F5A93B] flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Verify Your First Login</h3>
                <p className="text-xs text-neutral-400">
                  A 6-digit verification code was sent to <span className="font-semibold text-neutral-200">{firstLoginEmailMasked}</span>
                </p>
              </div>

              <AnimatePresence mode="wait">
                {firstLoginError && <InlineMessage key="fl-error" message={firstLoginError} type="error" />}
              </AnimatePresence>

              <form onSubmit={handleVerifyFirstLoginOtp} className="space-y-5 mt-4" noValidate>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider text-center mb-2">
                    Enter 6-Digit Code
                  </label>
                  <SegmentedOtpInput
                    value={firstLoginOtp}
                    onChange={(val) => { setFirstLoginOtp(val); setFirstLoginError(''); }}
                    disabled={firstLoginLoading}
                  />
                </div>

                {/* Expiry countdown & resend */}
                <div className="flex items-center justify-between text-xs text-neutral-400 px-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Expires in <strong className={firstLoginCountdown < 60 ? 'text-red-400' : 'text-amber-400'}>{formatTime(firstLoginCountdown)}</strong></span>
                  </div>

                  <button
                    type="button"
                    onClick={handleResendFirstLoginOtp}
                    disabled={firstLoginCooldown > 0 || firstLoginLoading}
                    className="flex items-center gap-1 font-semibold text-[#F5A93B] hover:text-amber-300 transition-colors disabled:text-neutral-600 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3 h-3 ${firstLoginLoading ? 'animate-spin' : ''}`} />
                    {firstLoginCooldown > 0 ? `Resend (${firstLoginCooldown}s)` : 'Resend Code'}
                  </button>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowFirstLoginModal(false)}
                    className="flex-1 py-3 bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-neutral-300 font-semibold rounded-xl text-sm transition-all"
                  >
                    Back to Login
                  </button>
                  <button
                    type="submit"
                    disabled={firstLoginLoading || firstLoginOtp.trim().length !== 6}
                    className="flex-1 py-3 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {firstLoginLoading ? 'Verifying…' : 'Verify & Enter'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Forgot Password Multi-Step Modal ───────────────────────────────────── */}
      <AnimatePresence>
        {showForgotModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
            onClick={(e) => { if (e.target === e.currentTarget) setShowForgotModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="w-full max-w-md bg-neutral-950 border border-white/[0.1] rounded-3xl p-8 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[#F5A93B] flex items-center justify-center mx-auto mb-3">
                  {forgotStep === 1 && <KeyRound className="w-6 h-6" />}
                  {forgotStep === 2 && <ShieldCheck className="w-6 h-6" />}
                  {forgotStep === 3 && <Lock className="w-6 h-6" />}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">
                  {forgotStep === 1 && 'Reset Your Password'}
                  {forgotStep === 2 && 'Enter Security Code'}
                  {forgotStep === 3 && 'Create New Password'}
                </h3>
                <p className="text-xs text-neutral-400">
                  {forgotStep === 1 && 'Enter your registered email address to receive a secure recovery code.'}
                  {forgotStep === 2 && `Enter the 6-digit code sent to ${forgotEmailMasked}`}
                  {forgotStep === 3 && 'Choose a strong, secure password for your BillMate account.'}
                </p>
              </div>

              {/* Inline alerts */}
              <AnimatePresence mode="wait">
                {forgotError && <InlineMessage key="fp-error" message={forgotError} type="error" />}
                {forgotSuccess && <InlineMessage key="fp-success" message={forgotSuccess} type="success" />}
              </AnimatePresence>

              <div className="mt-4">
                {/* ── STEP 1: Request OTP ── */}
                {forgotStep === 1 && (
                  <form onSubmit={handleSendForgotOtp} className="space-y-4" noValidate>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Registered Email or Username</label>
                      <input
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => { setForgotIdentifier(e.target.value); setForgotError(''); }}
                        className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none transition-all duration-300 focus:ring-2 focus:ring-[#F5A93B]/20"
                        placeholder="e.g. name@example.com"
                        autoComplete="email"
                        disabled={forgotLoading}
                      />
                    </div>
                    <div className="flex space-x-3 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowForgotModal(false)}
                        className="flex-1 py-3 bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-neutral-300 font-semibold rounded-xl text-sm transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={forgotLoading || !forgotIdentifier.trim()}
                        className="flex-1 py-3 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {forgotLoading ? 'Sending…' : 'Send Code'}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── STEP 2: Verify OTP ── */}
                {forgotStep === 2 && (
                  <form onSubmit={handleVerifyForgotOtp} className="space-y-4" noValidate>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider text-center mb-2">
                        Enter 6-Digit Code
                      </label>
                      <SegmentedOtpInput
                        value={forgotOtp}
                        onChange={(val) => { setForgotOtp(val); setForgotError(''); }}
                        disabled={forgotLoading}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-neutral-400 px-1 pt-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Expires in <strong className={forgotCountdown < 60 ? 'text-red-400' : 'text-amber-400'}>{formatTime(forgotCountdown)}</strong></span>
                      </div>

                      <button
                        type="button"
                        onClick={handleResendForgotOtp}
                        disabled={forgotCooldown > 0 || forgotLoading}
                        className="flex items-center gap-1 font-semibold text-[#F5A93B] hover:text-amber-300 transition-colors disabled:text-neutral-600 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-3 h-3 ${forgotLoading ? 'animate-spin' : ''}`} />
                        {forgotCooldown > 0 ? `Resend (${forgotCooldown}s)` : 'Resend Code'}
                      </button>
                    </div>

                    <div className="flex space-x-3 pt-3">
                      <button
                        type="button"
                        onClick={() => { setForgotStep(1); setForgotError(''); }}
                        className="flex-1 py-3 bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-neutral-300 font-semibold rounded-xl text-sm transition-all"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={forgotLoading || forgotOtp.trim().length !== 6}
                        className="flex-1 py-3 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {forgotLoading ? 'Verifying…' : 'Verify Code'}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── STEP 3: Set New Password ── */}
                {forgotStep === 3 && (
                  <form onSubmit={handleCompletePasswordReset} className="space-y-4" noValidate>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">New Password</label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => { setNewPassword(e.target.value); setForgotError(''); }}
                          className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 pl-4 pr-11 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A93B]/20"
                          placeholder="Min 8 characters, letters & numbers"
                          autoComplete="new-password"
                          disabled={forgotLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Confirm New Password</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmNewPassword}
                          onChange={(e) => { setConfirmNewPassword(e.target.value); setForgotError(''); }}
                          className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 pl-4 pr-11 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A93B]/20"
                          placeholder="Repeat new password"
                          autoComplete="new-password"
                          disabled={forgotLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Password Policy Guidelines */}
                    <div className="p-3 rounded-xl bg-neutral-900/60 border border-white/[0.05] text-[11px] text-neutral-400 space-y-1">
                      <p className={newPassword.length >= 8 ? 'text-emerald-400 font-medium' : ''}>
                        • At least 8 characters long
                      </p>
                      <p className={/[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword) ? 'text-emerald-400 font-medium' : ''}>
                        • Contains both letters and numbers
                      </p>
                    </div>

                    <div className="flex space-x-3 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowForgotModal(false)}
                        className="flex-1 py-3 bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-neutral-300 font-semibold rounded-xl text-sm transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={forgotLoading || !newPassword || !confirmNewPassword}
                        className="flex-1 py-3 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {forgotLoading ? 'Updating…' : 'Reset Password'}
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
