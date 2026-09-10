import React from 'react';
import { motion, useAnimation } from 'framer-motion';

export default function Lamp({ isOn, onToggle }) {
  const lampControls = useAnimation();
  const cordControls = useAnimation();

  const triggerSwing = () => {
    lampControls.start({
      rotate: [0, -3.5, 3, -2, 1.2, -0.6, 0.3, 0],
      transition: { duration: 2.5, ease: "easeOut" }
    });

    cordControls.start({
      rotate: [0, -7, 5.5, -3.8, 2.2, -1, 0.4, 0],
      transition: { duration: 3, ease: "easeOut" }
    });
  };

  return (
    <div className="relative w-full flex flex-col items-center pointer-events-none z-20 h-[210px]">
      
      {/* Volumetric Light Cone - centered and extending downwards from bulb */}
      <motion.div
        initial={{ opacity: 0.15, scaleY: 0.95 }}
        animate={{ 
          opacity: isOn ? 1 : 0, 
          scaleY: isOn ? 1 : 0.95 
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="absolute top-[175px] w-[850px] h-[650px] pointer-events-none origin-top z-0"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(245, 169, 59, 0.22) 0%, rgba(245, 169, 59, 0.06) 45%, rgba(0,0,0,0) 70%)',
          maskImage: 'polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)',
          WebkitMaskImage: 'polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)',
          filter: 'blur(12px)'
        }}
      />

      {/* Swinging Lamp Assembly */}
      <motion.div
        animate={lampControls}
        style={{ transformOrigin: 'top center' }}
        className="relative flex flex-col items-center"
      >
        {/* Hanging Wire (hangs from the very top of screen/parent) */}
        <div className="w-[1.5px] h-[120px] bg-gradient-to-b from-[#333] via-[#222] to-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />

        {/* Lamp Base Connection */}
        <div className="w-5 h-6 bg-gradient-to-r from-[#222] via-[#3a3a3a] to-[#222] rounded-t-sm" />

        {/* Lamp Shade */}
        <div className="w-24 h-10 bg-gradient-to-r from-[#111] via-[#2d2d2d] to-[#111] rounded-b-xl relative shadow-[0_4px_10px_rgba(0,0,0,0.5)] flex items-center justify-center">
          {/* Internal reflection */}
          <div className="absolute bottom-0 w-[90%] h-[3px] bg-gradient-to-r from-transparent via-[#F5A93B]/50 to-transparent blur-[0.5px]" />
        </div>

        {/* Light Bulb */}
        <div 
          className="w-7 h-8 rounded-full -mt-2 z-10 relative flex items-center justify-center transition-all duration-400"
          style={{
            background: isOn 
              ? 'radial-gradient(circle, #ffffff 10%, #FFE29A 50%, #F5A93B 100%)' 
              : 'radial-gradient(circle, #444 10%, #333 70%, #222 100%)',
            boxShadow: isOn 
              ? '0 0 25px 5px rgba(245, 169, 59, 0.6), inset 0 -1px 2px rgba(0,0,0,0.2)' 
              : 'none'
          }}
        >
          {/* Filament */}
          <div className={`w-[1px] h-2.5 rounded-full transition-colors duration-400 ${isOn ? 'bg-white' : 'bg-neutral-600'}`} />
        </div>

        {/* Pull Cord */}
        <motion.div
          animate={cordControls}
          style={{ transformOrigin: 'top center' }}
          className="absolute left-[34px] top-[125px] z-20 flex flex-col items-center pointer-events-auto"
        >
          <div className="w-[1px] h-[55px] bg-gradient-to-b from-[#333] via-[#666] to-[#444]" />
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 35 }}
            dragElastic={0.4}
            whileHover={{ scale: 1.15 }}
            whileTap={{ cursor: 'grabbing', scale: 0.95 }}
            onDragEnd={(event, info) => {
              if (info.offset.y > 10) {
                onToggle();
                triggerSwing();
              }
            }}
            className="w-[9px] h-[9px] rounded-full bg-gradient-to-tr from-[#9a7b4f] via-[#E0A96D] to-[#fff] border border-black/40 shadow-md cursor-grab active:cursor-grabbing"
            style={{
              boxShadow: '0 1px 3px rgba(0,0,0,0.5), inset 0 0.5px 1px rgba(255,255,255,0.4)'
            }}
          />
        </motion.div>

      </motion.div>
    </div>
  );
}
