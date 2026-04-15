import React, { useEffect, useState } from 'react';
import { motion, useSpring } from 'motion/react';

export const CustomCursor = () => {
  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const springConfig = { damping: 25, stiffness: 400, mass: 0.2 };
  const cursorX = useSpring(-100, springConfig);
  const cursorY = useSpring(-100, springConfig);

  useEffect(() => {
    const checkTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    setIsTouchDevice(checkTouch);
    
    if (checkTouch) return;

    // Add cursor-none to body when custom cursor is active
    document.body.classList.add('cursor-none-global');

    const updateMousePosition = (e: MouseEvent) => {
      if (!isVisible) setIsVisible(true);
      cursorX.set(e.clientX - 4); // 8px width -> offset 4
      cursorY.set(e.clientY - 4); // 8px height -> offset 4
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isClickable = 
        window.getComputedStyle(target).cursor === 'pointer' ||
        target.tagName.toLowerCase() === 'button' ||
        target.tagName.toLowerCase() === 'a' ||
        target.tagName.toLowerCase() === 'input' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="button"]') ||
        target.closest('.cursor-pointer') ||
        target.closest('[data-radix-collection-item]');
        
      setIsHovering(!!isClickable);
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', updateMousePosition);
    window.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      document.body.classList.remove('cursor-none-global');
      window.removeEventListener('mousemove', updateMousePosition);
      window.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [cursorX, cursorY, isVisible]);

  if (isTouchDevice) return null;

  return (
    <motion.div
      className="fixed top-0 left-0 w-2 h-2 bg-white rounded-full pointer-events-none z-[99999]"
      style={{
        x: cursorX,
        y: cursorY,
        opacity: isVisible ? 1 : 0,
      }}
      animate={{
        scale: isHovering ? 2.5 : 1,
        boxShadow: isHovering ? "0 0 10px 2px rgba(255, 255, 255, 0.3)" : "0 0 0px 0px rgba(255, 255, 255, 0)",
      }}
      transition={{
        scale: { type: "spring", stiffness: 300, damping: 20 },
        boxShadow: { duration: 0.2 }
      }}
    />
  );
};
