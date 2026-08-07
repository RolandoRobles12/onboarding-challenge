'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  getLevelsConfig,
  getLevelFromConfig,
  getDailyPulse,
  getPulseAttempt,
  getProducts,
  getCourse,
  getExplorableJourneys,
  type LevelConfig,
} from '@/lib/firestore-service';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/leaderboard';
import type {
  Journey, JourneyStep, JourneyStage, JourneyMilestone, Product, QuizAttempt,
} from '@/lib/types-scalable';
import type { Course } from '@/lib/types-lms';
import {
  getEntryDate, buildJourneySummary, groupStagesByMilestone,
  getMilestoneSchedule, getStageSchedule, formatDate,
  formatLongDate, formatDeadline, SCHEDULE_STATUS_STYLES,
  type ScheduleInfo, type JourneyScheduleSummary,
} from '@/lib/journey-schedule';
import { calcXP } from '@/lib/xp';
import { BottomNav } from '@/components/BottomNav';
import {
  LogOut, ShieldCheck, CheckCircle2, Lock, ChevronRight, FileText,
  HelpCircle, BarChart2, Award, AlertCircle, LayoutDashboard,
  Trophy, BookOpen, Swords, Medal, Zap,
  ChevronDown, ChevronUp, PlayCircle, Sparkles, Target, ListChecks,
  Radio, Clock, FlaskConical, X, CalendarDays, Compass, Flag, TrendingUp,
  AlertTriangle, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarComponent } from '@/lib/avatars';

// ─── Narrative engine ─────────────────────────────────────────────────────────

function getNarrativePhase(pct: number, productName: string, firstName: string) {
  if (pct === 0) return { chapter: 1, phase: 'El Primer Día', title: 'La aventura comienza', emoji: '🚀',
    storyText: `${firstName} acaba de aceptar el desafío. Hoy comienza su camino para dominar ${productName}.` };
  if (pct <= 25) return { chapter: 1, phase: 'Primeros Pasos', title: 'Aprendiendo los fundamentos', emoji: '🧭',
    storyText: `${firstName} está dando sus primeros pasos. Cada etapa completada es un paso más hacia la maestría.` };
  if (pct <= 50) return { chapter: 2, phase: 'En Entrenamiento', title: 'El agente se forja', emoji: '⚡',
    storyText: `${firstName} avanza con determinación. Su entrenamiento crece con cada acción completada.` };
  if (pct <= 75) return { chapter: 3, phase: 'La Gran Prueba', title: 'Es hora de demostrar tu valor', emoji: '🎯',
    storyText: `El momento de la verdad. Las evaluaciones más importantes esperan — aquí es donde los grandes promotores se distinguen.` };
  if (pct < 100) return { chapter: 4, phase: 'La Recta Final', title: 'Casi al día con el contenido', emoji: '🏆',
    storyText: `${firstName} casi termina el contenido disponible. ¡Sigue así, pronto habrá más módulos!` };
  return { chapter: 4, phase: 'Al Corriente', title: '¡Contenido actual dominado!', emoji: '✨',
    storyText: `${firstName} completó todo el contenido disponible. El equipo prepara nuevos módulos — ¡mantente atento!` };
}

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEP_META: Record<string, {
  icon: React.ElementType; label: string; color: string;
  actionLabel: string;
  href: (productId: string, config?: JourneyStep['config']) => string;
  briefing: string;
}> = {
  info_form:  { icon: FileText,    label: 'Formulario',           color: 'text-blue-500',   actionLabel: 'Ver mis datos',       href: () => '#',                                                      briefing: 'Completa tu perfil de promotor.' },
  quiz:       { icon: HelpCircle,  label: 'Evaluación',           color: 'text-purple-500', actionLabel: 'Comenzar evaluación', href: (id, cfg) => cfg?.quizId ? `/${id}/quiz?quizId=${cfg.quizId}` : `/${id}/quiz`,  briefing: 'Demuestra lo que has aprendido. Cada acierto suma XP.' },
  challenge:  { icon: Swords,      label: 'Desafío',              color: 'text-orange-500', actionLabel: 'Aceptar desafío',     href: (id, cfg) => cfg?.quizId ? `/${id}/quiz?quizId=${cfg.quizId}` : `/${id}/quiz`,  briefing: 'Pon tus habilidades a prueba.' },
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

interface CourseInfo {
  title: string;
  modules: { id: string; title: string; lessonIds: string[] }[];
}

function ActionRow({ action, status, productId, journeyId, isTestMode, isExploring, courseInfo, completedLessonIds, onMarkComplete }: {
  action: JourneyStep; status: 'completed' | 'active' | 'locked';
  productId: string; journeyId: string; isTestMode?: boolean; isExploring?: boolean;
  courseInfo?: CourseInfo;
  completedLessonIds?: string[];
  onMarkComplete: (id: string) => void;
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
    if (action.type === 'checklist' && active && allRequiredChecked && !markedRef.current && !isExploring) {
      markedRef.current = true;
      onMarkComplete(action.id);
    }
  }, [action.type, active, allRequiredChecked, action.id, onMarkComplete, isExploring]);

  return (
    <div className={cn(
      'flex flex-col rounded-xl px-3 py-2.5 transition-all gap-2',
      done && 'bg-green-50/60',
      active && !isExploring && 'bg-white border border-primary/20 shadow-sm',
      active && isExploring && 'bg-white border border-teal-200',
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

        {/* Exploration mode → read-only "Ver" link for content actions */}
        {isExploring && active && (action.type === 'course' || action.type === 'quiz' || action.type === 'challenge') && (
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 gap-1 border-teal-300 text-teal-700 hover:bg-teal-50" asChild>
            <Link href={meta.href(productId, action.config)}>
              <Eye className="h-3 w-3" /> Ver
            </Link>
          </Button>
        )}

        {/* info_form → navigate to form page, no manual button */}
        {!isExploring && active && action.type === 'info_form' && action.config?.formId && (
          <Button size="sm" className="h-7 text-xs shrink-0 gap-1" asChild>
            <Link href={`/forms/${action.config.formId}?stepId=${action.id}&journeyId=${journeyId}&productId=${productId}`}>
              <FileText className="h-3 w-3" /> Completar
            </Link>
          </Button>
        )}

        {/* checklist → no button; items appear below */}
        {/* other types → standard Ir button */}
        {!isExploring && active && action.type !== 'info_form' && action.type !== 'checklist' && (
          <div className="flex items-center gap-1 shrink-0">
            {action.type === 'course' && !action.config?.courseId ? (
              <Button size="sm" className="h-7 text-xs gap-1" disabled title="Este paso no tiene un curso asignado">
                <PlayCircle className="h-3 w-3" /> Ir
              </Button>
            ) : (
            <Button size="sm" className="h-7 text-xs gap-1" asChild>
              <Link href={meta.href(productId, action.config)}>
                <PlayCircle className="h-3 w-3" /> Ir
              </Link>
            </Button>
            )}
            {isTestMode && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => onMarkComplete(action.id)}
                title="Marcar como completado (solo en modo prueba)"
              >
                <CheckCircle2 className="h-3 w-3" /> ✓
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Course module breakdown — shown when active or completed */}
      {action.type === 'course' && courseInfo && courseInfo.modules.length > 0 && (status === 'active' || status === 'completed') && (() => {
        const completed = new Set(completedLessonIds ?? []);
        const totalLessons = courseInfo.modules.reduce((s, m) => s + m.lessonIds.length, 0);
        const totalDone = courseInfo.modules.reduce((s, m) => s + m.lessonIds.filter(id => completed.has(id)).length, 0);
        return (
          <div className="pl-11 space-y-1.5">
            {courseInfo.modules.map(mod => {
              const modDone = mod.lessonIds.filter(id => completed.has(id)).length;
              const modComplete = mod.lessonIds.length > 0 && modDone === mod.lessonIds.length;
              return (
                <div key={mod.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className={cn(
                    'h-4 w-4 rounded-full flex items-center justify-center shrink-0',
                    modComplete ? 'bg-green-100' : 'bg-muted',
                  )}>
                    {modComplete
                      ? <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                      : <BookOpen className="h-2.5 w-2.5" />}
                  </div>
                  <span className={cn('flex-1 truncate', modComplete && 'text-green-700')}>{mod.title}</span>
                  <span className="text-[10px] font-mono shrink-0">{modDone}/{mod.lessonIds.length} lecc.</span>
                </div>
              );
            })}
            {active && (
              <p className="text-[10px] text-muted-foreground italic">
                {totalDone} de {totalLessons} lecciones completadas
              </p>
            )}
          </div>
        );
      })()}

      {/* Checklist items (inline, only when active) */}
      {action.type === 'checklist' && active && checklistItems.length > 0 && (
        <div className="pl-11 space-y-2">
          {checklistItems.map(item => (
            <label key={item.id} className="flex items-start gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-primary shrink-0"
                checked={checked.has(item.id)}
                disabled={isExploring}
                onChange={() => setChecked(prev => {
                  const n = new Set(prev);
                  if (n.has(item.id)) n.delete(item.id); else n.add(item.id);
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

// ─── Deadline chip ────────────────────────────────────────────────────────────

function DeadlineChip({ schedule, compact }: { schedule: ScheduleInfo; compact?: boolean }) {
  if (schedule.status === 'no_deadline' || !schedule.dueDate) return null;

  const style = SCHEDULE_STATUS_STYLES[schedule.status];
  const label = schedule.status === 'completed'
    ? `Entregado · ${formatDate(schedule.dueDate)}`
    : compact
      ? formatDate(schedule.dueDate)
      : `${formatDeadline(schedule) ?? ''} · ${formatDate(schedule.dueDate)}`;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0',
      style.className,
    )}>
      {schedule.status === 'overdue' ? <AlertTriangle className="h-2.5 w-2.5" /> : <CalendarDays className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

// ─── Stage card ───────────────────────────────────────────────────────────────

function StageCard({ stage, index, status, schedule, completedIds, productId, journeyId, isTestMode, isExploring, coursesMap, enrollmentsMap, onMarkComplete }: {
  stage: JourneyStage; index: number; status: 'completed' | 'active' | 'locked';
  schedule?: ScheduleInfo;
  completedIds: Set<string>; productId: string; journeyId: string;
  isTestMode?: boolean; isExploring?: boolean;
  coursesMap?: Record<string, Course>;
  enrollmentsMap?: Record<string, string[]>; // courseId → completedLessonIds
  onMarkComplete: (id: string) => void;
}) {
  // Explorando, todas las etapas están abiertas: sólo se despliega la primera
  const [open, setOpen] = useState(status === 'active' && (!isExploring || index === 0));
  const palette = STAGE_COLORS[index % STAGE_COLORS.length];
  const doneCount = stage.actions.filter(a => completedIds.has(a.id)).length;
  const totalCount = stage.actions.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const overdue = schedule?.status === 'overdue';

  const getActionStatus = (action: JourneyStep, i: number): 'completed' | 'active' | 'locked' => {
    if (completedIds.has(action.id)) return 'completed';
    if (status === 'locked') return 'locked';
    // Exploration and test mode open everything so the route can be browsed freely
    if ((isTestMode || isExploring) && status === 'active') return 'active';
    const firstIncomplete = stage.actions.findIndex(a => !completedIds.has(a.id));
    return i === firstIncomplete ? 'active' : 'locked';
  };

  return (
    <div className={cn('rounded-2xl border overflow-hidden transition-all',
      status === 'active' && 'shadow-md border-primary/30',
      status === 'completed' && 'border-green-200 bg-green-50/20',
      status === 'locked' && 'opacity-55',
      overdue && status !== 'completed' && 'border-red-300 bg-red-50/20',
    )}>
      <button
        className={cn('w-full flex items-center gap-3 px-4 py-3 text-left', status !== 'locked' && 'hover:bg-muted/20')}
        onClick={() => status !== 'locked' && setOpen(o => !o)}
        disabled={status === 'locked'}
      >
        {/* Circle badge */}
        <div className={cn('h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0',
          status === 'completed' ? 'bg-green-500'
            : overdue ? 'bg-red-500'
            : status === 'active' ? palette.dot
            : 'bg-muted-foreground/30')}>
          {status === 'completed' ? <CheckCircle2 className="h-4 w-4" />
            : status === 'locked' ? <Lock className="h-3.5 w-3.5" />
            : <span>{index + 1}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{stage.title}</p>
            {status === 'active' && !isExploring && (
              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold shrink-0 animate-pulse">ACTIVA</span>
            )}
            {schedule && status !== 'locked' && <DeadlineChip schedule={schedule} />}
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
            : stage.actions.map((action, i) => {
                const course = action.type === 'course' && action.config?.courseId && coursesMap
                  ? coursesMap[action.config.courseId]
                  : undefined;
                const courseInfo: CourseInfo | undefined = course
                  ? {
                      title: course.title,
                      modules: course.modules.map(m => ({
                        id: m.id,
                        title: m.title,
                        lessonIds: m.lessons.map(l => l.id),
                      })),
                    }
                  : undefined;
                const completedLessonIds = action.type === 'course' && action.config?.courseId && enrollmentsMap
                  ? enrollmentsMap[action.config.courseId]
                  : undefined;
                return (
                  <ActionRow key={action.id} action={action} status={getActionStatus(action, i)}
                    productId={productId} journeyId={journeyId} isTestMode={isTestMode} isExploring={isExploring}
                    courseInfo={courseInfo} completedLessonIds={completedLessonIds}
                    onMarkComplete={onMarkComplete} />
                );
              })}
        </div>
      )}
    </div>
  );
}

// ─── Coming Soon Teaser ───────────────────────────────────────────────────────

const TEASER_COPY = [
  {
    headline: '🔮 Algo increíble está en camino...',
    body: 'Nuestro equipo está construyendo algo especial para ti. ¡No te lo vas a querer perder!',
  },
  {
    headline: '✨ Una sorpresa se acerca',
    body: 'Muy pronto desbloquearás esta etapa y descubrirás lo que te espera. ¡Sigue avanzando!',
  },
  {
    headline: '🚀 Próximamente: algo épico',
    body: 'Estamos preparando contenido que va a llevarte al siguiente nivel. ¡Mantente atento!',
  },
  {
    headline: '🎯 Tu próximo reto se prepara',
    body: 'Los mejores promotores saben que lo más emocionante siempre está por llegar. ¡Prepárate!',
  },
  {
    headline: '🌟 Se está cocinando algo genial',
    body: 'Nuestro equipo trabaja en algo que te va a encantar. Vale la pena esperar — te lo prometemos.',
  },
];

function ComingSoonTeaser({ stage, index }: { stage: JourneyStage; index: number }) {
  const palette = STAGE_COLORS[index % STAGE_COLORS.length];
  const copy = TEASER_COPY[index % TEASER_COPY.length];

  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/25 overflow-hidden relative">
      {/* Subtle animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/4 via-primary/8 to-violet-500/5 animate-pulse pointer-events-none" />

      <div className="relative flex items-center gap-3 px-4 py-4">
        {/* Stage number (faded) */}
        <div className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 opacity-30',
          palette.dot,
        )}>
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-xs text-muted-foreground/70 font-medium truncate">{stage.title}</p>
            <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold shrink-0 tracking-wide">
              PRÓXIMAMENTE
            </span>
          </div>
          <p className="font-bold text-sm leading-tight text-foreground/80">{copy.headline}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{copy.body}</p>
        </div>

        <Sparkles className="h-5 w-5 text-primary/30 shrink-0 animate-pulse" />
      </div>
    </div>
  );
}

// ─── Route switcher (explorar otros productos / trayectorias) ─────────────────

interface RouteOption {
  productId: string;
  productName: string;
  color: string;
  journeyName: string;
  stageCount: number;
  isMine: boolean;
}

function RouteSwitcher({ options, activeProductId, onSelect }: {
  options: RouteOption[];
  activeProductId: string;
  onSelect: (productId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (options.length <= 1) return null;

  const active = options.find(o => o.productId === activeProductId);
  const others = options.filter(o => o.productId !== activeProductId);

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="h-9 w-9 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
          <Compass className="h-5 w-5 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">
            {active ? active.productName : 'Explorar rutas'}
          </p>
          <p className="text-xs text-muted-foreground">
            {active?.isMine
              ? `Tu ruta asignada · ${others.length} más por conocer`
              : 'Explorando otra trayectoria'}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t divide-y">
          {options.map(opt => (
            <button
              key={opt.productId}
              onClick={() => { onSelect(opt.productId); setOpen(false); }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30',
                opt.productId === activeProductId && 'bg-primary/5',
              )}
            >
              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium truncate">{opt.productName}</p>
                  {opt.isMine && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold shrink-0">MI RUTA</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {opt.journeyName} · {opt.stageCount} etapa{opt.stageCount !== 1 ? 's' : ''}
                </p>
              </div>
              {opt.productId === activeProductId
                ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
          ))}

          <Link
            href="/learning-paths"
            className="flex items-center gap-2 px-4 py-2.5 text-xs text-teal-700 hover:bg-teal-50 transition-colors"
          >
            <Compass className="h-3.5 w-3.5 shrink-0" />
            Ver el catálogo completo de rutas
            <ChevronRight className="h-3.5 w-3.5 ml-auto shrink-0" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Milestone timeline (30 / 60 / 90 días o los que configure el admin) ──────

interface MilestoneView {
  milestone: JourneyMilestone;
  startDay: number;
  schedule: ScheduleInfo;
  done: number;
  total: number;
  isCurrent: boolean;
}

function MilestoneTimeline({ views, selectedId, onSelect }: {
  views: MilestoneView[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (views.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Flag className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tu plan por tiempo
        </p>
        {selectedId && (
          <button onClick={() => onSelect(null)} className="ml-auto text-[11px] text-primary hover:underline">
            Ver todo
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {views.map(v => {
          const { milestone: m, schedule, done, total, isCurrent } = v;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const complete = schedule.status === 'completed';
          const overdue = schedule.status === 'overdue';
          const selected = selectedId === m.id;
          const accent = m.color ?? '#8B5CF6';

          return (
            <button
              key={m.id}
              onClick={() => onSelect(selected ? null : m.id)}
              className={cn(
                'shrink-0 w-[168px] rounded-2xl border-2 px-3 py-2.5 text-left transition-all',
                selected ? 'shadow-md' : 'hover:shadow-sm',
                overdue && !complete && 'border-red-300 bg-red-50/40',
              )}
              style={
                overdue && !complete
                  ? undefined
                  : {
                      borderColor: selected || isCurrent ? accent : `${accent}33`,
                      backgroundColor: complete ? '#F0FDF4' : selected || isCurrent ? `${accent}0D` : undefined,
                    }
              }
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base leading-none">{m.emoji ?? '🎯'}</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: accent }}>
                  {m.shortLabel ?? `${m.dayOffset}d`}
                </span>
                {complete && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 ml-auto" />}
                {!complete && isCurrent && (
                  <span className="ml-auto text-[9px] bg-foreground/80 text-background px-1.5 py-0.5 rounded-full font-bold">
                    EN CURSO
                  </span>
                )}
                {!complete && !isCurrent && overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 ml-auto" />}
              </div>

              <p className="text-xs font-semibold leading-tight line-clamp-2 min-h-[2rem]">{m.label}</p>

              <p className="text-[10px] text-muted-foreground mt-1">
                Día {v.startDay}–{m.dayOffset}
                {schedule.dueDate && ` · ${formatDate(schedule.dueDate)}`}
              </p>

              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: complete ? '#22C55E' : accent }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{done}/{total}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Hero: progreso anclado a la fecha de ingreso ─────────────────────────────

function JourneyHero({ color, narrative, summary, doneCount, totalCount, pct, finished, xp, badgeCount, currentLevel, milestoneViews, isExploring, productName }: {
  color: string;
  narrative: ReturnType<typeof getNarrativePhase>;
  summary: JourneyScheduleSummary;
  doneCount: number; totalCount: number; pct: number; finished: boolean;
  xp: number; badgeCount: number;
  currentLevel: LevelConfig | null;
  milestoneViews: MilestoneView[];
  isExploring: boolean;
  productName: string;
}) {
  const { currentDay, totalDays, entryDate, currentMilestone, overdueStageIds } = summary;
  const anchored = currentDay !== null && totalDays !== null && totalDays > 0;

  // Ritmo esperado vs. real — sólo tiene sentido con plan anclado
  const expectedPct = anchored ? Math.min(100, Math.round(((currentDay ?? 0) / (totalDays ?? 1)) * 100)) : null;
  const behind = expectedPct !== null && pct < expectedPct - 10;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}ee, ${color}88)` }}>
      {/* Top strip */}
      <div className="px-5 pt-4 pb-0 flex items-center gap-2 flex-wrap">
        {isExploring ? (
          <span className="text-white/70 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-1">
            <Compass className="h-3 w-3" /> Explorando {productName}
          </span>
        ) : anchored ? (
          <span className="text-white/70 text-[10px] font-mono uppercase tracking-[0.2em]">
            Día {currentDay} de {totalDays}
          </span>
        ) : (
          <span className="text-white/50 text-[10px] font-mono uppercase tracking-[0.2em]">
            Capítulo {narrative.chapter}
          </span>
        )}
        <div className="h-px flex-1 bg-white/20" />
        <Badge className="bg-white/20 text-white border-white/30 text-[10px]">
          {isExploring ? 'Vista previa' : currentMilestone?.label ?? narrative.phase}
        </Badge>
      </div>

      <div className="px-5 pt-3 pb-4 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-10 bg-white pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{isExploring ? '🧭' : currentMilestone?.emoji ?? narrative.emoji}</span>
            <h2 className="text-white font-bold text-lg leading-tight">
              {isExploring ? `Ruta de ${productName}` : narrative.title}
            </h2>
          </div>

          <p className="text-white/75 text-sm leading-relaxed italic border-l-2 border-white/30 pl-3 mb-4">
            &ldquo;{isExploring
              ? 'Así se ve el camino de aprendizaje de este producto. Conócelo a tu ritmo.'
              : currentMilestone?.description ?? narrative.storyText}&rdquo;
          </p>

          {/* Barra de progreso con marcas de hitos */}
          <div>
            <div className="flex justify-between text-white/70 text-xs mb-1.5">
              <span>Progreso de la ruta</span>
              <span className="font-semibold text-white">{finished ? '¡Al corriente!' : `${doneCount}/${totalCount}`}</span>
            </div>
            <div className="relative h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
              {/* Marcador del ritmo esperado según la fecha de ingreso */}
              {expectedPct !== null && expectedPct < 100 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white/70"
                  style={{ left: `${expectedPct}%` }}
                  title={`Ritmo esperado al día ${currentDay}`}
                />
              )}
            </div>

            {/* Marcas de hitos bajo la barra */}
            {anchored && milestoneViews.length > 0 && (
              <div className="relative h-4 mt-1">
                {milestoneViews.map(v => (
                  <span
                    key={v.milestone.id}
                    className="absolute -translate-x-1/2 text-[9px] font-mono text-white/60"
                    style={{ left: `${Math.min(100, (v.milestone.dayOffset / (totalDays ?? 1)) * 100)}%` }}
                  >
                    {v.milestone.shortLabel ?? `${v.milestone.dayOffset}d`}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Alertas de ritmo */}
          {!isExploring && anchored && (overdueStageIds.length > 0 || behind) && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-black/20 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-300 mt-0.5 shrink-0" />
              <p className="text-white/85 text-xs leading-snug">
                {overdueStageIds.length > 0
                  ? `Tienes ${overdueStageIds.length} etapa${overdueStageIds.length !== 1 ? 's' : ''} fuera de plazo. Retómala${overdueStageIds.length !== 1 ? 's' : ''} para ponerte al corriente.`
                  : `Vas un poco por detrás del ritmo esperado para el día ${currentDay}. ¡Aún hay tiempo!`}
              </p>
            </div>
          )}

          {!isExploring && anchored && !behind && overdueStageIds.length === 0 && (
            <div className="mt-3 flex items-center gap-2 text-white/70 text-xs">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-200 shrink-0" />
              <span>Vas a tiempo con tu plan{entryDate ? ` desde el ${formatLongDate(entryDate)}` : ''}.</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="bg-black/15 px-5 py-2.5 flex items-center gap-4 border-t border-white/10 flex-wrap">
        <div className="flex items-center gap-1.5 text-white/80">
          <Zap className="h-3.5 w-3.5 text-yellow-300" />
          <span className="text-xs font-semibold">{xp} XP</span>
        </div>
        {currentLevel && (
          <>
            <div className="h-4 w-px bg-white/20" />
            <div className="flex items-center gap-1 text-white/80">
              <span className="text-sm leading-none">{currentLevel.emoji}</span>
              <span className="text-xs font-medium">{currentLevel.title}</span>
            </div>
          </>
        )}
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
  );
}

// ─── Pulse Today Card ─────────────────────────────────────────────────────────

function PulseTodayCard({ userId }: { userId: string }) {
  const [status, setStatus] = useState<'loading' | 'no_pulse' | 'pending' | 'done' | 'closed'>('loading');
  const [correctAnswers, setCorrectAnswers] = useState<number | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([getDailyPulse(today), getPulseAttempt(userId, today)]).then(([pulse, attempt]) => {
      if (!pulse || pulse.status === 'scheduled') { setStatus('no_pulse'); return; }
      if (attempt?.status === 'completed') {
        setCorrectAnswers(attempt.correctAnswers);
        setStatus('done');
        return;
      }
      if (pulse.status === 'closed') { setStatus('closed'); return; }
      setStatus('pending');
    }).catch(() => setStatus('no_pulse'));
  }, [userId]);

  if (status === 'loading' || status === 'no_pulse') return null;

  return (
    <Link href="/pulse">
      <div className={cn(
        'rounded-2xl border p-4 flex items-center gap-4 transition-all hover:shadow-md',
        status === 'done'
          ? 'bg-green-50 border-green-200'
          : status === 'closed'
          ? 'bg-muted/40 border-muted'
          : 'bg-primary/5 border-primary/20 animate-pulse-slow',
      )}>
        <div className={cn(
          'h-11 w-11 rounded-xl flex items-center justify-center shrink-0',
          status === 'done' ? 'bg-green-500/15' : status === 'closed' ? 'bg-muted' : 'bg-primary/10',
        )}>
          {status === 'done'
            ? <CheckCircle2 className="h-6 w-6 text-green-600" />
            : status === 'closed'
            ? <Clock className="h-6 w-6 text-muted-foreground" />
            : <Radio className="h-6 w-6 text-primary" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('font-semibold text-sm',
            status === 'done' ? 'text-green-700' : status === 'closed' ? 'text-muted-foreground' : 'text-primary'
          )}>
            {status === 'done' ? '¡Pulso completado!' : status === 'closed' ? 'Pulso cerrado' : 'Pulso de hoy disponible'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status === 'done'
              ? `${correctAnswers}/7 respuestas correctas`
              : status === 'closed'
              ? 'El tiempo de respuesta terminó'
              : '7 preguntas · Responde antes de las 12 PM'}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

// ─── Mini Leaderboard ─────────────────────────────────────────────────────────

function MiniLeaderboard({ productId, currentUserName }: { productId: string; currentUserName: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
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

function JourneyDashboard({ userId, profile, productId, testStageId, isTestMode, isExploring, routeOptions, onSelectRoute, onStagesLoaded }: {
  userId: string;
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  /** Producto cuya ruta se muestra. Puede diferir del asignado en modo exploración. */
  productId: string;
  testStageId?: string | null;
  isTestMode?: boolean;
  isExploring?: boolean;
  routeOptions?: RouteOption[];
  onSelectRoute?: (productId: string) => void;
  onStagesLoaded?: (stages: { id: string; title: string }[]) => void;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [coursesMap, setCoursesMap] = useState<Record<string, Course>>({});
  const [enrollmentsMap, setEnrollmentsMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [xp, setXp] = useState(0);
  const [badgeCount, setBadgeCount] = useState(0);
  const [levelConfig, setLevelConfig] = useState<LevelConfig[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);

  const firstName = profile.nombre?.split(' ')[0] || 'Agente';
  const entryDate = useMemo(() => getEntryDate(profile), [profile]);

  // Sin escritura de progreso mientras se explora otra ruta o se prueba la vista
  const readOnly = !!isExploring || !!isTestMode;

  const load = useCallback(async () => {
    if (!productId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      const [foundProduct, foundJourney, badges, attempts, lvlCfg] = await Promise.all([
        getProduct(productId),
        getJourneyByProduct(productId),
        getUserBadges(userId).catch(() => []),
        getUserAttempts(userId).catch(() => []),
        getLevelsConfig().catch(() => [] as LevelConfig[]),
      ]);
      if (lvlCfg.length > 0) setLevelConfig(lvlCfg);
      setProduct(foundProduct);
      setJourney(foundJourney);
      const bLen = (badges as unknown[]).length;
      setBadgeCount(bLen);

      const ids = new Set<string>();
      if (foundJourney && !readOnly) {
        // En modo prueba/exploración se parte de cero para no tocar el progreso real
        const prog = await getUserJourneyProgress(userId, foundJourney.id).catch(() => null);
        (prog?.completedStepIds ?? []).forEach((id: string) => ids.add(id));
      }

      const allActions: JourneyStep[] = foundJourney
        ? (foundJourney.stages?.length ? foundJourney.stages.flatMap(s => s.actions ?? []) : foundJourney.steps ?? [])
        : [];

      // Auto-mark info_form if onboarding done
      if (!readOnly) {
        allActions.forEach(a => { if (a.type === 'info_form' && profile.onboardingCompleted) ids.add(a.id); });
      }

      // Fetch course data for all course steps (for module breakdown display)
      const courseStepIds = allActions
        .filter(a => a.type === 'course' && a.config?.courseId)
        .map(a => a.config!.courseId as string);
      if (courseStepIds.length > 0) {
        const courseResults = await Promise.all(courseStepIds.map(id => getCourse(id).catch(() => null)));
        const cMap: Record<string, Course> = {};
        courseResults.forEach((c, i) => { if (c) cMap[courseStepIds[i]] = c; });
        setCoursesMap(cMap);
      } else {
        setCoursesMap({});
      }

      if (foundJourney && !readOnly) {
        const markPromises: Promise<void>[] = [];

        // Auto-mark course steps whose enrollment is completed
        const courseActions = allActions.filter(a => a.type === 'course' && a.config?.courseId);
        if (courseActions.length > 0) {
          const enrollments = await getUserEnrollments(userId).catch(() => []);
          const eMap: Record<string, string[]> = {};
          enrollments.forEach(e => { eMap[e.courseId] = e.completedLessonIds ?? []; });
          setEnrollmentsMap(eMap);
          courseActions.forEach(a => {
            if (ids.has(a.id)) return;
            const enr = enrollments.find(e => e.courseId === a.config!.courseId);
            if (enr?.status === 'completed') {
              ids.add(a.id);
              markPromises.push(
                markJourneyStepComplete(userId, foundJourney.id, productId, a.id, { userName: profile.nombre, userEmail: profile.email }).catch(console.error)
              );
            }
          });
        }

        // Note: quiz/challenge/results steps are marked complete via the quiz results
        // page (results/page.tsx) after the user finishes a quiz.

        // Auto-mark badge steps if the user already has any badges
        if (bLen > 0) {
          allActions.forEach(a => {
            if (a.type === 'badge' && !ids.has(a.id)) {
              ids.add(a.id);
              markPromises.push(
                markJourneyStepComplete(userId, foundJourney.id, productId, a.id, { userName: profile.nombre, userEmail: profile.email }).catch(console.error)
              );
            }
          });
        }

        await Promise.all(markPromises);
      }

      setCompletedIds(ids);
      setXp(calcXP(attempts as QuizAttempt[], bLen, ids.size));

      // Notify parent of visible stages — used by test mode module selector
      if (onStagesLoaded && foundJourney) {
        const sortedStages = foundJourney.stages?.length
          ? [...foundJourney.stages].sort((a, b) => a.order - b.order).filter(s => s.visible !== false)
          : foundJourney.steps?.length
            ? [{ id: 'legacy', title: foundJourney.name || 'Mi Ruta' }]
            : [];
        onStagesLoaded(sortedStages.map(s => ({ id: s.id, title: s.title })));
      }
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [productId, userId, profile.onboardingCompleted, profile.nombre, profile.email, readOnly, onStagesLoaded]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch when the user returns to this tab (e.g. after completing a course)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Al cambiar de ruta se limpia el filtro de tramo
  useEffect(() => { setSelectedMilestoneId(null); }, [productId]);

  const handleMarkComplete = async (stepId: string) => {
    if (!journey) return;
    if (!readOnly) {
      await markJourneyStepComplete(userId, journey.id, productId, stepId, { userName: profile.nombre, userEmail: profile.email });
    }
    setCompletedIds(prev => { const n = new Set(prev); n.add(stepId); return n; });
    setXp(prev => prev + 25);
  };

  const switcher = routeOptions && onSelectRoute
    ? <RouteSwitcher options={routeOptions} activeProductId={productId} onSelect={onSelectRoute} />
    : null;

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
      <Button variant="outline" size="sm" onClick={() => load()}>Recargar</Button>
    </div>
  );

  if (!productId) return (
    <div className="space-y-4 pb-24">
      {switcher}
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-semibold text-lg">Sin producto asignado</p>
        <p className="text-muted-foreground text-sm mt-1 max-w-xs">
          Tu administrador aún no te ha asignado un producto. Mientras tanto puedes explorar otras rutas.
        </p>
      </div>
    </div>
  );

  if (!journey || journey.status === 'draft') return (
    <div className="space-y-4 pb-24">
      {switcher}
      <div className="rounded-2xl overflow-hidden border border-primary/10">
        {/* Gradient hero */}
        <div className="relative bg-gradient-to-br from-primary/8 via-violet-500/6 to-primary/4 px-6 py-10 text-center overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-30">
            <div className="absolute top-4 left-8 text-2xl animate-pulse">✨</div>
            <div className="absolute top-6 right-10 text-xl animate-pulse" style={{ animationDelay: '0.5s' }}>⭐</div>
            <div className="absolute bottom-6 left-14 text-xl animate-pulse" style={{ animationDelay: '1s' }}>💫</div>
            <div className="absolute bottom-4 right-8 text-2xl animate-pulse" style={{ animationDelay: '1.5s' }}>✨</div>
          </div>

          <div className="relative text-6xl mb-4 inline-block">
            🐆
            <span className="absolute -top-1 -right-2 text-xl animate-bounce">🔮</span>
          </div>

          <div className="relative space-y-2">
            <span className="text-[10px] font-bold tracking-widest uppercase text-primary/70 bg-primary/10 px-3 py-1 rounded-full">
              PRÓXIMAMENTE
            </span>
            <h2 className="text-xl font-bold mt-2">
              Algo increíble está en camino
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
              El equipo está construyendo la ruta de aprendizaje para{' '}
              <strong className="text-foreground">{product?.name ?? 'este producto'}</strong>.
              Lo que se viene te va a sorprender.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 border-t border-primary/10">
          {[
            { icon: '🎯', label: 'Retos', hint: 'Pon a prueba tu conocimiento' },
            { icon: '🏆', label: 'Logros', hint: 'Gana insignias y puntos' },
            { icon: '📈', label: 'Progreso', hint: 'Sigue tu avance en tiempo real' },
          ].map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-center py-4 px-2 text-center border-r last:border-r-0 border-primary/10 gap-1"
            >
              <span className="text-2xl opacity-50 blur-[1px]">{item.icon}</span>
              <p className="text-xs font-semibold text-muted-foreground/60">{item.label}</p>
              <p className="text-[10px] text-muted-foreground/40 leading-tight hidden sm:block">{item.hint}</p>
            </div>
          ))}
        </div>

        <div className="bg-muted/30 border-t border-primary/10 px-4 py-3 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary/50 shrink-0 animate-pulse" />
          <p className="text-xs text-muted-foreground">
            Vuelve pronto — los mejores promotores son los primeros en estar listos.
          </p>
        </div>
      </div>
    </div>
  );

  // ── Etapas (soporta stages[] y el modelo legacy steps[]) ──────────────────
  const stages: JourneyStage[] = (
    journey.stages?.length
      ? [...journey.stages].sort((a, b) => a.order - b.order)
      : journey.steps?.length
        ? [{ id: 'legacy', order: 0, title: journey.name || 'Mi Ruta', required: true, actions: [...(journey.steps ?? [])].sort((a, b) => a.order - b.order) }]
        : []
  );

  const isStageDone = (s: JourneyStage) =>
    s.actions.length === 0 || s.actions.filter(a => a.required).every(a => completedIds.has(a.id));

  // Las etapas ocultas (visible === false) son teasers — no cuentan para el progreso
  const visibleStages = stages.filter(s => s.visible !== false);

  const getStageStatus = (stage: JourneyStage): 'completed' | 'active' | 'locked' => {
    // Explorando otra ruta: todo abierto para poder conocerla
    if (isExploring) return 'active';
    // Modo prueba: saltar a una etapa específica
    if (testStageId) {
      const targetIdx = visibleStages.findIndex(s => s.id === testStageId);
      const stageIdx = visibleStages.indexOf(stage);
      if (stageIdx < targetIdx) return 'completed';
      if (stageIdx === targetIdx) return 'active';
      return 'locked';
    }
    if (isStageDone(stage)) return 'completed';
    const vIdx = visibleStages.indexOf(stage);
    return visibleStages.slice(0, vIdx).every(isStageDone) ? 'active' : 'locked';
  };

  // ── Calendario anclado a la fecha de ingreso ──────────────────────────────
  const summary = buildJourneySummary(journey, visibleStages, entryDate, isStageDone);
  const { milestones } = summary;
  const { groups, unassigned } = groupStagesByMilestone(visibleStages, milestones);

  const milestoneViews: MilestoneView[] = groups.map(g => {
    const groupActions = g.stages.flatMap(s => s.actions);
    const done = groupActions.filter(a => completedIds.has(a.id)).length;
    const complete = g.stages.length > 0 && g.stages.every(isStageDone);
    return {
      milestone: g.milestone,
      startDay: g.startDay,
      schedule: getMilestoneSchedule(g.milestone, summary.entryDate, complete),
      done,
      total: groupActions.length,
      isCurrent: summary.currentMilestone?.id === g.milestone.id && !complete,
    };
  });

  const allActions = visibleStages.flatMap(s => s.actions);
  const doneCount = allActions.filter(a => completedIds.has(a.id)).length;
  const totalCount = allActions.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const finished = totalCount > 0 && doneCount === totalCount;

  const color = product?.color ?? '#7C3AED';
  const narrative = getNarrativePhase(pct, product?.name ?? '', firstName);
  const currentLevel = levelConfig.length > 0 ? getLevelFromConfig(xp, levelConfig) : null;

  // Etapas a mostrar según el tramo seleccionado (null = todas)
  const stagesToRender = selectedMilestoneId
    ? stages.filter(s => s.milestoneId === selectedMilestoneId)
    : stages;

  const renderStage = (stage: JourneyStage, i: number) => {
    if (stage.visible === false) return <ComingSoonTeaser key={stage.id} stage={stage} index={i} />;
    return (
      <StageCard
        key={stage.id}
        stage={stage}
        index={i}
        status={getStageStatus(stage)}
        schedule={getStageSchedule(stage, summary.entryDate, milestones, isStageDone(stage))}
        completedIds={completedIds}
        productId={productId}
        journeyId={journey.id}
        isTestMode={isTestMode}
        isExploring={isExploring}
        coursesMap={coursesMap}
        enrollmentsMap={enrollmentsMap}
        onMarkComplete={handleMarkComplete}
      />
    );
  };


  return (
    <div className="space-y-4 pb-24">

      {switcher}

      {isExploring && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 flex items-center gap-2">
          <Compass className="h-4 w-4 text-teal-600 shrink-0" />
          <p className="text-xs text-teal-800 flex-1 leading-snug">
            Estás <strong>explorando</strong> la ruta de {product?.name ?? 'otro producto'}. Tu progreso no se registra aquí.
          </p>
        </div>
      )}

      <JourneyHero
        color={color}
        narrative={narrative}
        summary={summary}
        doneCount={doneCount}
        totalCount={totalCount}
        pct={pct}
        finished={finished}
        xp={xp}
        badgeCount={badgeCount}
        currentLevel={currentLevel}
        milestoneViews={milestoneViews}
        isExploring={!!isExploring}
        productName={product?.name ?? ''}
      />

      <MilestoneTimeline
        views={milestoneViews}
        selectedId={selectedMilestoneId}
        onSelect={setSelectedMilestoneId}
      />

      {/* Etapas */}
      {stages.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
          <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Esta ruta aún no tiene etapas configuradas.</p>
        </div>
      ) : milestones.length > 0 && !selectedMilestoneId ? (
        // Agrupadas por tramo temporal
        <div className="space-y-5">
          {groups.map(g => {
            if (g.stages.length === 0) return null;
            const accent = g.milestone.color ?? '#8B5CF6';
            return (
              <div key={g.milestone.id} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-sm">{g.milestone.emoji ?? '🎯'}</span>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                    {g.milestone.label}
                  </p>
                  <span className="text-[10px] text-muted-foreground">día {g.startDay}–{g.milestone.dayOffset}</span>
                  <div className="h-px flex-1" style={{ backgroundColor: `${accent}33` }} />
                </div>
                <div className="space-y-3">
                  {g.stages.map(s => renderStage(s, stages.indexOf(s)))}
                </div>
              </div>
            );
          })}

          {unassigned.length > 0 && (
            <div className="space-y-2">
              {/* El encabezado sólo aporta si hay etapas repartidas en tramos */}
              {groups.some(g => g.stages.length > 0) && (
                <div className="flex items-center gap-2 px-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sin tramo asignado
                  </p>
                  <div className="h-px flex-1 bg-muted" />
                </div>
              )}
              <div className="space-y-3">
                {unassigned.map(s => renderStage(s, stages.indexOf(s)))}
              </div>
            </div>
          )}

          {/* Los teasers ocultos van al final */}
          <div className="space-y-3">
            {stages.filter(s => s.visible === false).map(s => renderStage(s, stages.indexOf(s)))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {stagesToRender.map(s => renderStage(s, stages.indexOf(s)))}
        </div>
      )}

      {/* "Up to date" banner — shown when all current steps are done */}
      {finished && !isExploring && (
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-5 text-center">
          <div className="text-4xl mb-2">✨</div>
          <h3 className="font-bold text-base text-emerald-800">¡Estás al corriente!</h3>
          <p className="text-emerald-700 text-sm mt-1 max-w-xs mx-auto leading-snug">
            Completaste todo el contenido disponible. Nuestro equipo prepara nuevos módulos — ¡vuelve pronto!
          </p>
          <Button size="sm" variant="outline" className="mt-3 border-emerald-300 text-emerald-700 hover:bg-emerald-50" asChild>
            <Link href="/perfil"><Medal className="h-4 w-4 mr-1" /> Ver mis insignias</Link>
          </Button>
        </div>
      )}

      {!isExploring && <PulseTodayCard userId={userId} />}

      <MiniLeaderboard productId={productId} currentUserName={profile.nombre ?? ''} />
    </div>
  );
}

// ─── Admin panel ──────────────────────────────────────────────────────────────

function AdminPanel({ name, onTestMode }: { name: string; onTestMode: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 p-6 text-center">
        <LayoutDashboard className="h-10 w-10 text-primary mx-auto mb-3" />
        <h2 className="font-semibold text-lg">Hola, {name}</h2>
        <p className="text-muted-foreground text-sm mt-1 mb-4">Gestiona la plataforma desde el panel de control.</p>
        <Button asChild>
          <Link href="/admin">Ir al panel de administración <ChevronRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </div>
      <button
        onClick={onTestMode}
        className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3 text-left hover:bg-amber-50 transition-colors"
      >
        <FlaskConical className="h-5 w-5 text-amber-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-700">Modo Prueba — Vista de vendedor</p>
          <p className="text-xs text-amber-600 mt-0.5">Simula la experiencia del recorrido de aprendizaje como si fueras un Jaguar Aviva.</p>
        </div>
        <ChevronRight className="h-4 w-4 text-amber-500 shrink-0" />
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function LMSDashboard() {
  const { user, profile, logout, refreshProfile } = useAuth();
  const searchParams = useSearchParams();
  const rutaParam = searchParams.get('ruta');
  const isAdmin = !!(profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol));
  const firstName = profile?.nombre?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'tú';

  // Test mode: admin simulating seller experience
  const [testMode, setTestMode] = useState(false);
  const [testProductId, setTestProductId] = useState<string>('');
  const [testStageId, setTestStageId] = useState<string | null>(null);
  const [journeyStages, setJourneyStages] = useState<{ id: string; title: string }[]>([]);
  const [availableProducts, setAvailableProducts] = useState<{ id: string; name: string; color: string }[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  // Incrementing this key forces JourneyDashboard to remount → clean test state
  const [testResetKey, setTestResetKey] = useState(0);

  // ── Rutas explorables (otros productos / trayectorias) ────────────────────
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [viewProductId, setViewProductId] = useState<string>('');

  const assignedProductId = profile?.producto || '';

  // El parámetro ?ruta=<productId> permite entrar directo a explorar otra ruta
  useEffect(() => { setViewProductId(rutaParam || assignedProductId); }, [rutaParam, assignedProductId]);

  useEffect(() => {
    if (!profile || isAdmin) return;
    let cancelled = false;
    Promise.all([getExplorableJourneys(), getProducts()])
      .then(([journeys, products]) => {
        if (cancelled) return;
        const byProduct = new Map(products.map(p => [p.id, p]));
        const options: RouteOption[] = journeys
          .map(j => {
            const p = byProduct.get(j.productId);
            if (!p) return null;
            return {
              productId: j.productId,
              productName: p.name,
              color: p.color ?? '#7C3AED',
              journeyName: j.name,
              stageCount: (j.stages ?? []).filter(s => s.visible !== false).length,
              isMine: j.productId === assignedProductId,
            } as RouteOption;
          })
          .filter((o): o is RouteOption => o !== null)
          // La ruta propia siempre primero
          .sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.productName.localeCompare(b.productName));

        // Hay productos duplicados en la base con el mismo nombre: para el
        // vendedor son indistinguibles, así que se muestra sólo uno (el suyo
        // si aplica, por el orden anterior).
        const seen = new Set<string>();
        setRouteOptions(options.filter(o => {
          const key = o.productName.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }));
      })
      .catch(() => setRouteOptions([]));
    return () => { cancelled = true; };
  }, [profile, isAdmin, assignedProductId]);

  const enterTestMode = async () => {
    const productId = profile?.producto;
    if (productId) {
      setTestProductId(productId);
      setTestResetKey(k => k + 1);
      setTestMode(true);
    } else {
      // Need to pick a product
      const prods = await getProducts();
      setAvailableProducts(prods.map(p => ({ id: p.id, name: p.name, color: p.color ?? '#7C3AED' })));
      setShowProductPicker(true);
    }
  };

  const exitTestMode = () => {
    setTestMode(false);
    setTestProductId('');
    setTestStageId(null);
    setJourneyStages([]);
  };

  const resetTestProgress = () => {
    setTestStageId(null);
    setTestResetKey(k => k + 1);
  };

  // Build a virtual seller profile for test mode
  const testProfile = profile && testMode && testProductId
    ? { ...profile, rol: 'seller' as const, producto: testProductId, onboardingCompleted: true }
    : null;

  const isExploring = !!viewProductId && !!assignedProductId && viewProductId !== assignedProductId;

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">

          {/* Header */}
          <header className="bg-accent text-accent-foreground border-b sticky top-0 z-20">
            <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/"><AvivaLogo className="h-8 w-auto" /></Link>
              <div className="flex items-center gap-1">
                {isAdmin && testMode && (
                  <button
                    onClick={exitTestMode}
                    className="flex items-center gap-1.5 text-xs bg-amber-400/20 text-amber-200 border border-amber-300/30 rounded-lg px-2.5 py-1.5 hover:bg-amber-400/30 transition-colors"
                  >
                    <FlaskConical className="h-3.5 w-3.5" /> Modo Prueba <X className="h-3 w-3" />
                  </button>
                )}
                {isAdmin && !testMode && (
                  <Link href="/admin">
                    <Button variant="outline" size="sm" className="bg-transparent text-accent-foreground border-accent-foreground/30 hover:bg-white/10 gap-1">
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

          {/* Test mode banner + module selector */}
          {testMode && (
            <div className="bg-amber-50 border-b border-amber-200">
              <div className="max-w-md mx-auto px-4 py-2 flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 flex-1">
                  <strong>Modo Prueba</strong> — Simula la vista del vendedor.
                </p>
                <button onClick={resetTestProgress} className="text-xs text-amber-600 hover:text-amber-800 underline shrink-0 mr-2">↺ Reiniciar</button>
                <button onClick={exitTestMode} className="text-xs text-amber-600 hover:text-amber-800 underline shrink-0">Salir</button>
              </div>
              {journeyStages.length > 0 && (
                <div className="max-w-md mx-auto px-3 pb-2">
                  <p className="text-[10px] text-amber-600 uppercase tracking-wide font-semibold mb-1.5 px-1">
                    Saltar a módulo:
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      onClick={() => setTestStageId(null)}
                      className={cn(
                        'shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors whitespace-nowrap',
                        testStageId === null
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                      )}
                    >
                      Ruta completa
                    </button>
                    {journeyStages.map((stage, i) => (
                      <button
                        key={stage.id}
                        onClick={() => setTestStageId(stage.id)}
                        className={cn(
                          'shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors whitespace-nowrap',
                          testStageId === stage.id
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                        )}
                      >
                        {i + 1}. {stage.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Product picker modal */}
          {showProductPicker && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-background rounded-2xl border shadow-xl w-full max-w-sm p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-5 w-5 text-amber-500" />
                  <h3 className="font-semibold">Selecciona un producto para probar</h3>
                </div>
                <p className="text-sm text-muted-foreground">Elige el producto cuya ruta de aprendizaje quieres simular.</p>
                <div className="space-y-2">
                  {availableProducts.map(p => (
                    <button
                      key={p.id}
                      className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => { setTestProductId(p.id); setShowProductPicker(false); setTestMode(true); }}
                    >
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="font-medium text-sm">{p.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                    </button>
                  ))}
                  {availableProducts.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No hay productos configurados.</p>
                  )}
                </div>
                <button
                  onClick={() => setShowProductPicker(false)}
                  className="w-full text-sm text-muted-foreground hover:text-foreground text-center py-1"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Main */}
          <main className="flex-grow">
            <div className="max-w-md mx-auto px-4 py-5">
              {(!isAdmin || testMode) && (
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h1 className="text-lg font-bold">Hola, {firstName} 👋</h1>
                </div>
              )}
              {isAdmin && !testMode ? (
                <AdminPanel name={firstName} onTestMode={enterTestMode} />
              ) : testProfile ? (
                <JourneyDashboard
                  key={testResetKey}
                  userId={testProfile.uid}
                  profile={testProfile}
                  productId={testProductId}
                  testStageId={testStageId}
                  isTestMode={true}
                  onStagesLoaded={setJourneyStages}
                />
              ) : profile && !isAdmin ? (
                <JourneyDashboard
                  userId={profile.uid}
                  profile={profile}
                  productId={viewProductId || assignedProductId}
                  isExploring={isExploring}
                  routeOptions={routeOptions}
                  onSelectRoute={setViewProductId}
                />
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

          <BottomNav isAdmin={isAdmin && !testMode} />
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}

// useSearchParams necesita un límite de Suspense para el prerender de Next.js
export default function LMSDashboardPage() {
  return (
    <Suspense fallback={null}>
      <LMSDashboard />
    </Suspense>
  );
}
