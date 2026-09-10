import React from 'react';
import { motion } from 'framer-motion';

export default function GlassCard({ children, isLightOn = true, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ 
        opacity: isLightOn ? 1 : 0, 
        y: isLightOn ? 0 : 20 
      }}
      transition={{ 
        duration: 0.5, 
        ease: [0.16, 1, 0.3, 1] 
      }}
      className={`w-full max-w-[440px] rounded-3xl p-8 backdrop-blur-xl relative z-10 transition-all duration-500 ${className}`}
      style={{
        visibility: isLightOn ? 'visible' : 'hidden',
        pointerEvents: isLightOn ? 'auto' : 'none',
        backgroundColor: isLightOn ? 'rgba(10, 10, 10, 0.65)' : 'rgba(3, 3, 3, 0.95)',
        border: isLightOn ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(255, 255, 255, 0.02)',
        borderTop: isLightOn ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid rgba(255, 255, 255, 0.03)',
        boxShadow: isLightOn 
          ? '0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 0 25px rgba(245, 169, 59, 0.04)' 
          : 'none',
      }}
    >
      {/* Soft inner golden glow - visible only when light is ON */}
      <div 
        className="absolute inset-0 bg-gradient-to-tr from-transparent via-[rgba(245,169,59,0.03)] to-transparent rounded-3xl pointer-events-none transition-opacity duration-500" 
        style={{ opacity: isLightOn ? 1 : 0 }}
      />
      {children}
    </motion.div>
  );
}
