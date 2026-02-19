'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { AvivaLogo } from '@/components/AvivaLogo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getJourneyByProduct,
  getProduct,
  getUserJourneyProgress,
  markJourneyStepComplete,
  getUserBadges,
  getUserAttempts,
  getUserEnrollments,
} from '@/lib/firestore-service';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/leaderboard';
import type { Journey, JourneyStep, JourneyStage, Product, QuizAttempt } from '@/lib/types-scalable';
import { getLevelInfo, calcXP } from '@/lib/xp';
import { BottomNav } from '@/components/BottomNav';
import {
  LogOut, ShieldCheck, CheckCircle2, Lock, ChevronRight, FileText,
  HelpCircle, BarChart2, Award, AlertCircle, LayoutDashboard,
  Trophy, Star, BookOpen, Swords, Medal, Zap,
  ChevronDown, ChevronUp, PlayCircle, Sparkles, Target, ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarComponent } from '@/lib/avatars';

// ─── Narrative engine ─────────────────────────────────────────────────────────

function getNarrativePhase(pct: number, productName: string, firstName: string) {
  if (pct === 0) return { chapter: 1, phase: 'El Primer Día', title: 'La aventura comienza', emoji: '🚀',
    storyText: `${firstName} acaba de aceptar el desafío. Hoy comienza su camino hacia convertirse en Promotor ${productName} Certificado.` };
  if (pct <= 25) return { chapter: 1, phase: 'Primeros Pasos', title: 'Aprendiendo los fundamentos', emoji: '🧭',
    storyText: `${firstName} está dando sus primeros pasos. Cada etapa completada es un paso más hacia la maestría.` };
  if (pct <= 50) return { chapter: 2, phase: 'En Entrenamiento', title: 'El agente se forja', emoji: '⚡',
    storyText: `${firstName} avanza con determinación. Su entrenamiento está a la mitad y su potencial crece con cada acción.` };
  if (pct <= 75) return { chapter: 3, phase: 'La Gran Prueba', title: 'Es hora de demostrar tu valor', emoji: '🎯',
    storyText: `El momento de la verdad. Las evaluaciones más importantes esperan — aquí es donde los grandes promotores se distinguen.` };
  if (pct < 100) return { chapter: 4, phase: 'La Recta Final', title: 'Casi en la cima', emoji: '🏆',
    storyText: `${firstName} puede ver la meta. Solo quedan las últimas misiones entre él y el título de Promotor ${productName} Certificado.` };
  return { chapter: 5, phase: 'Misión Cumplida', title: '¡Promotor Aviva Certificado!', emoji: '🎖️',
    storyText: `${firstName} ha completado su transformación. De aspirante a Promotor ${productName} Certificado — la historia de un vendedor que no se rindió.` };
}

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEP_META: Record<string, {
  icon: React.ElementType; label: string; color: string;
  actionLabel: string;
  href: (productId: string, config?: JourneyStep['config']) => string;
  briefing: string;
}> = {
  info_form:  { icon: FileText,    label: 'Formulario',           color: 'text-blue-500',   actionLabel: 'Ver mis datos',       href: () => '#',                                                      briefing: 'Completa tu perfil de promotor.' },
  quiz:       { icon: HelpCircle,  label: 'Evaluación',           color: 'text-purple-500', actionLabel: 'Comenzar evaluación', href: (id) => `/${id}/quiz`,                                          briefing: 'Demuestra lo que has aprendido. Cada acierto suma XP.' },
  challenge:  { icon: Swords,      label: 'Desafío',              color: 'text-orange-500', actionLabel: 'Aceptar desafío',     href: (id) => `/${id}/quiz`,                                          briefing: 'Pon tus habilidades a prueba.' },
  course:     { icon: BookOpen,    label: 'Curso',                color: 'text-emerald-500',actionLabel: 'Iniciar curso',       href: (_, cfg) => cfg?.courseId ? `/courses/${cfg.courseId}` : '/',  briefing: 'Material para convertirte en experto.' },
  results:    { icon: BarChart2,   label: 'Resultados',           color: 'text-sky-500',    actionLabel: 'Ver resultados',      href: (id) => `/${id}/results`,                                       briefing: 'Consulta tu desempeño y áreas de mejora.' },
  certificate:{ icon: Award,       label: 'Certificado',          color: 'text-amber-500',  actionLabel: 'Obtener certificado', href: (id) => `/${id}/certificate`,                                   briefing: '¡Descarga tu certificado oficial Aviva!' },
  badge:      { icon: Medal,       label: 'Insignia',             color: 'text-yellow-500', actionLabel: 'Reclamar insignia',   href: () => '/perfil',                                                briefing: 'Has ganado una insignia por tu dedicación.' },
  checklist:  { icon: ListChecks,  label: 'Lista de verificación',color: 'text-teal-500',   actionLabel: 'Completar lista',     href: () => '#',                                                      briefing: 'Confirma los puntos necesarios para avanzar.' },
};

// ─── Stage color palette ──────────────────────────────────────────────────────

const STAGE_COLORS = [
  { dot: 'bg-violet-500', bar: 'bg-violet-500' },
  { dot: 'bg-blue-500',   bar: 'bg-blue-500' },
  { dot: 'bg-emerald-500',bar: 'bg-emerald-500' },
  { dot: 'bg-orange-500', bar: 'bg-orange-500' },
  { dot: 'bg-pink-500',   bar: 'bg-pink-500' },
];

// ─── Action row ───────────────────────────────────────────────────────────────

function ActionRow({ action, status, productId, journeyId, onMarkComplete }: {
  action: JourneyStep; status: 'completed' | 'active' | 'locked';
  productId: string; journeyId: string; onMarkComplete: (id: string) => void;
}) {
  const meta = STEP_META[action.type] ?? STEP_META.quiz;
  const Icon = meta.icon;
  const done = status === 'completed';
  const active = status === 'active';

  // ── Checklist state ──────────────────────────────────────────────────────
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const markedRef = useRef(false);
  const checklistItems = action.config?.checklistItems ?? [];
  const requiredItems = checklistItems.filter(i => i.required);
  const allRequiredChecked = requiredItems.length > 0 && requiredItems.every(i => checked.has(i.id));

  useEffect(() => {
    if (action.type === 'checklist' && active && allRequiredChecked && !markedRef.current) {
      markedRef.current = true;
      onMarkComplete(action.id);
    }
  }, [action.type, active, allRequiredChecked, action.id, onMarkComplete]);

  return (
    <div className={cn(
      'flex flex-col rounded-xl px-3 py-2.5 transition-all gap-2',
      done && 'bg-green-50/60',
      active && 'bg-white border border-primary/20 shadow-sm',
      status === 'locked' && 'opacity-40',
    )}>
      {/* Top row */}
      <div className="flex items-center gap-3">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
          done ? 'bg-green-100' : active ? 'bg-primary/10' : 'bg-muted')}>
          {done ? <CheckCircle2 className="h-4 w-4 text-green-600" />
            : status === 'locked' ? <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            : <Icon className={cn('h-4 w-4', meta.color)} />}
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium leading-tight truncate', done && 'text-muted-foreground line-through decoration-green-400')}>{action.title}</p>
          <p className="text-xs text-muted-foreground">{meta.label}</p>
        </div>

        {done && <span className="text-[10px] font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full shrink-0">✓</span>}

        {/* info_form → navigate to form page, no manual button */}
        {active && action.type === 'info_form' && action.config?.formId && (
          <Button size="sm" className="h-7 text-xs shrink-0 gap-1" asChild>
            <Link href={`/forms/${action.config.formId}?stepId=${action.id}&journeyId=${journeyId}&productId=${productId}`}>
              <FileText className="h-3 w-3" /> Completar
            </Link>
          </Button>
        )}

        {/* checklist → no button; items appear below */}
        {/* other types → standard Ir button */}
        {active && action.type !== 'info_form' && action.type !== 'checklist' && (
          <Button size="sm" className="h-7 text-xs shrink-0 gap-1" asChild>
            <Link href={meta.href(productId, action.config)}>
              <PlayCircle className="h-3 w-3" /> Ir
            </Link>
          </Button>
        )}
      </div>

      {/* Checklist items (inline, only when active) */}
      {action.type === 'checklist' && active && checklistItems.length > 0 && (
        <div className="pl-11 space-y-2">
          {checklistItems.map(item => (
            <label key={item.id} className="flex items-start gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-primary shrink-0"
                checked={checked.has(item.id)}
                onChange={() => setChecked(prev => {
                  const n = new Set(prev);
                  n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                  return n;
                })}
              />
              <span className={cn('leading-tight', checked.has(item.id) && 'line-through text-muted-foreground')}>
                {item.text}
                {item.required && <span className="text-destructive ml-0.5">*</span>}
              </span>
            </label>
          ))}
          {requiredItems.length > 0 && (
            <p className="text-[10px] text-muted-foreground">* Obligatorio para avanzar</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stage card ───────────────────────────────────────────────────────────────

function StageCard({ stage, index, status, completedIds, productId, journeyId, onMarkComplete }: {
  stage: JourneyStage; index: number; status: 'completed' | 'active' | 'locked';
  completedIds: Set<string>; productId: string; journeyId: string; onMarkComplete: (id: string) => void;
}) {
  const [open, setOpen] = useState(status === 'active');
  const palette = STAGE_COLORS[index % STAGE_COLORS.length];
  const doneCount = stage.actions.filter(a => completedIds.has(a.id)).length;
  const totalCount = stage.actions.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const getActionStatus = (action: JourneyStep, i: number): 'completed' | 'active' | 'locked' => {
    if (completedIds.has(action.id)) return 'completed';
    if (status === 'locked') return 'locked';
    const firstIncomplete = stage.actions.findIndex(a => !completedIds.has(a.id));
    return i === firstIncomplete ? 'active' : 'locked';
  };

  return (
    <div className={cn('rounded-2xl border overflow-hidden transition-all',
      status === 'active' && 'shadow-md border-primary/30',
      status === 'completed' && 'border-green-200 bg-green-50/20',
      status === 'locked' && 'opacity-55',
    )}>
      <button
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left', status !== 'locked' && 'hover:bg-muted/20')}
        onClick={() => status !== 'locked' && setOpen(o => !o)}
        disabled={status === 'locked'}
      >
        {/* Circle badge */}
        <div className={cn('h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0',
          status === 'completed' ? 'bg-green-500' : status === 'active' ? palette.dot : 'bg-muted-foreground/30')}>
          {status === 'completed' ? <CheckCircle2 className="h-4 w-4" />
            : status === 'locked' ? <Lock className="h-3.5 w-3.5" />
            : <span>{index + 1}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{stage.title}</p>
            {status === 'active' && (
              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold shrink-0 animate-pulse">ACTIVA</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">{doneCount}/{totalCount}</span>
            {status !== 'locked' && totalCount > 0 && (
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[80px]">
                <div className={cn('h-full rounded-full transition-all', status === 'completed' ? 'bg-green-500' : palette.bar)}
                  style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        </div>

        {status !== 'locked' && (open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && status !== 'locked' && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-muted/40 pt-3">
          {stage.actions.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-3">Sin acciones configuradas</p>
            : stage.actions.map((action, i) => (
                <ActionRow key={action.id} action={action} status={getActionStatus(action, i)}
                  productId={productId} journeyId={journeyId} onMarkComplete={onMarkComplete} />
              ))}
        </div>
      )}
    </div>
  );
}

// ─── Mini Leaderboard ─────────────────────────────────────────────────────────

function MiniLeaderboard({ productId, currentUserName }: { productId: string; currentUserName: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getLeaderboard(productId).then(d => setEntries(d.slice(0, 5))).finally(() => setLoading(false));
  }, [productId]);

  if (loading) return <Skeleton className="h-12 w-full rounded-xl" />;
  if (entries.length === 0) return null;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          <span className="font-semibold text-sm">Salón de la Fama</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{entries.length}</Badge>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t divide-y">
          {entries.map((entry, i) => {
            const AvatarComp = getAvatarComponent(entry.avatar);
            const isMe = entry.fullName?.toLowerCase() === currentUserName?.toLowerCase();
            const mins = Math.floor(entry.time / 60);
            const secs = entry.time % 60;
            return (
              <div key={entry.id} className={cn('flex items-center gap-3 px-4 py-2.5 text-sm', i === 0 && 'bg-yellow-50/60', isMe && 'bg-primary/5')}>
                <span className="w-5 shrink-0">{medals[i] ?? i + 1}</span>
                <AvatarComp className="h-7 w-7 text-muted-foreground shrink-0" />
                <p className="flex-1 font-medium truncate">{entry.fullName}{isMe && <span className="text-xs text-primary ml-1">(tú)</span>}</p>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xs font-semibold">{entry.score}/{entry.totalQuestions}</p>
                  <p className="text-[10px] text-muted-foreground">{mins}m {String(secs).padStart(2, '0')}s</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Journey Dashboard ────────────────────────────────────────────────────────

function JourneyDashboard({ userId, profile }: {
  userId: string;
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [xp, setXp] = useState(0);
  const [badgeCount, setBadgeCount] = useState(0);

  const productId = profile.producto || '';
  const firstName = profile.nombre?.split(' ')[0] || 'Agente';

  const load = useCallback(async () => {
    if (!productId) { setLoading(false); return; }
    try {
      const [foundProduct, foundJourney, badges, attempts] = await Promise.all([
        getProduct(productId),
        getJourneyByProduct(productId),
        getUserBadges(userId).catch(() => []),
        getUserAttempts(userId).catch(() => []),
      ]);
      setProduct(foundProduct);
      setJourney(foundJourney);
      const bLen = (badges as unknown[]).length;
      setBadgeCount(bLen);

      const ids = new Set<string>();
      if (foundJourney) {
        const prog = await getUserJourneyProgress(userId, foundJourney.id).catch(() => null);
        (prog?.completedStepIds ?? []).forEach((id: string) => ids.add(id));
      }

      const allActions: JourneyStep[] = foundJourney
        ? (foundJourney.stages?.length ? foundJourney.stages.flatMap(s => s.actions ?? []) : foundJourney.steps ?? [])
        : [];

      // Auto-mark info_form if onboarding done
      allActions.forEach(a => { if (a.type === 'info_form' && profile.onboardingCompleted) ids.add(a.id); });

      if (foundJourney) {
        const markPromises: Promise<void>[] = [];

        // Auto-mark course steps whose enrollment is completed
        const courseActions = allActions.filter(a => a.type === 'course' && a.config?.courseId);
        if (courseActions.length > 0) {
          const enrollments = await getUserEnrollments(userId).catch(() => []);
          courseActions.forEach(a => {
            if (ids.has(a.id)) return;
            const enr = enrollments.find(e => e.courseId === a.config!.courseId);
            if (enr?.status === 'completed') {
              ids.add(a.id);
              markPromises.push(
                markJourneyStepComplete(userId, foundJourney.id, productId, a.id).catch(console.error)
              );
            }
          });
        }

        // Auto-mark quiz/challenge/results steps if the user has a completed attempt for this product
        const hasCompletedAttempt = (attempts as QuizAttempt[]).some(a => a.productId === productId);
        if (hasCompletedAttempt) {
          allActions.forEach(a => {
            if ((a.type === 'quiz' || a.type === 'challenge' || a.type === 'results') && !ids.has(a.id)) {
              ids.add(a.id);
              markPromises.push(
                markJourneyStepComplete(userId, foundJourney.id, productId, a.id).catch(console.error)
              );
            }
          });
        }

        await Promise.all(markPromises);
      }

      setCompletedIds(ids);
      setXp(calcXP(attempts as QuizAttempt[], bLen, ids.size));
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [productId, userId, profile.onboardingCompleted]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when the user returns to this tab (e.g. after completing a course)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const handleMarkComplete = async (stepId: string) => {
    if (!journey) return;
    await markJourneyStepComplete(userId, journey.id, productId, stepId);
    setCompletedIds(prev => { const n = new Set(prev); n.add(stepId); return n; });
    setXp(prev => prev + 25);
  };

  if (loading) return (
    <div className="space-y-4 pb-24">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );

  if (loadError) return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-destructive/30 py-12 text-center gap-3">
      <AlertCircle className="h-10 w-10 text-destructive/60" />
      <p className="font-semibold">No se pudo cargar tu ruta</p>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Recargar</Button>
    </div>
  );

  if (!productId) return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center pb-24">
      <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="font-semibold text-lg">Sin producto asignado</p>
      <p className="text-muted-foreground text-sm mt-1 max-w-xs">Tu administrador aún no te ha asignado un producto.</p>
    </div>
  );

  if (!journey) return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center pb-24">
      <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="font-semibold text-lg">Ruta no configurada</p>
      <p className="text-muted-foreground text-sm mt-1 max-w-xs">
        Tu administrador aún no ha configurado la ruta para <strong>{product?.name ?? 'tu producto'}</strong>.
      </p>
    </div>
  );

  // Build stages (support stages[] and legacy steps[])
  const stages: JourneyStage[] = (
    journey.stages?.length
      ? [...journey.stages].sort((a, b) => a.order - b.order)
      : journey.steps?.length
        ? [{ id: 'legacy', order: 0, title: journey.name || 'Mi Ruta', required: true, actions: [...(journey.steps ?? [])].sort((a, b) => a.order - b.order) }]
        : []
  );

  const isStageDone = (s: JourneyStage) =>
    s.actions.length === 0 || s.actions.filter(a => a.required).every(a => completedIds.has(a.id));

  const getStageStatus = (idx: number): 'completed' | 'active' | 'locked' => {
    if (isStageDone(stages[idx])) return 'completed';
    return stages.slice(0, idx).every(isStageDone) ? 'active' : 'locked';
  };

  const allActions = stages.flatMap(s => s.actions);
  const doneCount = allActions.filter(a => completedIds.has(a.id)).length;
  const totalCount = allActions.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const finished = totalCount > 0 && doneCount === totalCount;

  const color = product?.color ?? '#7C3AED';
  const narrative = getNarrativePhase(pct, product?.name ?? '', firstName);
  const levelInfo = getLevelInfo(xp);

  return (
    <div className="space-y-4 pb-24">

      {/* Story banner */}
      <div className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}ee, ${color}88)` }}>
        <div className="px-5 pt-4 pb-0 flex items-center gap-2">
          <span className="text-white/50 text-[10px] font-mono uppercase tracking-[0.2em]">Capítulo {narrative.chapter}</span>
          <div className="h-px flex-1 bg-white/20" />
          <Badge className="bg-white/20 text-white border-white/30 text-[10px]">{narrative.phase}</Badge>
        </div>
        <div className="px-5 pt-3 pb-4 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-10 bg-white pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{narrative.emoji}</span>
              <h2 className="text-white font-bold text-lg leading-tight">{narrative.title}</h2>
            </div>
            <p className="text-white/75 text-sm leading-relaxed italic border-l-2 border-white/30 pl-3 mb-4">
              &ldquo;{narrative.storyText}&rdquo;
            </p>
            <div>
              <div className="flex justify-between text-white/70 text-xs mb-1.5">
                <span>Progreso de la ruta</span>
                <span className="font-semibold text-white">{finished ? '¡Completado!' : `${doneCount}/${totalCount}`}</span>
              </div>
              <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
        {/* Stats strip */}
        <div className="bg-black/15 px-5 py-2.5 flex items-center gap-4 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-white/80">
            <Zap className="h-3.5 w-3.5 text-yellow-300" />
            <span className="text-xs font-semibold">{xp} XP</span>
          </div>
          <div className="h-4 w-px bg-white/20" />
          <div className="flex items-center gap-1.5 text-white/80">
            <Star className="h-3.5 w-3.5 text-yellow-300 fill-yellow-300" />
            <span className="text-xs font-medium">Nv.{levelInfo.level} {levelInfo.title}</span>
          </div>
          <div className="h-4 w-px bg-white/20" />
          <div className="flex items-center gap-1.5 text-white/80">
            <Medal className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-xs">{badgeCount} insignia{badgeCount !== 1 ? 's' : ''}</span>
          </div>
          <Link href="/perfil" className="ml-auto text-white/70 text-xs hover:text-white flex items-center gap-1">
            Mi perfil <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Stages */}
      {stages.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
          <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Tu ruta aún no tiene etapas configuradas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stages.map((stage, i) => (
            <StageCard
              key={stage.id}
              stage={stage}
              index={i}
              status={getStageStatus(i)}
              completedIds={completedIds}
              productId={productId}
              journeyId={journey.id}
              onMarkComplete={handleMarkComplete}
            />
          ))}
        </div>
      )}

      {/* Completed state */}
      {finished && (
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 p-6 text-center">
          <div className="text-5xl mb-3">🎖️</div>
          <h3 className="font-bold text-xl text-amber-800">¡Ruta completada!</h3>
          <p className="text-amber-700 text-sm mt-1.5 max-w-xs mx-auto">Eres un Promotor Aviva Certificado. ¡Felicidades!</p>
          <div className="flex justify-center gap-2 mt-4">
            <Button size="sm" className="gap-2" asChild>
              <Link href={`/${productId}/certificate`}><Award className="h-4 w-4" /> Ver certificado</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/perfil"><Medal className="h-4 w-4 mr-1" /> Mis insignias</Link>
            </Button>
          </div>
        </div>
      )}

      <MiniLeaderboard productId={productId} currentUserName={profile.nombre ?? ''} />
    </div>
  );
}

// ─── Admin panel ──────────────────────────────────────────────────────────────

function AdminPanel({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 p-6 text-center">
      <LayoutDashboard className="h-10 w-10 text-primary mx-auto mb-3" />
      <h2 className="font-semibold text-lg">Hola, {name}</h2>
      <p className="text-muted-foreground text-sm mt-1 mb-4">Gestiona la plataforma desde el panel de control.</p>
      <Button asChild>
        <Link href="/admin">Ir al panel de administración <ChevronRight className="ml-1 h-4 w-4" /></Link>
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LMSDashboard() {
  const { user, profile, logout, refreshProfile } = useAuth();
  const isAdmin = !!(profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol));
  const firstName = profile?.nombre?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'tú';

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">

          {/* Header */}
          <header className="bg-accent text-accent-foreground border-b sticky top-0 z-20">
            <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/"><AvivaLogo className="h-8 w-auto" /></Link>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Link href="/admin">
                    <Button variant="outline" size="sm" className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Admin
                    </Button>
                  </Link>
                )}
                {user && (
                  <Button variant="ghost" size="sm" onClick={logout} className="text-accent-foreground hover:bg-white/10 gap-1">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Salir</span>
                  </Button>
                )}
              </div>
            </div>
          </header>

          {/* Main */}
          <main className="flex-grow">
            <div className="max-w-md mx-auto px-4 py-5">
              {!isAdmin && (
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h1 className="text-lg font-bold">Hola, {firstName} 👋</h1>
                </div>
              )}
              {isAdmin ? (
                <AdminPanel name={firstName} />
              ) : profile ? (
                <JourneyDashboard userId={profile.uid} profile={profile} />
              ) : user ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center gap-3">
                  <AlertCircle className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">No se pudo cargar tu perfil</p>
                    <p className="text-muted-foreground text-sm">Intenta recargar.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refreshProfile()}>Recargar</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center gap-3">
                  <AlertCircle className="h-10 w-10 text-muted-foreground" />
                  <p className="font-semibold">Sesión no iniciada</p>
                  <Button asChild size="sm"><Link href="/login">Iniciar sesión</Link></Button>
                </div>
              )}
            </div>
          </main>

          <BottomNav isAdmin={isAdmin} />
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
