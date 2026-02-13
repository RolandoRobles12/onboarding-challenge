'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Zap, Trophy, Award, Flame, Heart, Shield, Target } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cn } from '@/lib/utils';

// ============================================================================
// CONFETTI LAUNCHER
// ============================================================================
export function useConfetti() {
  const fire = (opts?: { intensity?: 'low' | 'medium' | 'high' }) => {
    const intensity = opts?.intensity || 'medium';
    const count = intensity === 'low' ? 80 : intensity === 'high' ? 300 : 150;
    const spread = intensity === 'high' ? 120 : 80;

    confetti({
      particleCount: count,
      spread,
      origin: { y: 0.6 },
      colors: ['#E85D26', '#1A56DB', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1'],
    });

    if (intensity === 'high') {
      setTimeout(() => {
        confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } });
      }, 300);
    }
  };

  return { fire };
}

// ============================================================================
// FLOATING PARTICLES (for correct answers)
// ============================================================================
interface Particle {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

export function FloatingParticles({ trigger, type }: { trigger: boolean; type: 'correct' | 'wrong' }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const emojis = type === 'correct'
      ? ['⭐', '✨', '🎯', '💫', '🏆']
      : ['💔', '❌', '😬'];
    const newParticles = Array.from({ length: 5 }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 200 - 100,
      y: Math.random() * -80 - 20,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));
    setParticles(newParticles);
    const timer = setTimeout(() => setParticles([]), 1500);
    return () => clearTimeout(timer);
  }, [trigger, type]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, scale: 0.5, x: '50vw', y: '60vh' }}
            animate={{ opacity: 0, scale: 1.5, x: `calc(50vw + ${p.x}px)`, y: `calc(60vh + ${p.y}px)` }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="absolute text-2xl"
          >
            {p.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// XP COUNTER ANIMATION
// ============================================================================
export function XPCounter({ xp, show }: { xp: number; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="flex items-center gap-2 bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full font-bold text-lg shadow-lg"
        >
          <Zap className="h-5 w-5" />
          +{xp} XP
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// LEVEL UP OVERLAY
// ============================================================================
interface LevelUpProps {
  show: boolean;
  levelName: string;
  percentage: number;
  onDismiss: () => void;
}

export function LevelUpOverlay({ show, levelName, percentage, onDismiss }: LevelUpProps) {
  const getLevelColor = () => {
    if (percentage >= 90) return 'from-yellow-400 to-orange-500';
    if (percentage >= 75) return 'from-blue-400 to-purple-500';
    if (percentage >= 60) return 'from-green-400 to-teal-500';
    return 'from-gray-400 to-gray-600';
  };

  const getLevelIcon = () => {
    if (percentage >= 90) return <Trophy className="h-16 w-16 text-yellow-900" />;
    if (percentage >= 75) return <Star className="h-16 w-16 text-blue-900" />;
    if (percentage >= 60) return <Shield className="h-16 w-16 text-green-900" />;
    return <Target className="h-16 w-16 text-gray-900" />;
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.3, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.3, rotate: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={cn(
              'bg-gradient-to-br rounded-3xl p-8 text-center max-w-sm mx-4 shadow-2xl cursor-pointer',
              getLevelColor()
            )}
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mx-auto h-24 w-24 rounded-full bg-white/30 flex items-center justify-center mb-4"
            >
              {getLevelIcon()}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <p className="text-white/80 font-medium text-sm uppercase tracking-wider mb-1">¡Nivel Alcanzado!</p>
              <h2 className="text-3xl font-bold text-white mb-2">{levelName}</h2>
              <div className="bg-white/20 rounded-full px-4 py-1 inline-block">
                <span className="text-white font-bold text-xl">{percentage.toFixed(0)}%</span>
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-white/70 text-sm mt-4"
            >
              Toca para continuar
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// ACHIEVEMENT BADGE POPUP
// ============================================================================
interface BadgeNotificationProps {
  badges: Array<{ name: string; icon: string; xp: number }>;
  show: boolean;
}

export function BadgeNotifications({ badges, show }: BadgeNotificationProps) {
  const BADGE_ICONS: Record<string, JSX.Element> = {
    trophy: <Trophy className="h-6 w-6" />,
    star: <Star className="h-6 w-6" />,
    flame: <Flame className="h-6 w-6" />,
    award: <Award className="h-6 w-6" />,
    heart: <Heart className="h-6 w-6" />,
    zap: <Zap className="h-6 w-6" />,
    shield: <Shield className="h-6 w-6" />,
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      <AnimatePresence>
        {show && badges.map((badge, index) => (
          <motion.div
            key={badge.name}
            initial={{ opacity: 0, x: 100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ delay: index * 0.2, type: 'spring', stiffness: 300 }}
            className="flex items-center gap-3 bg-yellow-400 text-yellow-900 rounded-xl px-4 py-3 shadow-xl border-2 border-yellow-500"
          >
            <div className="h-10 w-10 rounded-full bg-yellow-300 flex items-center justify-center flex-shrink-0">
              {BADGE_ICONS[badge.icon] || <Award className="h-6 w-6" />}
            </div>
            <div>
              <p className="font-bold text-sm">{badge.name}</p>
              <p className="text-xs text-yellow-700 flex items-center gap-1">
                <Zap className="h-3 w-3" /> +{badge.xp} XP
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// ANIMATED SCORE COUNTER
// ============================================================================
export function AnimatedScore({ value, total }: { value: number; total: number }) {
  const [displayed, setDisplayed] = useState(0);
  const percentage = total > 0 ? (value / total) * 100 : 0;

  useEffect(() => {
    let start = 0;
    const step = Math.ceil(value / 30);
    const interval = setInterval(() => {
      start += step;
      if (start >= value) {
        setDisplayed(value);
        clearInterval(interval);
      } else {
        setDisplayed(start);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [value]);

  const getColor = () => {
    if (percentage >= 90) return 'text-yellow-500';
    if (percentage >= 75) return 'text-blue-500';
    if (percentage >= 60) return 'text-green-500';
    return 'text-muted-foreground';
  };

  return (
    <motion.p
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.5 }}
      className={cn('text-6xl font-bold', getColor())}
    >
      {displayed}
      <span className="text-3xl text-muted-foreground">/{total}</span>
    </motion.p>
  );
}

// ============================================================================
// PROGRESS RING
// ============================================================================
export function ProgressRing({ percentage }: { percentage: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(circumference - (percentage / 100) * circumference);
    }, 400);
    return () => clearTimeout(timer);
  }, [percentage, circumference]);

  const getColor = () => {
    if (percentage >= 90) return '#EAB308';
    if (percentage >= 75) return '#3B82F6';
    if (percentage >= 60) return '#10B981';
    return '#6B7280';
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={radius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
        <circle
          cx="60" cy="60" r={radius}
          stroke={getColor()}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s ease-in-out' }}
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-2xl font-bold" style={{ color: getColor() }}>
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// CORRECT/WRONG ANSWER ANIMATION WRAPPER
// ============================================================================
export function AnswerFeedback({ correct, children }: { correct: boolean | null; children: React.ReactNode }) {
  return (
    <motion.div
      animate={
        correct === null
          ? {}
          : correct
          ? { scale: [1, 1.02, 1], transition: { duration: 0.3 } }
          : { x: [0, -8, 8, -8, 8, 0], transition: { duration: 0.4 } }
      }
    >
      {children}
    </motion.div>
  );
}

// ============================================================================
// STREAK COUNTER
// ============================================================================
export function StreakCounter({ streak }: { streak: number }) {
  if (streak < 2) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0 }}
        className="flex items-center gap-1 bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg"
      >
        <Flame className="h-4 w-4" />
        {streak}x Racha
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// MISSION COMPLETE BANNER
// ============================================================================
export function MissionCompleteBanner({ show, missionName, perfect }: { show: boolean; missionName: string; perfect: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -60 }}
          transition={{ type: 'spring', stiffness: 300 }}
          className={cn(
            'fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-xl text-white font-bold text-center',
            perfect ? 'bg-gradient-to-r from-yellow-400 to-orange-500' : 'bg-gradient-to-r from-green-400 to-teal-500'
          )}
        >
          <div className="flex items-center gap-2">
            {perfect ? <Trophy className="h-5 w-5" /> : <Star className="h-5 w-5" />}
            <span>{perfect ? '¡MISIÓN PERFECTA!' : '¡MISIÓN COMPLETADA!'}</span>
          </div>
          <p className="text-sm font-normal opacity-90 mt-0.5">{missionName}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
