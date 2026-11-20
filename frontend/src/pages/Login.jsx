import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Mail, Lock, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Lamp from '../components/Lamp';
import GlassCard from '../components/GlassCard';
import { getApiBaseUrl } from '../apiConfig';

function InlineMessage({ message, type = 'error' }) {
  if (!message) return null;
  const success = type === 'success';
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
      style={{
        backgroundColor: success ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
        border: `1px solid ${success ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
        color: success ? '#86efac' : '#fca5a5',
      }}
      role="alert"
    >
      {success ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <span>{message}</span>
    </motion.div>
  );
}

export default function Login() {
  const [isLightOn, setIsLightOn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const BASE_URL = getApiBaseUrl();

  useEffect(() => {
    try {
      const rememberedEmail = localStorage.getItem('billmateRememberedUser');
      if (rememberedEmail) {
        setEmail(rememberedEmail);
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
        setEmail(prefill);
        sessionStorage.removeItem('billmatePrefillUser');
      }
    } catch (_) {}
  }, []);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setError('');
    setNotice('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
        signal: controller.signal,
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {}

      if (!response.ok) {
        if (response.status === 401) setError(data?.msg || data?.message || 'Invalid email or password.');
        else if (response.status === 429) setError(data?.msg || data?.message || 'Too many login attempts. Please try again later.');
        else setError(data?.msg || data?.message || 'Unable to sign in. Please try again.');
        return;
      }

      if (!data?.token) {
        setError('Unexpected authentication response. Please try again.');
        return;
      }

      localStorage.setItem('billmateToken', data.token);
      localStorage.setItem('billmateUser', data?.user?.full_name || data?.user?.username || 'User');
      localStorage.setItem('billmateEmail', data?.user?.email || normalizedEmail);
      localStorage.setItem('billmateProfilePicture', data?.user?.profile_picture || '');

      if (rememberMe) localStorage.setItem('billmateRememberedUser', normalizedEmail);
      else localStorage.removeItem('billmateRememberedUser');

      window.location.href = 'dashboard.html';
    } catch (requestError) {
      setError(requestError?.name === 'AbortError'
        ? 'Login request timed out. Please try again.'
        : 'Unable to reach the server. Please check your connection.');
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 relative overflow-hidden transition-colors duration-700 select-none" style={{ backgroundColor: isLightOn ? '#0A0A0A' : '#020202' }}>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: isLightOn ? 0 : 1, y: isLightOn ? -8 : 0 }} className="absolute top-10 text-center pointer-events-none z-30">
        <motion.p animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2.5 }} className="text-xs font-semibold tracking-widest text-[#F5A93B] uppercase px-4 py-2 border border-white/[0.03] rounded-full bg-black/40">
          Pull the string to illuminate the login
        </motion.p>
      </motion.div>

      <Lamp isOn={isLightOn} onToggle={() => setIsLightOn(!isLightOn)} />

      <GlassCard isLightOn={isLightOn} className="-mt-3 mb-10">
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center space-x-2 mb-1">
            <Sparkles className="w-5 h-5" style={{ color: isLightOn ? '#F5A93B' : '#444' }} />
            <h2 className="text-2xl font-bold tracking-tight text-white">Welcome Back</h2>
          </div>
          <p className="text-sm text-neutral-400 text-center">Login to manage your bills smartly</p>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
          <AnimatePresence mode="wait">
            {notice && <InlineMessage key="notice" message={notice} type="success" />}
            {error && <InlineMessage key="error" message={error} />}
          </AnimatePresence>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Email</label>
            <div className="relative h-14 w-full">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setError(''); setNotice(''); }}
                className="w-full h-full rounded-2xl pl-12 pr-4 text-white text-sm bg-neutral-900 border border-white/[0.08] focus:outline-none focus:border-[#F5A93B]"
                placeholder="Enter email"
                autoComplete="email"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Password</label>
            <div className="relative h-14 w-full">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => { setPassword(event.target.value); setError(''); setNotice(''); }}
                className="w-full h-full rounded-2xl pl-12 pr-12 text-white text-sm bg-neutral-900 border border-white/[0.08] focus:outline-none focus:border-[#F5A93B]"
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={loading}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 p-1" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-medium pt-1">
            <label className="flex items-center space-x-2 text-neutral-300 cursor-pointer select-none">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="rounded bg-neutral-900 border-white/[0.08] text-[#F5A93B]" />
              <span>Remember me</span>
            </label>
          </div>

          <button id="login-submit-btn" type="submit" disabled={loading} className="w-full py-3 text-black font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-6" style={{ background: isLightOn ? 'linear-gradient(to right, #F5A93B, #E08A27)' : 'linear-gradient(to right, #664b24, #523714)', color: isLightOn ? '#000' : '#888' }}>
            {loading ? 'Signing in…' : 'Login'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/[0.05] text-center">
          <p className="text-xs text-neutral-400">
            Don't have an account?{' '}
            <a href="signup.html" className="hover:underline font-semibold text-neutral-400">Create new account</a>
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
