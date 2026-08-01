import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Mail, Lock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import Lamp from '../components/Lamp';
import GlassCard from '../components/GlassCard';

export default function Login() {
  const [isLightOn, setIsLightOn] = useState(false); // Starts dark
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password modal states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1 = send OTP, 2 = verify & reset
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Detect BASE_URL from window environment matching original logic
  const BASE_URL = window.BILLMATE_API_BASE_URL ||
    ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:5000"
      : "https://billmate-backend.onrender.com");

  // Load saved remember me preference on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('billmateRememberedUser');
    if (savedUser) {
      setUsername(savedUser);
      setRememberMe(true);
    }
  }, []);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      alert("Please enter username and password first.");
      return;
    }

    setLoading(true);

    try {
      const url = `${BASE_URL}/api/auth/login`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        let data;
        try { data = await res.json(); } catch (e) { data = null; }
        alert(data?.msg || `Login failed (status ${res.status})`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      
      // Store token & user detail
      localStorage.setItem("billmateToken", data.token);
      localStorage.setItem("billmateUser", data?.user?.username || username);
      localStorage.setItem("billmateEmail", data?.user?.email || "");
      localStorage.setItem("billmateProfilePicture", data?.user?.profile_picture || "");

      // Handle remember me
      if (rememberMe) {
        localStorage.setItem('billmateRememberedUser', username);
      } else {
        localStorage.removeItem('billmateRememberedUser');
      }

      window.location.href = "dashboard.html";
    } catch (err) {
      console.error('Login error:', err);
      const msg = err?.name === "AbortError"
        ? "Login request timed out. Please try again."
        : `Network error: ${err.message}. Ensure backend is running.`;
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      alert("Please enter your username or email.");
      return;
    }

    setForgotLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameOrEmail: forgotIdentifier })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.msg || "Could not send OTP. Please try again.");
        return;
      }

      setForgotEmail(data?.email || '');
      setForgotStep(2);
    } catch (err) {
      console.error("Forgot password error:", err);
      alert("Network error while sending OTP. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!otp.trim() || !newPassword || !confirmNewPassword) {
      alert("Please fill OTP and both password fields.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      alert("New password and confirm password do not match.");
      return;
    }

    setForgotLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail || forgotIdentifier,
          otp,
          newPassword
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.msg || "OTP reset failed. Please check OTP and try again.");
        return;
      }

      alert("Password reset successful! Please log in with your new password.");
      setShowForgotModal(false);
      setForgotStep(1);
      setForgotIdentifier('');
      setOtp('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      console.error("Reset password error:", err);
      alert("Network error while resetting password. Please try again.");
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
          y: isLightOn ? -8 : 0
        }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="absolute top-10 text-center pointer-events-none z-30"
      >
        <motion.p
          animate={{ y: [0, -3, 0] }}
          transition={{
            repeat: Infinity,
            duration: 2.5,
            ease: "easeInOut",
            repeatDelay: 1.2
          }}
          className="text-xs font-semibold tracking-widest text-warmAmber-light uppercase px-4 py-2 border border-white/[0.03] rounded-full bg-black/40 backdrop-blur-sm"
          style={{ textShadow: '0 0 8px rgba(245, 169, 59, 0.2)' }}
        >
          Pull the string to illuminate the login
        </motion.p>
      </motion.div>

      {/* Hanging Lamp sits naturally at the top */}
      <Lamp isOn={isLightOn} onToggle={() => setIsLightOn(!isLightOn)} />

      {/* Main Login Card - positioned directly below the bulb with a slight negative margin for overlap */}
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

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Username / Email</label>
            <div className="relative h-14 w-full">
              <Mail 
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500" 
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-full rounded-2xl pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter username or email"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Password</label>
            <div className="relative h-14 w-full">
              <Lock 
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500" 
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-full rounded-2xl pl-12 pr-12 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

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
              }}
              className="transition-colors duration-500 hover:text-white font-semibold"
              style={{ color: isLightOn ? '#F5A93B' : '#888' }}
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-black font-semibold rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 text-sm mt-6"
            style={{
              background: isLightOn 
                ? 'linear-gradient(to right, #F5A93B, #E08A27)' 
                : 'linear-gradient(to right, #664b24, #523714)',
              color: isLightOn ? '#000' : '#888',
              boxShadow: isLightOn ? '0 0 15px rgba(245, 169, 59, 0.3)' : 'none'
            }}
          >
            {loading ? "Signing in..." : "Login"}
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

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-950 border border-white/[0.08] rounded-3xl p-8 shadow-glass relative">
            <h3 className="text-xl font-bold text-white mb-2">Reset your password</h3>
            <p className="text-xs text-neutral-400 mb-6">
              {forgotStep === 1
                ? "Enter your username or email. We will send an OTP to your email."
                : `We sent a code to ${forgotEmail || forgotIdentifier}. Enter it below.`}
            </p>

            {forgotStep === 1 ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Username or Email</label>
                  <input
                    type="text"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none transition-all duration-300 focus:ring-2 focus:ring-[#F5A93B]/20"
                    placeholder="Enter username or email"
                    required
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
                    className="flex-1 py-3 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-sm hover:shadow-glow transition-all"
                  >
                    {forgotLoading ? "Sending..." : "Send OTP"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">OTP</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none tracking-widest text-center text-lg font-bold"
                    placeholder="------"
                    maxLength={6}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A93B]/20"
                    placeholder="Enter new password"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full bg-neutral-900 border border-white/[0.08] focus:border-[#F5A93B] rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A93B]/20"
                    placeholder="Confirm new password"
                    required
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="flex-1 py-3 bg-neutral-900 border border-white/[0.08] hover:bg-neutral-800 text-neutral-300 font-semibold rounded-xl text-sm transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 py-3 bg-gradient-to-r from-[#F5A93B] to-[#E08A27] text-black font-semibold rounded-xl text-sm hover:shadow-glow transition-all"
                  >
                    {forgotLoading ? "Resetting..." : "Reset Password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
