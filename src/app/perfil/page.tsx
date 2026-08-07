'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AvivaLogo } from '@/components/AvivaLogo';
import { BadgeDisplay } from '@/components/BadgeDisplay';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomNav } from '@/components/BottomNav';
import { calcXP } from '@/lib/xp';
import {
  getUserBadges,
  getUserAttempts,
  getUserJourneyProgress,
  getJourneyByProduct,
  getLevelsConfig,
  getLevelFromConfig,
  type LevelConfig,
} from '@/lib/firestore-service';
import type { UserBadge, QuizAttempt, JourneyStep } from '@/lib/types-scalable';
import {
  LogOut, Zap, Star, Medal, Award, CheckCircle2, Swords, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ElementType; label: string; value: string | number; color: string; bg: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 flex flex-col gap-2">
      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', bg)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PerfilPage() {
  const { user, profile, logout } = useAuth();
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [xp, setXp] = useState(0);
  const [levelConfig, setLevelConfig] = useState<LevelConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile ? ['super_admin', 'admin', 'trainer'].includes(profile.rol) : false;

  useEffect(() => {
    if (!user || !profile) return;

    Promise.all([
      getUserBadges(user.uid).catch(() => [] as UserBadge[]),
      getUserAttempts(user.uid).catch(() => [] as QuizAttempt[]),
      getLevelsConfig().catch(() => [] as LevelConfig[]),
    ]).then(async ([b, a, lvlCfg]) => {
      setBadges(b as UserBadge[]);
      setAttempts(a as QuizAttempt[]);
      setLevelConfig(lvlCfg as LevelConfig[]);

      const completedIds = new Set<string>();
      if (profile.producto) {
        try {
          const journey = await getJourneyByProduct(profile.producto);
          if (journey) {
            const prog = await getUserJourneyProgress(user.uid, journey.id).catch(() => null);
            (prog?.completedStepIds ?? []).forEach((id: string) => completedIds.add(id));
            const allActions: JourneyStep[] = journey.stages?.length
              ? journey.stages.flatMap(s => s.actions ?? [])
              : journey.steps ?? [];
            allActions.forEach(action => {
              if (action.type === 'info_form' && !action.config?.formId && profile.onboardingCompleted) completedIds.add(action.id);
            });
          }
        } catch { /* no journey configured */ }
      }

      setCompletedCount(completedIds.size);
      setXp(calcXP(a as QuizAttempt[], (b as UserBadge[]).length, completedIds.size));
      setLoading(false);
    });
  }, [user, profile]);

  const sortedLevels = [...levelConfig].sort((a, b) => a.minXP - b.minXP);
  const levelInfo = levelConfig.length > 0
    ? getLevelFromConfig(xp, levelConfig)
    : { level: 1, title: '—', emoji: '🌱', minXP: 0, xp, pctToNext: 0, xpToNext: 0, nextLevel: null };

  const completedAttempts = attempts.filter(a => a.status === 'completed');
  const avgScore = completedAttempts.length > 0
    ? Math.round(completedAttempts.reduce((s, a) => s + a.percentage, 0) / completedAttempts.length)
    : 0;
  const uniqueQuizzes = new Set(completedAttempts.map(a => a.quizId)).size;
  const perfectScores = completedAttempts.filter(a => a.percentage >= 100).length;

  return (
    <ProtectedRoute>
      <div className="flex flex-col min-h-screen bg-background">

        {/* Header */}
        <header className="bg-accent text-accent-foreground border-b sticky top-0 z-20">
          <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/"><AvivaLogo className="h-8 w-auto" /></Link>
            {user && (
              <Button variant="ghost" size="sm" onClick={logout} className="text-accent-foreground hover:bg-white/10 gap-1">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Salir</span>
              </Button>
            )}
          </div>
        </header>

        <main className="flex-grow">
          <div className="max-w-md mx-auto px-4 py-5 pb-24 space-y-4">

            {/* Hero: Avatar + Level + XP bar */}
            <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-white p-5">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="h-16 w-16 rounded-full bg-white/20 border-2 border-white/50 flex items-center justify-center">
                    <span className="text-2xl font-bold">
                      {profile?.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-yellow-400 border-2 border-white flex items-center justify-center">
                    <span className="text-[10px] font-bold text-yellow-900">{levelInfo.level}</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h1 className="font-bold text-lg leading-tight truncate">{profile?.nombre ?? '—'}</h1>
                  <p className="text-white/70 text-sm truncate">{profile?.email}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-lg">{levelInfo.emoji}</span>
                    <span className="text-sm font-semibold">{levelInfo.title}</span>
                  </div>
                </div>
              </div>

              {/* XP bar */}
              <div className="mt-4">
                <div className="flex justify-between text-white/70 text-xs mb-1.5">
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-yellow-300" />
                    <span className="font-semibold text-white">{xp} XP</span>
                  </div>
                  {levelInfo.xpToNext > 0 ? (
                    <span>Siguiente nivel en {levelInfo.xpToNext} XP</span>
                  ) : (
                    <span className="text-yellow-300 font-semibold">¡Nivel máximo! 🏆</span>
                  )}
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-300 rounded-full transition-all duration-700"
                    style={{ width: `${levelInfo.pctToNext}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Stats grid */}
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={CheckCircle2} label="Acciones completadas" value={completedCount} color="text-green-600" bg="bg-green-50" />
                <StatCard icon={Swords} label="Quizzes completados" value={uniqueQuizzes} color="text-purple-600" bg="bg-purple-50" />
                <StatCard icon={TrendingUp} label="Promedio de puntaje" value={`${avgScore}%`} color="text-blue-600" bg="bg-blue-50" />
                <StatCard icon={Award} label="Insignias ganadas" value={badges.length} color="text-amber-600" bg="bg-amber-50" />
              </div>
            )}

            {/* Perfect scores callout */}
            {!loading && perfectScores > 0 && (
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 p-4 flex items-center gap-3">
                <span className="text-3xl">⭐</span>
                <div>
                  <p className="font-semibold text-amber-800 text-sm">
                    {perfectScores} puntaje{perfectScores !== 1 ? 's' : ''} perfecto{perfectScores !== 1 ? 's' : ''}
                  </p>
                  <p className="text-amber-700 text-xs">¡Increíble precisión!</p>
                </div>
              </div>
            )}

            {/* Level guide */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                <span className="font-semibold text-sm">Niveles</span>
              </div>
              <div className="divide-y">
                {sortedLevels.map((lvl, idx) => {
                  const isCurrent = levelInfo.level === lvl.level;
                  const isPast = levelInfo.level > lvl.level;
                  const next = sortedLevels[idx + 1];
                  return (
                    <div
                      key={lvl.level}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5',
                        isCurrent && 'bg-primary/5 border-l-2 border-primary',
                        isPast && 'opacity-50',
                      )}
                    >
                      <span className="text-lg">{lvl.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium', isCurrent && 'text-primary')}>{lvl.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {next ? `${lvl.minXP}–${next.minXP - 1} XP` : `${lvl.minXP}+ XP`}
                        </p>
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                          ACTUAL
                        </span>
                      )}
                      {isPast && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Badges */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                <Medal className="h-4 w-4 text-amber-500" />
                <span className="font-semibold text-sm">Mis Insignias</span>
                {!loading && badges.length > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {badges.length} ganada{badges.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="p-4">
                {loading ? (
                  <div className="flex gap-4 flex-wrap">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-14 w-14 rounded-full bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : badges.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Medal className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">Aún no tienes insignias</p>
                    <p className="text-xs mt-1">Completa los desafíos para ganarlas</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {badges.map(ub => <BadgeDisplay key={ub.id} userBadge={ub} size="md" />)}
                  </div>
                )}
              </div>
            </div>

          </div>
        </main>

        <BottomNav isAdmin={isAdmin} />
      </div>
    </ProtectedRoute>
  );
}
