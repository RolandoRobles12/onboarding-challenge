'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
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
  CheckCheck,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Lesson header */}
      <div className="px-6 pt-5 pb-4 border-b">
        <div className="flex items-center gap-2 mb-1">
          <LessonIcon type={lesson.type} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground capitalize">{lesson.type}</span>
          {lesson.estimatedDuration && (
            <span className="text-xs text-muted-foreground">· {lesson.estimatedDuration} min</span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium ml-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completada
            </span>
          )}
        </div>
        <h2 className="text-xl font-bold">{lesson.title}</h2>
        {lesson.description && (
          <p className="text-muted-foreground text-sm mt-1">{lesson.description}</p>
        )}
      </div>

      {/* Content */}
      <div className="px-6 py-5 space-y-4">

        {/* VIDEO — auto-complete on ended */}
        {lesson.type === 'video' && content.videoUrl && (
          <div className="rounded-xl overflow-hidden bg-black aspect-video w-full">
            <video
              key={lesson.id}
              className="w-full h-full"
              controls
              src={content.videoUrl}
              onEnded={() => { if (!isCompleted) onComplete(); }}
            />
          </div>
        )}

        {/* AUDIO — auto-complete on ended */}
        {lesson.type === 'audio' && content.audioUrl && (
          <div className="rounded-xl border p-6 bg-muted/30 flex flex-col items-center gap-4">
            <Headphones className="h-12 w-12 text-muted-foreground" />
            <audio
              key={lesson.id}
              controls
              className="w-full"
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
            <div className="rounded-xl overflow-hidden border" style={{ height: content.embedHeight || 480 }}>
              <iframe
                key={lesson.id}
                src={content.embedUrl}
                className="w-full h-full"
                allowFullScreen
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
            <div className="rounded-xl overflow-hidden border" style={{ height: 480 }}>
              <iframe
                key={lesson.id}
                src={content.slidesUrl}
                className="w-full h-full"
                allowFullScreen
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

        {/* DOCUMENT — auto-complete via timer */}
        {lesson.type === 'document' && content.documentUrl && (
          <>
            {content.documentType === 'pdf' && (
              <div className="rounded-xl overflow-hidden border" style={{ height: 560 }}>
                <iframe
                  key={lesson.id}
                  src={content.documentUrl}
                  className="w-full h-full"
                  title={lesson.title}
                />
              </div>
            )}
            <a
              href={content.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary underline"
            >
              <Paperclip className="h-4 w-4" />
              Abrir / descargar documento
            </a>
            <TimerAutoComplete
              key={lesson.id}
              seconds={timerSeconds}
              isCompleted={isCompleted}
              onComplete={onComplete}
            />
          </>
        )}

        {/* SCORM — auto-complete via timer */}
        {lesson.type === 'scorm' && content.scormPackageUrl && (
          <>
            <div className="rounded-xl overflow-hidden border" style={{ height: 560 }}>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load course + enrollment
  const load = useCallback(async () => {
    if (!courseId || !profile) return;
    try {
      const [data, enrollments] = await Promise.all([
        getCourse(courseId),
        getUserEnrollments(profile.uid).catch(() => []),
      ]);
      if (!data) { setNotFound(true); return; }
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
      setEnrollment(enr);
      setCompletedLessonIds(new Set(enr.completedLessonIds));
      setCompletedModuleIds(new Set(enr.completedModuleIds));

      const allLessons = data.modules.flatMap(m => m.lessons);
      const firstIncomplete = allLessons.find(l => !enr!.completedLessonIds.includes(l.id));
      setSelectedLesson(firstIncomplete ?? allLessons[0] ?? null);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [courseId, profile]);

  useEffect(() => { load(); }, [load]);

  const allLessons = course?.modules.flatMap(m => m.lessons) ?? [];
  const currentIdx = selectedLesson ? allLessons.findIndex(l => l.id === selectedLesson.id) : -1;
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;
  const isDone = selectedLesson ? completedLessonIds.has(selectedLesson.id) : false;

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

    // Persist to Firestore (fire and forget — no loading state exposed to user)
    updateEnrollmentProgress(enrollment.id, {
      completedLessonIds: newLessonIds,
      completedModuleIds: newModuleIds,
      status: allComplete ? 'completed' : 'in_progress',
      ...(allComplete ? { completedAt: new Date() as unknown as import('firebase/firestore').Timestamp } : {}),
    }).catch(console.error);
  }, [enrollment, selectedLesson, course, completedLessonIds, completedModuleIds, allLessons.length]);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col h-screen bg-background overflow-hidden">
          {/* Top bar */}
          <header className="bg-accent text-accent-foreground border-b shrink-0 z-20">
            <div className="flex items-center gap-3 px-4 h-14">
              <button
                className="text-accent-foreground/70 hover:text-accent-foreground lg:hidden"
                onClick={() => setSidebarOpen(o => !o)}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
          ) : course ? (
            <div className="flex flex-1 overflow-hidden">

              {/* Sidebar */}
              <aside className={cn(
                'shrink-0 border-r bg-card flex flex-col overflow-hidden',
                'w-72',
                sidebarOpen ? 'flex' : 'hidden',
                'lg:flex',
              )}>
                <div className="px-4 py-3 border-b">
                  <h1 className="font-bold text-sm leading-snug line-clamp-2">{course.title}</h1>
                  {course.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{course.description}</p>
                  )}
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

                    {/* Bottom nav — no manual complete button */}
                    <div className="shrink-0 border-t bg-card px-4 py-3 flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!prevLesson}
                        onClick={() => prevLesson && setSelectedLesson(prevLesson)}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </Button>

                      <div className="flex-1 text-center">
                        {isDone ? (
                          <span className="flex items-center justify-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCheck className="h-3.5 w-3.5" /> Lección completada
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {currentIdx + 1} / {allLessons.length}
                          </span>
                        )}
                      </div>

                      {/* "Siguiente" locked until lesson is done */}
                      {nextLesson ? (
                        <Button
                          size="sm"
                          disabled={!isDone}
                          onClick={() => isDone && setSelectedLesson(nextLesson)}
                          className="gap-1"
                          title={!isDone ? 'Completa esta lección para continuar' : undefined}
                        >
                          {!isDone && <Lock className="h-3.5 w-3.5" />}
                          Siguiente
                          {isDone && <ChevronRight className="h-4 w-4" />}
                        </Button>
                      ) : isDone ? (
                        <Button size="sm" variant="outline" asChild className="gap-1">
                          <Link href="/"><CheckCircle2 className="h-4 w-4" /> Finalizar</Link>
                        </Button>
                      ) : (
                        <Button size="sm" disabled className="gap-1">
                          <Lock className="h-3.5 w-3.5" /> Finalizar
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
                        <Button asChild variant="outline" className="mt-2">
                          <Link href="/"><ChevronLeft className="mr-2 h-4 w-4" />Volver a mi ruta</Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <BookOpen className="h-12 w-12 text-muted-foreground" />
                        <p className="text-muted-foreground">Selecciona una lección del panel izquierdo.</p>
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
