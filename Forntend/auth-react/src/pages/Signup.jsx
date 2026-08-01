import React, { useState } from 'react';
import { Eye, EyeOff, User, Mail, Lock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import Lamp from '../components/Lamp';
import GlassCard from '../components/GlassCard';

export default function Signup() {
  const [isLightOn, setIsLightOn] = useState(false); // Starts dark
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Detect BASE_URL matching original logic
  const BASE_URL = window.BILLMATE_API_BASE_URL ||
    ((window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:5000"
      : "https://billmate-backend.onrender.com");

  const handleSignupSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      alert("Please fill all details first 😄");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match. Please confirm your password.");
      return;
    }

    setLoading(true);

    try {
      const url = `${BASE_URL}/api/auth/signup`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name, email, password }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        const text = await res.text();
        data = { msg: text || `Signup failed (status ${res.status})` };
      }

      if (!res.ok) {
        alert(data?.msg || data?.message || `Signup failed (status ${res.status})`);
        setLoading(false);
        return;
      }

      // Auto-login into dashboard after signup
      localStorage.setItem("billmateToken", data.token);
      localStorage.setItem("billmateUser", data?.user?.username || name);
      localStorage.setItem("billmateEmail", data?.user?.email || email);
      localStorage.setItem("billmateProfilePicture", data?.user?.profile_picture || "");

      alert('Signup successful! Redirecting to your dashboard.');

      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 150);

    } catch (err) {
      console.error('Signup error:', err);
      const msg = err?.name === "AbortError"
        ? "Signup request timed out. Please try again."
        : `Network error. Ensure backend is running at ${BASE_URL}`;
      alert(msg);
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
          Pull the string to illuminate the signup
        </motion.p>
      </motion.div>

      {/* Hanging Lamp sits naturally at the top */}
      <Lamp isOn={isLightOn} onToggle={() => setIsLightOn(!isLightOn)} />

      {/* Main Signup Card */}
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

        <form onSubmit={handleSignupSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Username</label>
            <div className="relative h-14 w-full">
              <User 
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500" 
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-full rounded-2xl pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter Username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Email Address</label>
            <div className="relative h-14 w-full">
              <Mail 
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500" 
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-full rounded-2xl pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Enter email address"
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

          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Confirm Password</label>
            <div className="relative h-14 w-full">
              <Lock 
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-500" 
                style={{ color: isLightOn ? '#737373' : '#3d3d3d' }}
              />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-full rounded-2xl pl-12 pr-12 text-white text-sm focus:outline-none focus:ring-1 focus:border-[#F5A93B] focus:ring-[#F5A93B]/20 transition-all duration-500 placeholder-neutral-500"
                style={{
                  backgroundColor: isLightOn ? 'rgba(23, 23, 23, 0.65)' : 'rgba(8, 8, 8, 0.85)',
                  border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
                }}
                placeholder="Confirm password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
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
            {loading ? "Creating Account..." : "Create Account"}
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
