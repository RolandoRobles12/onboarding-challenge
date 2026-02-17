'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { AvivaLogo } from '@/components/AvivaLogo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getJourneyByProduct,
  getOnboardingFields,
  getProduct,
  getUserJourneyProgress,
  markJourneyStepComplete,
} from '@/lib/firestore-service';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/leaderboard';
import { getUserBadges } from '@/lib/firestore-service';
import type { Journey, UserJourneyProgress, JourneyStep, Product, OnboardingField } from '@/lib/types-scalable';
import {
  LogOut, ShieldCheck, CheckCircle2, Lock, ChevronRight, FileText,
  HelpCircle, BarChart2, Award, PlayCircle, AlertCircle, LayoutDashboard,
  Trophy, Star, BookOpen, Swords, Map, Medal, Target,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarComponent } from '@/lib/avatars';

// ─── Narrative (story) engine ─────────────────────────────────────────────────

interface NarrativePhase {
  chapter: number;
  phase: string;
  title: string;
  storyText: string;
  emoji: string;
}

function getNarrativePhase(pct: number, productName: string, firstName: string): NarrativePhase {
  if (pct === 0) return {
    chapter: 1, phase: 'El Primer Día',
    title: 'La aventura comienza',
    storyText: `${firstName} acaba de aceptar el desafío. Hoy comienza su camino hacia convertirse en Promotor ${productName} Certificado — y el equipo Aviva lo espera con el primer briefing.`,
    emoji: '🚀',
  };
  if (pct <= 25) return {
    chapter: 1, phase: 'Primeros Pasos',
    title: 'Aprendiendo los fundamentos',
    storyText: `${firstName} está dando sus primeros pasos. Los fundamentos son la base de todo gran promotor — cada lección superada es un paso más hacia la maestría.`,
    emoji: '🧭',
  };
  if (pct <= 50) return {
    chapter: 2, phase: 'En Entrenamiento',
    title: 'El agente se forja',
    storyText: `${firstName} avanza con determinación. Su entrenamiento está a la mitad y cada nueva habilidad lo acerca más a convertirse en un referente para sus clientes.`,
    emoji: '⚡',
  };
  if (pct <= 75) return {
    chapter: 3, phase: 'La Gran Prueba',
    title: 'Es hora de demostrar tu valor',
    storyText: `El momento de la verdad ha llegado para ${firstName}. Las evaluaciones más importantes esperan — aquí es donde los grandes promotores se distinguen del resto.`,
    emoji: '🎯',
  };
  if (pct < 100) return {
    chapter: 4, phase: 'La Recta Final',
    title: 'Casi en la cima',
    storyText: `${firstName} puede ver la meta. Solo quedan las últimas misiones entre él y el título de Promotor ${productName} Certificado. No te detengas ahora.`,
    emoji: '🏆',
  };
  return {
    chapter: 5, phase: 'Misión Cumplida',
    title: '¡Promotor Aviva Certificado!',
    storyText: `${firstName} ha completado su transformación. De aspirante a Promotor ${productName} Certificado — la historia de un vendedor que no se rindió.`,
    emoji: '🎖️',
  };
}

// ─── Step config ──────────────────────────────────────────────────────────────

const STEP_META: Record<string, {
  icon: React.ElementType;
  label: string;
  actionLabel: string;
  revisitLabel: string;
  href: (productId: string) => string;
  briefing: string;
  reward: string;
}> = {
  info_form: {
    icon: FileText, label: 'Registro',
    actionLabel: 'Ver mis datos', revisitLabel: 'Ver mis datos',
    href: () => '#',
    briefing: 'Completa tu perfil de promotor. Esta información personaliza tu experiencia de aprendizaje.',
    reward: '+50 XP',
  },
  quiz: {
    icon: HelpCircle, label: 'Evaluación',
    actionLabel: 'Comenzar evaluación', revisitLabel: 'Repetir evaluación',
    href: (id) => `/${id}/quiz?quizType=${id}`,
    briefing: 'Demuestra lo que has aprendido. Responde con calma y confianza — cada acierto suma puntos y experiencia.',
    reward: '+200 XP · Insignia',
  },
  challenge: {
    icon: Swords, label: 'Desafío',
    actionLabel: 'Aceptar desafío', revisitLabel: 'Repetir desafío',
    href: (id) => `/${id}/quiz?quizType=${id}`,
    briefing: 'Un desafío especial te espera. Pon tus habilidades a prueba bajo presión de tiempo real.',
    reward: '+300 XP · Trofeo',
  },
  course: {
    icon: BookOpen, label: 'Curso',
    actionLabel: 'Iniciar curso', revisitLabel: 'Revisar curso',
    href: (id) => `/courses/${id}`,
    briefing: 'Material cuidadosamente seleccionado para convertirte en experto del producto.',
    reward: '+150 XP',
  },
  results: {
    icon: BarChart2, label: 'Resultados',
    actionLabel: 'Ver resultados', revisitLabel: 'Ver resultados',
    href: (id) => `/${id}/results`,
    briefing: 'Consulta tu desempeño detallado y descubre en qué áreas puedes mejorar.',
    reward: 'Análisis completo',
  },
  certificate: {
    icon: Award, label: 'Certificado',
    actionLabel: 'Obtener certificado', revisitLabel: 'Ver certificado',
    href: (id) => `/${id}/certificate`,
    briefing: '¡Has llegado al final! Descarga tu certificado oficial Aviva y compártelo con orgullo.',
    reward: 'Certificado oficial',
  },
  badge: {
    icon: Medal, label: 'Insignia',
    actionLabel: 'Reclamar insignia', revisitLabel: 'Ver insignia',
    href: () => '/perfil',
    briefing: 'Has ganado el derecho a una insignia especial por tu esfuerzo y dedicación.',
    reward: 'Insignia exclusiva',
  },
};

// ─── Quest Map ────────────────────────────────────────────────────────────────

function QuestMap({
  steps, completedIds, currentIndex, productColor, onSelectStep, selectedStepId,
}: {
  steps: JourneyStep[];
  completedIds: Set<string>;
  currentIndex: number;
  productColor: string;
  onSelectStep: (step: JourneyStep) => void;
  selectedStepId: string | null;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-2">
      <div className="flex items-start min-w-max">
        {steps.map((step, idx) => {
          const done = completedIds.has(step.id);
          const current = idx === currentIndex;
          const locked = !done && !current;
          const meta = STEP_META[step.type] ?? STEP_META.quiz;
          const Icon = meta.icon;

          return (
            <div key={step.id} className="flex items-start">
              <div
                className="flex flex-col items-center cursor-pointer group w-[72px]"
                onClick={() => onSelectStep(step)}
              >
                <div className={cn(
                  'h-14 w-14 rounded-2xl flex items-center justify-center border-2 relative transition-all duration-200',
                  'group-hover:scale-105 group-hover:shadow-md',
                  done && 'bg-green-500 border-green-400 text-white',
                  current && 'text-white shadow-lg',
                  locked && 'bg-muted border-muted-foreground/20 text-muted-foreground/30',
                  selectedStepId === step.id && 'ring-2 ring-offset-2 ring-primary',
                )}
                  style={current ? { backgroundColor: productColor, borderColor: productColor } : {}}
                >
                  {done ? <CheckCircle2 className="h-6 w-6" />
                    : locked ? <Lock className="h-5 w-5" />
                    : <Icon className="h-6 w-6" />}
                  {current && (
                    <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-yellow-400 flex items-center justify-center shadow-sm">
                      <Star className="h-3 w-3 text-yellow-900 fill-yellow-900" />
                    </span>
                  )}
                </div>
                <p className={cn(
                  'text-[10px] font-semibold mt-2 text-center leading-tight px-0.5',
                  done && 'text-green-600',
                  current && 'text-foreground',
                  locked && 'text-muted-foreground/40',
                )}>
                  {step.title.length > 10 ? step.title.slice(0, 9) + '…' : step.title}
                </p>
                <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                  {done ? '✓' : meta.label}
                </p>
              </div>
              {idx < steps.length - 1 && (
                <div className={cn(
                  'h-0.5 w-6 mt-7 shrink-0 mx-0.5',
                  idx < currentIndex ? 'bg-green-400' : 'bg-muted-foreground/20',
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mission Briefing Sheet ───────────────────────────────────────────────────

function MissionBriefingSheet({
  step, status, productId, productColor, open, onClose, onMarkComplete, onViewData,
}: {
  step: JourneyStep | null;
  status: 'completed' | 'current' | 'upcoming';
  productId: string;
  productColor: string;
  open: boolean;
  onClose: () => void;
  onMarkComplete: (stepId: string) => void;
  onViewData: () => void;
}) {
  if (!step) return null;
  const meta = STEP_META[step.type] ?? STEP_META.quiz;
  const Icon = meta.icon;
  const done = status === 'completed';
  const active = status === 'current';
  const locked = status === 'upcoming';

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-sm flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: done ? '#22c55e' : locked ? '#94a3b8' : productColor }}>
              <Icon className="h-4 w-4" />
            </div>
            {step.title}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-6 space-y-5">
          <div className={cn(
            'rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 border',
            done && 'bg-green-50 text-green-700 border-green-200',
            active && 'bg-primary/10 text-primary border-primary/20',
            locked && 'bg-muted text-muted-foreground border-muted',
          )}>
            {done ? <CheckCircle2 className="h-4 w-4" />
              : locked ? <Lock className="h-4 w-4" />
              : <PlayCircle className="h-4 w-4" />}
            {done ? 'Misión completada' : active ? 'Misión activa — ¡es tu turno!' : 'Bloqueada'}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Briefing</p>
            <p className="text-sm leading-relaxed">{step.config?.description || meta.briefing}</p>
          </div>

          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <Star className="h-4 w-4 text-amber-500 fill-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Recompensa</p>
              <p className="text-sm text-amber-700">{meta.reward}</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t space-y-2">
          {done && step.type === 'info_form' && (
            <Button className="w-full gap-2" variant="outline" onClick={() => { onClose(); onViewData(); }}>
              <FileText className="h-4 w-4" /> Ver mis datos
            </Button>
          )}
          {done && step.type !== 'info_form' && (
            <Button className="w-full gap-2" variant="outline" asChild>
              <Link href={meta.href(productId)}><Icon className="h-4 w-4" /> {meta.revisitLabel}</Link>
            </Button>
          )}
          {active && step.type === 'info_form' && (
            <Button className="w-full gap-2" onClick={() => { onClose(); onMarkComplete(step.id); }}>
              <CheckCircle2 className="h-4 w-4" /> Marcar como completado
            </Button>
          )}
          {active && step.type !== 'info_form' && (
            <Button className="w-full gap-2 text-white" style={{ backgroundColor: productColor }} asChild>
              <Link href={meta.href(productId)}>{meta.actionLabel} <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          )}
          {locked && (
            <Button disabled className="w-full gap-2">
              <Lock className="h-4 w-4" /> Completa las misiones anteriores
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
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
            const Avatar = getAvatarComponent(entry.avatar);
            const isMe = entry.fullName?.toLowerCase() === currentUserName?.toLowerCase();
            const mins = Math.floor(entry.time / 60);
            const secs = entry.time % 60;
            return (
              <div key={entry.id} className={cn('flex items-center gap-3 px-4 py-2.5 text-sm', i === 0 && 'bg-yellow-50/60', isMe && 'bg-primary/5')}>
                <span className="w-5 shrink-0">{medals[i] ?? i + 1}</span>
                <Avatar className="h-7 w-7 text-muted-foreground shrink-0" />
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
  const [progress, setProgress] = useState<UserJourneyProgress | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [onboardingFields, setOnboardingFields] = useState<OnboardingField[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [showDataModal, setShowDataModal] = useState(false);
  const [selectedStep, setSelectedStep] = useState<JourneyStep | null>(null);

  const productId = profile.producto || '';
  const firstName = profile.nombre?.split(' ')[0] || 'Agente';

  useEffect(() => {
    if (!productId) { setLoading(false); return; }
    async function load() {
      try {
        const [foundProduct, foundJourney, fields, badges] = await Promise.all([
          getProduct(productId),
          getJourneyByProduct(productId),
          getOnboardingFields(),
          getUserBadges(userId).catch(() => []),
        ]);
        setProduct(foundProduct);
        setJourney(foundJourney);
        setOnboardingFields(fields);
        setBadgeCount((badges as unknown[]).length);
        if (foundJourney) {
          const prog = await getUserJourneyProgress(userId, foundJourney.id);
          setProgress(prog);
        }
      } catch { setLoadError(true); }
      finally { setLoading(false); }
    }
    load();
  }, [productId, userId]);

  const handleMarkComplete = async (stepId: string) => {
    if (!journey) return;
    await markJourneyStepComplete(userId, journey.id, productId, stepId);
    const updated = await getUserJourneyProgress(userId, journey.id);
    setProgress(updated);
    setSelectedStep(null);
  };

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );

  if (loadError) return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-destructive/30 py-12 text-center gap-3">
      <AlertCircle className="h-10 w-10 text-destructive/60" />
      <div>
        <p className="font-semibold">No se pudo cargar tu ruta</p>
        <p className="text-muted-foreground text-sm mt-1">Verifica tu conexión e intenta de nuevo.</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Recargar</Button>
    </div>
  );

  if (!productId) return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
      <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="font-semibold text-lg">Sin producto asignado</p>
      <p className="text-muted-foreground text-sm mt-1 max-w-xs">Tu administrador aún no te ha asignado un producto.</p>
    </div>
  );

  if (!journey) return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
      <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
      <p className="font-semibold text-lg">Ruta no configurada</p>
      <p className="text-muted-foreground text-sm mt-1 max-w-xs">
        Tu administrador aún no ha configurado la ruta para <strong>{product?.name ?? 'tu producto'}</strong>.
      </p>
    </div>
  );

  // ── Compute progress ──
  const completedIds = new Set(progress?.completedStepIds ?? []);
  const sorted = [...journey.steps].sort((a, b) => a.order - b.order);
  sorted.forEach(s => { if (s.type === 'info_form' && profile.onboardingCompleted) completedIds.add(s.id); });

  const doneCount = sorted.filter(s => completedIds.has(s.id)).length;
  const totalCount = sorted.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const finished = doneCount === totalCount;
  const currentIdx = sorted.findIndex(s => !completedIds.has(s.id));
  const currentStep = currentIdx >= 0 ? sorted[currentIdx] : null;
  const color = product?.color ?? '#7C3AED';
  const narrative = getNarrativePhase(pct, product?.name ?? '', firstName);

  const selectedStatus = selectedStep
    ? completedIds.has(selectedStep.id) ? 'completed'
      : sorted.indexOf(selectedStep) === currentIdx ? 'current' : 'upcoming'
    : 'upcoming';

  return (
    <div className="space-y-5">

      {/* ── Chapter / Story Banner ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}f0, ${color}99)` }}>
        {/* Chapter label */}
        <div className="px-5 pt-4 pb-0 flex items-center gap-2">
          <span className="text-white/50 text-[10px] font-mono uppercase tracking-[0.2em]">
            Capítulo {narrative.chapter}
          </span>
          <div className="h-px flex-1 bg-white/20" />
          <Badge className="bg-white/20 text-white border-white/30 text-[10px]">{narrative.phase}</Badge>
        </div>

        <div className="px-5 pt-3 pb-5 relative overflow-hidden">
          {/* Decorative blobs */}
          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-15 bg-white pointer-events-none" />
          <div className="absolute right-2 -bottom-6 h-20 w-20 rounded-full opacity-10 bg-white pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{narrative.emoji}</span>
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">{narrative.title}</h2>
              </div>
            </div>

            {/* Story text — third person narrative */}
            <p className="text-white/80 text-sm leading-relaxed italic border-l-2 border-white/30 pl-3">
              "{narrative.storyText}"
            </p>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex justify-between text-white/70 text-xs mb-1.5">
                <span>Progreso de la ruta</span>
                <span className="font-semibold text-white">{finished ? '¡Completado!' : `${doneCount}/${totalCount} misiones`}</span>
              </div>
              <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-white/50 text-[11px] mt-1">{pct}% completado</p>
            </div>
          </div>
        </div>

        {/* Inline stats strip */}
        <div className="bg-black/15 px-5 py-2.5 flex items-center gap-4 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-white/80">
            <Medal className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-xs font-medium">{badgeCount} insignia{badgeCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="h-4 w-px bg-white/20" />
          <div className="flex items-center gap-1.5 text-white/80">
            <Star className="h-3.5 w-3.5 text-yellow-300 fill-yellow-300" />
            <span className="text-xs font-medium">Nivel {Math.max(1, Math.ceil(pct / 20))}</span>
          </div>
          <div className="h-4 w-px bg-white/20" />
          <Link href="/perfil" className="ml-auto text-white/70 text-xs hover:text-white transition-colors flex items-center gap-1">
            Ver perfil completo <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* ── Quest Map ── */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Map className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Mapa de misiones</span>
          <span className="text-xs text-muted-foreground ml-auto hidden sm:block">Toca un nodo para ver el briefing</span>
        </div>
        <QuestMap
          steps={sorted}
          completedIds={completedIds}
          currentIndex={currentIdx}
          productColor={color}
          onSelectStep={setSelectedStep}
          selectedStepId={selectedStep?.id ?? null}
        />
      </div>

      {/* ── Active Mission ── */}
      {currentStep && !finished && (() => {
        const meta = STEP_META[currentStep.type] ?? STEP_META.quiz;
        const Icon = meta.icon;
        return (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: `${color}44` }}>
            {/* Color bar */}
            <div className="h-1 w-full" style={{ backgroundColor: color }} />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: color }}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Misión activa</span>
                    <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                  </div>
                  <h3 className="font-bold text-foreground leading-snug">{currentStep.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-snug line-clamp-2">
                    {currentStep.config?.description || meta.briefing}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4">
                {currentStep.type === 'info_form' ? (
                  <>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowDataModal(true)}>
                      <FileText className="h-3.5 w-3.5" /> Ver mis datos
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => handleMarkComplete(currentStep.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Marcar completado
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="gap-1.5 text-white" style={{ backgroundColor: color }} asChild>
                    <Link href={meta.href(productId)}>{meta.actionLabel} <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground ml-auto" onClick={() => setSelectedStep(currentStep)}>
                  <Target className="h-3.5 w-3.5" /> Briefing
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Finished ── */}
      {finished && (
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 p-6 text-center">
          <div className="text-5xl mb-3">🎖️</div>
          <h3 className="font-bold text-xl text-amber-800">¡Ruta completada!</h3>
          <p className="text-amber-700 text-sm mt-1.5 max-w-xs mx-auto">
            Has completado toda la capacitación. Eres un Promotor Aviva certificado.
          </p>
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

      {/* ── Mini Leaderboard ── */}
      <MiniLeaderboard productId={productId} currentUserName={profile.nombre ?? ''} />

      {/* ── Mission Briefing Sheet ── */}
      <MissionBriefingSheet
        step={selectedStep}
        status={selectedStatus}
        productId={productId}
        productColor={color}
        open={!!selectedStep}
        onClose={() => setSelectedStep(null)}
        onMarkComplete={handleMarkComplete}
        onViewData={() => setShowDataModal(true)}
      />

      {/* ── Data modal ── */}
      <Dialog open={showDataModal} onOpenChange={setShowDataModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Mis datos</DialogTitle>
          </DialogHeader>
          {profile.onboardingData && Object.keys(profile.onboardingData).length > 0 ? (
            <div className="space-y-3 mt-2">
              {onboardingFields.length > 0
                ? onboardingFields.map(f => {
                    const v = profile.onboardingData?.[f.fieldKey];
                    if (!v) return null;
                    return (
                      <div key={f.id}>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{f.label}</p>
                        <p className="text-sm font-medium mt-0.5">{v}</p>
                      </div>
                    );
                  })
                : Object.entries(profile.onboardingData).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{k.replace(/_/g, ' ')}</p>
                      <p className="text-sm font-medium mt-0.5">{v as string}</p>
                    </div>
                  ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">Aún no hay datos registrados.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Admin panel ──────────────────────────────────────────────────────────────

function AdminPanel({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 p-6 text-center">
      <LayoutDashboard className="h-10 w-10 text-primary mx-auto mb-3" />
      <h2 className="font-semibold text-lg">Hola, {name}</h2>
      <p className="text-muted-foreground text-sm mt-1 mb-4">
        Gestiona la plataforma desde el panel de control.
      </p>
      <Button asChild>
        <Link href="/admin">Ir al panel de administración <ChevronRight className="ml-1 h-4 w-4" /></Link>
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LMSDashboard() {
  const { user, profile, logout, refreshProfile } = useAuth();
  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);
  const firstName = profile?.nombre?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'tú';

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">

          {/* ── Header ── */}
          <header className="bg-accent text-accent-foreground border-b sticky top-0 z-20">
            <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/"><AvivaLogo className="h-8 w-auto" /></Link>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Link href="/admin">
                    <Button variant="outline" size="sm" className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 gap-1 hidden sm:flex">
                      <ShieldCheck className="h-3.5 w-3.5" /> Admin
                    </Button>
                  </Link>
                )}
                {!isAdmin && user && (
                  <Link href="/perfil">
                    <Button variant="ghost" size="sm" className="text-accent-foreground hover:bg-white/10 gap-1">
                      <Medal className="h-4 w-4" />
                      <span className="hidden sm:inline">Mis insignias</span>
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

          {/* ── Main ── */}
          <main className="flex-grow">
            <div className="max-w-2xl mx-auto px-4 py-6">
              <div className="mb-5">
                <h1 className="text-2xl font-bold">Hola, {firstName} 👋</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {isAdmin ? 'Panel de administración.' : 'Aquí está tu journey de aprendizaje.'}
                </p>
              </div>

              {isAdmin ? (
                <AdminPanel name={firstName} />
              ) : profile ? (
                <JourneyDashboard userId={profile.uid} profile={profile} />
              ) : user ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center gap-3">
                  <AlertCircle className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">No se pudo cargar tu perfil</p>
                    <p className="text-muted-foreground text-sm mt-1">Intenta recargar tu sesión.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refreshProfile()}>Recargar perfil</Button>
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

          <footer className="py-4 px-4 text-center text-xs text-muted-foreground border-t">
            &copy; {new Date().getFullYear()} Aviva. Todos los derechos reservados.
          </footer>
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
