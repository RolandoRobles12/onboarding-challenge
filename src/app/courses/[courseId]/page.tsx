'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import {
  getCourse,
  getUserEnrollments,
  enrollUserInCourse,
  updateEnrollmentProgress,
} from '@/lib/firestore-service';
import type { Course, Lesson, CourseEnrollment } from '@/lib/types-lms';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Lock,
  Play,
  FileText,
  Headphones,
  Globe,
  BookOpen,
  LogOut,
  Menu,
  X,
  AlertCircle,
  Video,
  Paperclip,
  Download,
  CheckCheck,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

// ─── Lesson type icon ────────────────────────────────────────────────────────

function LessonIcon({ type, className }: { type: Lesson['type']; className?: string }) {
  const cls = cn('h-3.5 w-3.5 shrink-0', className);
  switch (type) {
    case 'video':    return <Video className={cls} />;
    case 'audio':    return <Headphones className={cls} />;
    case 'html':     return <FileText className={cls} />;
    case 'embedded': return <Globe className={cls} />;
    case 'slides':   return <BookOpen className={cls} />;
    case 'document': return <Paperclip className={cls} />;
    default:         return <FileText className={cls} />;
  }
}

// ─── Timer auto-complete (for iframes / documents) ───────────────────────────

function TimerAutoComplete({
  seconds,
  isCompleted,
  onComplete,
}: {
  seconds: number;
  isCompleted: boolean;
  onComplete: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    // Reset timer when seconds changes (new lesson loaded)
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (isCompleted || remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          onComplete();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isCompleted, remaining, onComplete]);

  if (isCompleted) return null;

  const pct = Math.round(((seconds - remaining) / seconds) * 100);

  return (
    <div className="mt-4 rounded-xl border bg-muted/30 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Completando lección…
        </span>
        <span className="font-mono font-semibold">
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({
  course,
  selectedLessonId,
  completedLessonIds,
  navigation,
  onSelect,
}: {
  course: Course;
  selectedLessonId: string | null;
  completedLessonIds: Set<string>;
  navigation: Course['navigation'];
  onSelect: (lesson: Lesson) => void;
}) {
  const allLessons = course.modules.flatMap(m => m.lessons);

  const isLessonUnlocked = (moduleIdx: number, lessonIdx: number) => {
    if (navigation === 'free') return true;
    const flatIdx = course.modules
      .slice(0, moduleIdx)
      .reduce((sum, m) => sum + m.lessons.length, 0) + lessonIdx;
    if (flatIdx === 0) return true;
    const prev = allLessons[flatIdx - 1];
    return completedLessonIds.has(prev.id);
  };

  return (
    <nav className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 py-3 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contenido</p>
        <div className="mt-1.5">
          <Progress
            value={allLessons.length > 0 ? Math.round((completedLessonIds.size / allLessons.length) * 100) : 0}
            className="h-1.5"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {completedLessonIds.size}/{allLessons.length} lecciones
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {course.modules.map((mod, modIdx) => {
          const modDone = mod.lessons.every(l => completedLessonIds.has(l.id));
          return (
            <div key={mod.id} className="mb-1">
              <div className="flex items-center gap-2 px-4 py-2">
                <div className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center shrink-0',
                  modDone ? 'bg-green-500' : 'bg-muted',
                )}>
                  {modDone
                    ? <CheckCircle2 className="h-3 w-3 text-white" />
                    : <span className="text-[9px] font-bold text-muted-foreground">{modIdx + 1}</span>}
                </div>
                <p className="text-xs font-semibold truncate">{mod.title}</p>
              </div>

              {mod.lessons.map((lesson, lessonIdx) => {
                const done = completedLessonIds.has(lesson.id);
                const active = lesson.id === selectedLessonId;
                const unlocked = isLessonUnlocked(modIdx, lessonIdx);

                return (
                  <button
                    key={lesson.id}
                    disabled={!unlocked}
                    onClick={() => unlocked && onSelect(lesson)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-4 py-2 pl-9 text-left text-xs transition-colors',
                      active && 'bg-primary/10 text-primary font-medium',
                      !active && unlocked && 'hover:bg-muted/50',
                      !unlocked && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <div className="shrink-0">
                      {done
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        : !unlocked
                          ? <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          : active
                            ? <Play className="h-3.5 w-3.5 text-primary" />
                            : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <LessonIcon type={lesson.type} className="text-muted-foreground" />
                    <span className="flex-1 truncate">{lesson.title}</span>
                    {lesson.estimatedDuration && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{lesson.estimatedDuration}m</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Lesson content renderer ──────────────────────────────────────────────────

function LessonViewer({
  lesson,
  isCompleted,
  onComplete,
}: {
  lesson: Lesson;
  isCompleted: boolean;
  onComplete: () => void;
}) {
  const { content } = lesson;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // HTML: auto-complete when the user scrolls to the bottom (sentinel visible)
  useEffect(() => {
    if (lesson.type !== 'html' || isCompleted || !sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onComplete(); },
      { threshold: 0.8 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [lesson.type, lesson.id, isCompleted, onComplete]);

  // Timer duration in seconds for iframe-based content
  const timerSeconds = (lesson.estimatedDuration ?? 1) * 60;

  // Responsive iframe height: smaller on mobile to leave room for header + bottom nav
  const iframeStyle = { height: isMobile ? 'min(55dvh, 400px)' : 'min(72dvh, 640px)' };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Lesson header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <LessonIcon type={lesson.type} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground capitalize">{lesson.type}</span>
          {lesson.estimatedDuration && (
            <span className="text-xs text-muted-foreground">· {lesson.estimatedDuration} min</span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completada
            </span>
          )}
        </div>
        <h2 className="text-lg sm:text-xl font-bold leading-snug">{lesson.title}</h2>
        {lesson.description && (
          <p className="text-muted-foreground text-sm mt-1">{lesson.description}</p>
        )}
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">

        {/* VIDEO — auto-complete on ended */}
        {lesson.type === 'video' && content.videoUrl && (
          <div className="rounded-xl overflow-hidden bg-black aspect-video w-full">
            <video
              key={lesson.id}
              className="w-full h-full"
              controls
              playsInline
              src={content.videoUrl}
              onEnded={() => { if (!isCompleted) onComplete(); }}
            />
          </div>
        )}

        {/* AUDIO — auto-complete on ended */}
        {lesson.type === 'audio' && content.audioUrl && (
          <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-background to-primary/[0.03] p-6 sm:p-8 flex flex-col items-center gap-5">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Headphones className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">Escucha el audio para continuar</p>
            <audio
              key={lesson.id}
              controls
              className="w-full max-w-md"
              src={content.audioUrl}
              onEnded={() => { if (!isCompleted) onComplete(); }}
            />
          </div>
        )}

        {/* HTML — auto-complete when sentinel scrolled into view */}
        {lesson.type === 'html' && content.htmlContent && (
          <>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: content.htmlContent }}
            />
            {/* Sentinel: lesson completes when user scrolls here */}
            <div ref={sentinelRef} className="h-1" />
          </>
        )}

        {/* EMBEDDED — auto-complete via timer */}
        {lesson.type === 'embedded' && content.embedUrl && (
          <>
            <div className="rounded-xl overflow-hidden border w-full" style={iframeStyle}>
              <iframe
                key={lesson.id}
                src={content.embedUrl}
                className="w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                title={lesson.title}
              />
            </div>
            <TimerAutoComplete
              key={lesson.id}
              seconds={timerSeconds}
              isCompleted={isCompleted}
              onComplete={onComplete}
            />
          </>
        )}

        {/* SLIDES — auto-complete via timer */}
        {lesson.type === 'slides' && content.slidesUrl && (
          <>
            <div className="rounded-xl overflow-hidden border w-full" style={iframeStyle}>
              <iframe
                key={lesson.id}
                src={content.slidesUrl}
                className="w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                title={lesson.title}
              />
            </div>
            <TimerAutoComplete
              key={lesson.id}
              seconds={timerSeconds}
              isCompleted={isCompleted}
              onComplete={onComplete}
            />
          </>
        )}

        {/* DOCUMENT — smart viewer: inline PDF on desktop, card CTA everywhere else */}
        {lesson.type === 'document' && content.documentUrl && (() => {
          const rawUrl = content.documentUrl;
          const pathExt = rawUrl.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
          const docType = content.documentType ?? pathExt;
          const isPdf = docType === 'pdf';
          // Desktop browsers render PDFs natively in iframes; mobile ones don't
          const canPreviewInline = isPdf && !isMobile;

          const fileInfo: Record<string, { label: string; action: string }> = {
            pdf:  { label: 'PDF',        action: 'Leer documento' },
            doc:  { label: 'Word',       action: 'Abrir documento' },
            docx: { label: 'Word',       action: 'Abrir documento' },
            ppt:  { label: 'PowerPoint', action: 'Ver presentación' },
            pptx: { label: 'PowerPoint', action: 'Ver presentación' },
            xls:  { label: 'Excel',      action: 'Ver hoja de cálculo' },
            xlsx: { label: 'Excel',      action: 'Ver hoja de cálculo' },
          };
          const info = fileInfo[docType] ?? { label: docType.toUpperCase(), action: 'Abrir documento' };

          return (
            <>
              {canPreviewInline ? (
                <>
                  {/* Desktop PDF: native browser renderer works perfectly */}
                  <div className="rounded-xl overflow-hidden border w-full" style={iframeStyle}>
                    <iframe
                      key={lesson.id}
                      src={rawUrl}
                      className="w-full h-full"
                      title={lesson.title}
                    />
                  </div>
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Download className="h-4 w-4" />
                    Descargar documento
                  </a>
                </>
              ) : (
                /* Mobile or non-PDF: beautiful card with prominent CTA */
                <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-background to-primary/[0.03] p-6 sm:p-10 flex flex-col items-center text-center gap-5">
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-bold text-base sm:text-lg leading-snug">{lesson.title}</p>
                    <p className="text-sm text-muted-foreground">Documento {info.label}</p>
                  </div>
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 rounded-xl bg-primary text-primary-foreground px-6 py-3.5 text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.97] transition-all"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {info.action}
                  </a>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Se abrirá en una nueva pestaña donde podrás verlo cómodamente
                  </p>
                </div>
              )}

              <TimerAutoComplete
                key={lesson.id}
                seconds={timerSeconds}
                isCompleted={isCompleted}
                onComplete={onComplete}
              />
            </>
          );
        })()}

        {/* SCORM — auto-complete via timer */}
        {lesson.type === 'scorm' && content.scormPackageUrl && (
          <>
            <div className="rounded-xl overflow-hidden border w-full" style={iframeStyle}>
              <iframe
                key={lesson.id}
                src={content.scormPackageUrl}
                className="w-full h-full"
                title={lesson.title}
              />
            </div>
            <TimerAutoComplete
              key={lesson.id}
              seconds={timerSeconds}
              isCompleted={isCompleted}
              onComplete={onComplete}
            />
          </>
        )}

        {/* Attachments */}
        {content.attachments && content.attachments.length > 0 && (
          <div className="border-t pt-4 mt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Recursos adicionales</p>
            <div className="space-y-2">
              {content.attachments.map((att, i) => (
                <a
                  key={i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  {att.name}
                  {att.sizeKb && (
                    <span className="text-xs text-muted-foreground">
                      ({Math.round(att.sizeKb / 1024 * 10) / 10} MB)
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params?.courseId as string;
  const { user, profile, logout } = useAuth();
  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);

  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<CourseEnrollment | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [completedModuleIds, setCompletedModuleIds] = useState<Set<string>>(new Set());
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Tracks the in-flight Firestore write so Finalizar can await it
  const savePromiseRef = useRef<Promise<void>>(Promise.resolve());

  // Load course + enrollment
  const load = useCallback(async () => {
    if (!courseId || !profile) return;
    try {
      const [data, enrollments] = await Promise.all([
        getCourse(courseId),
        getUserEnrollments(profile.uid).catch(() => []),
      ]);
      if (!data) { setNotFound(true); return; }
      // Un curso no publicado no debe quedar accesible ni inscribible para el
      // vendedor solo por conocer la URL — los admins sí pueden previsualizarlo.
      if (data.status !== 'published' && !isAdmin) { setUnavailable(true); return; }
      setCourse(data);

      let enr = enrollments.find(e => e.courseId === courseId) ?? null;
      if (!enr) {
        const enrolledAt = new Date() as unknown as import('firebase/firestore').Timestamp;
        const id = await enrollUserInCourse({
          userId: profile.uid,
          courseId,
          organizationId: 'aviva-credito',
          status: 'enrolled',
          completedLessonIds: [],
          completedModuleIds: [],
          assignedAt: enrolledAt,
          enrolledAt: enrolledAt,
        });
        enr = {
          id,
          userId: profile.uid,
          courseId,
          organizationId: 'aviva-credito',
          status: 'enrolled',
          completedLessonIds: [],
          completedModuleIds: [],
          assignedAt: enrolledAt,
          enrolledAt: enrolledAt,
          updatedAt: enrolledAt,
        };
      }
      // Si venimos de una evaluación de lección/módulo, registrar el mejor
      // puntaje obtenido — es lo que Course.passingScore evalúa.
      const assessmentScoreParam = searchParams?.get('assessmentScore');
      if (assessmentScoreParam) {
        const newScore = parseInt(assessmentScoreParam, 10);
        if (!Number.isNaN(newScore)) {
          const bestScore = Math.max(enr.overallScore ?? 0, newScore);
          if (bestScore !== enr.overallScore) {
            await updateEnrollmentProgress(enr.id, { overallScore: bestScore }).catch(console.error);
            enr = { ...enr, overallScore: bestScore };
          }
        }
      }

      setEnrollment(enr);
      setCompletedLessonIds(new Set(enr.completedLessonIds));
      setCompletedModuleIds(new Set(enr.completedModuleIds));

      const allLessons = data.modules.flatMap(m => m.lessons);
      const lessonParam = searchParams?.get('lesson');
      const targetLesson = lessonParam ? allLessons.find(l => l.id === lessonParam) : null;
      const firstIncomplete = allLessons.find(l => !enr!.completedLessonIds.includes(l.id));
      setSelectedLesson(targetLesson ?? firstIncomplete ?? allLessons[0] ?? null);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [courseId, profile, searchParams, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const allLessons = course?.modules.flatMap(m => m.lessons) ?? [];
  const currentIdx = selectedLesson ? allLessons.findIndex(l => l.id === selectedLesson.id) : -1;
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;
  const isDone = selectedLesson ? completedLessonIds.has(selectedLesson.id) : false;

  // Builds the quiz URL when the current lesson has an assessmentQuizId configured
  const getAssessmentUrl = (returnTo: string): string | null => {
    if (!selectedLesson?.assessmentQuizId || !profile?.producto) return null;
    const params = new URLSearchParams({
      quizId: selectedLesson.assessmentQuizId,
      returnTo,
    });
    return `/${profile.producto}/quiz?${params.toString()}`;
  };

  // Builds the quiz URL when finishing the current lesson also finishes the
  // module it belongs to and that module has its own assessmentQuizId.
  const getModuleAssessmentUrl = (returnTo: string): string | null => {
    if (!course || !selectedLesson || !profile?.producto) return null;
    const mod = course.modules.find(m => m.lessons.some(l => l.id === selectedLesson.id));
    if (!mod?.assessmentQuizId || completedModuleIds.has(mod.id)) return null;
    const allDone = mod.lessons.every(l => completedLessonIds.has(l.id) || l.id === selectedLesson.id);
    if (!allDone) return null;
    const params = new URLSearchParams({ quizId: mod.assessmentQuizId, returnTo });
    return `/${profile.producto}/quiz?${params.toString()}`;
  };

  const pct = allLessons.length > 0
    ? Math.round((completedLessonIds.size / allLessons.length) * 100)
    : 0;

  // Called automatically by LessonViewer when the content triggers completion
  const handleAutoComplete = useCallback(async () => {
    if (!enrollment || !selectedLesson || !course) return;
    if (completedLessonIds.has(selectedLesson.id)) return; // already done

    const newLessonIds = [...completedLessonIds, selectedLesson.id];
    const mod = course.modules.find(m => m.lessons.some(l => l.id === selectedLesson.id));
    const newModuleIds = [...completedModuleIds];
    if (mod && mod.lessons.every(l => newLessonIds.includes(l.id))) {
      newModuleIds.push(mod.id);
    }
    const allComplete = newLessonIds.length === allLessons.length;

    // Update state immediately for snappy UI
    setCompletedLessonIds(new Set(newLessonIds));
    setCompletedModuleIds(new Set(newModuleIds));

    // Persist to Firestore — store promise so Finalizar can await before navigating
    savePromiseRef.current = updateEnrollmentProgress(enrollment.id, {
      completedLessonIds: newLessonIds,
      completedModuleIds: newModuleIds,
      status: allComplete ? 'completed' : 'in_progress',
      ...(allComplete ? { completedAt: new Date() as unknown as import('firebase/firestore').Timestamp } : {}),
    }).catch(console.error);
  }, [enrollment, selectedLesson, course, completedLessonIds, completedModuleIds, allLessons.length]);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col h-dvh bg-background overflow-hidden">
          {/* Top bar */}
          <header className="bg-accent text-accent-foreground border-b shrink-0 z-20">
            <div className="flex items-center gap-3 px-4 h-14">
              <button
                className="text-accent-foreground/70 hover:text-accent-foreground lg:hidden flex items-center gap-1.5 shrink-0"
                onClick={() => setSidebarOpen(o => !o)}
                aria-label="Abrir contenido del curso"
              >
                <Menu className="h-5 w-5" />
                {!loading && course && (
                  <span className="text-[10px] font-semibold bg-white/20 rounded px-1 hidden sm:inline">
                    {completedLessonIds.size}/{allLessons.length}
                  </span>
                )}
              </button>

              <Link href="/" aria-label="Volver al inicio">
                <AvivaLogo className="h-7 w-auto" />
              </Link>

              <div className="flex items-center gap-1.5 text-accent-foreground/60 text-sm">
                <ChevronRight className="h-3.5 w-3.5" />
                <Link href="/" className="hover:text-accent-foreground transition-colors">Inicio</Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="truncate max-w-[160px] text-accent-foreground font-medium">
                  {course?.title ?? '…'}
                </span>
              </div>

              <div className="ml-auto flex items-center gap-3">
                {!loading && course && (
                  <div className="hidden sm:flex items-center gap-2">
                    <Progress value={pct} className="w-24 h-1.5" />
                    <span className="text-xs text-accent-foreground/70">{pct}%</span>
                  </div>
                )}
                {isAdmin && (
                  <Link href="/admin/courses">
                    <Button variant="outline" size="sm"
                      className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 hidden sm:flex">
                      Gestionar
                    </Button>
                  </Link>
                )}
                {user && (
                  <Button variant="ghost" size="sm" onClick={logout}
                    className="text-accent-foreground hover:bg-white/10">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Salir</span>
                  </Button>
                )}
              </div>
            </div>
          </header>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="space-y-3 w-full max-w-md">
                <Skeleton className="h-6 w-3/4 rounded-xl" />
                <Skeleton className="h-4 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
              </div>
            </div>
          ) : notFound ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <p className="font-semibold text-lg">Curso no encontrado</p>
              <p className="text-muted-foreground text-sm max-w-xs">
                Este curso no existe o fue eliminado.
              </p>
              <Button asChild variant="outline">
                <Link href="/"><ChevronLeft className="mr-2 h-4 w-4" />Volver al inicio</Link>
              </Button>
            </div>
          ) : unavailable ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <p className="font-semibold text-lg">Este curso aún no está disponible</p>
              <p className="text-muted-foreground text-sm max-w-xs">
                Todavía no ha sido publicado por tu equipo de capacitación.
              </p>
              <Button asChild variant="outline">
                <Link href="/"><ChevronLeft className="mr-2 h-4 w-4" />Volver al inicio</Link>
              </Button>
            </div>
          ) : course ? (
            <div className="flex flex-1 overflow-hidden relative">

              {/* Mobile backdrop */}
              {sidebarOpen && (
                <div
                  className="fixed inset-0 z-20 bg-black/40 lg:hidden"
                  onClick={() => setSidebarOpen(false)}
                />
              )}

              {/* Sidebar — overlay on mobile, inline on desktop */}
              <aside className={cn(
                'bg-card flex flex-col overflow-hidden border-r',
                // Mobile: fixed overlay
                'fixed inset-y-0 left-0 z-30 w-[min(288px,85vw)] transition-transform duration-200',
                sidebarOpen ? 'translate-x-0' : '-translate-x-full',
                // Desktop: always visible, part of flex layout
                'lg:relative lg:z-auto lg:translate-x-0 lg:w-72 lg:shrink-0',
              )}>
                <div className="px-4 py-3 border-b flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="font-bold text-sm leading-snug line-clamp-2">{course.title}</h1>
                    {course.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{course.description}</p>
                    )}
                  </div>
                  <button
                    className="shrink-0 lg:hidden text-muted-foreground hover:text-foreground mt-0.5"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Sidebar
                  course={course}
                  selectedLessonId={selectedLesson?.id ?? null}
                  completedLessonIds={completedLessonIds}
                  navigation={course.navigation}
                  onSelect={(lesson) => {
                    setSelectedLesson(lesson);
                    setSidebarOpen(false);
                  }}
                />
              </aside>

              {/* Main content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedLesson ? (
                  <>
                    <div className="flex-1 overflow-y-auto">
                      {/* key resets all internal state (timers, observers) when lesson changes */}
                      <LessonViewer
                        key={selectedLesson.id}
                        lesson={selectedLesson}
                        isCompleted={isDone}
                        onComplete={handleAutoComplete}
                      />
                    </div>

                    {/* Bottom nav — mobile-optimized with safe area padding */}
                    <div className="shrink-0 border-t bg-card px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!prevLesson}
                        onClick={() => prevLesson && setSelectedLesson(prevLesson)}
                        className="gap-1 h-11 px-3 sm:px-4 text-xs sm:text-sm"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden xs:inline">Anterior</span>
                      </Button>

                      {/* Center: progress + open sidebar on mobile */}
                      <div className="flex-1 flex flex-col items-center gap-0.5">
                        {isDone ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                            <CheckCheck className="h-3.5 w-3.5" /> Completada
                          </span>
                        ) : course.navigation === 'sequential' ? (
                          <span className="text-xs text-amber-600 font-medium text-center leading-tight">
                            Termina el contenido para continuar
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground font-medium">
                            {currentIdx + 1} / {allLessons.length}
                          </span>
                        )}
                        <button
                          onClick={() => setSidebarOpen(true)}
                          className="lg:hidden text-[10px] text-primary font-medium underline underline-offset-2"
                        >
                          Ver lecciones
                        </button>
                      </div>

                      {nextLesson ? (
                        <Button
                          size="sm"
                          disabled={course.navigation === 'sequential' && !isDone}
                          onClick={async () => {
                            // La lección solo se marca completada por sus propios
                            // disparadores de contenido (ver LessonViewer) — este
                            // botón nunca fuerza el auto-completado.
                            if (course.navigation === 'sequential' && !isDone) return;
                            const returnTo = `/courses/${courseId}?lesson=${nextLesson.id}`;
                            const quizUrl = getAssessmentUrl(returnTo) ?? getModuleAssessmentUrl(returnTo);
                            if (quizUrl) {
                              await savePromiseRef.current;
                              router.push(quizUrl);
                            } else {
                              setSelectedLesson(nextLesson);
                            }
                          }}
                          className="gap-1 h-11 px-3 sm:px-4 text-xs sm:text-sm"
                        >
                          <span className="hidden xs:inline">Siguiente</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={isDone ? 'outline' : 'default'}
                          disabled={course.navigation === 'sequential' && !isDone}
                          className="gap-1 h-11 px-3 sm:px-4 text-xs sm:text-sm"
                          onClick={async () => {
                            if (course.navigation === 'sequential' && !isDone) return;
                            const quizUrl = getAssessmentUrl('/') ?? getModuleAssessmentUrl('/');
                            if (quizUrl) {
                              await savePromiseRef.current;
                              router.push(quizUrl);
                            } else {
                              await savePromiseRef.current;
                              router.push('/');
                            }
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="hidden xs:inline">Finalizar</span>
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                    {pct === 100 ? (
                      <>
                        <div className="text-5xl">🎖️</div>
                        <h2 className="text-2xl font-bold">¡Curso completado!</h2>
                        <p className="text-muted-foreground max-w-sm">
                          Has terminado todos los módulos de <strong>{course.title}</strong>.
                        </p>
                        <Badge className="bg-green-100 text-green-800 border-green-200 text-sm px-3 py-1">
                          <CheckCircle2 className="h-4 w-4 mr-1" /> {completedLessonIds.size} lecciones completadas
                        </Badge>
                        {enrollment?.overallScore != null && course.passingScore != null && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-sm px-3 py-1',
                              enrollment.overallScore >= course.passingScore
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200',
                            )}
                          >
                            Evaluaciones: {enrollment.overallScore}%
                            {enrollment.overallScore >= course.passingScore
                              ? ' · Aprobado'
                              : ` · mínimo requerido ${course.passingScore}%`}
                          </Badge>
                        )}
                        <Button asChild variant="outline" className="mt-2">
                          <Link href="/"><ChevronLeft className="mr-2 h-4 w-4" />Volver a mi ruta</Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <BookOpen className="h-12 w-12 text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">Selecciona una lección para comenzar.</p>
                        <Button size="sm" variant="outline" className="gap-2 lg:hidden" onClick={() => setSidebarOpen(true)}>
                          <Menu className="h-4 w-4" /> Ver lecciones
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
