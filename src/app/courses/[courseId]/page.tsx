'use client';

import { useEffect, useState, useCallback } from 'react';
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

  const isLessonUnlocked = (lesson: Lesson, moduleIdx: number, lessonIdx: number) => {
    if (navigation === 'free') return true;
    // In sequential mode: first lesson of first module is always unlocked
    // Each subsequent lesson requires the previous one to be completed
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
              {/* Module header */}
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

              {/* Lessons */}
              {mod.lessons.map((lesson, lessonIdx) => {
                const done = completedLessonIds.has(lesson.id);
                const active = lesson.id === selectedLessonId;
                const unlocked = isLessonUnlocked(lesson, modIdx, lessonIdx);

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

function LessonViewer({ lesson }: { lesson: Lesson }) {
  const { content } = lesson;

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
        </div>
        <h2 className="text-xl font-bold">{lesson.title}</h2>
        {lesson.description && (
          <p className="text-muted-foreground text-sm mt-1">{lesson.description}</p>
        )}
      </div>

      {/* Content */}
      <div className="px-6 py-5 space-y-4">
        {lesson.type === 'video' && content.videoUrl && (
          <div className="rounded-xl overflow-hidden bg-black aspect-video w-full">
            <video
              className="w-full h-full"
              controls
              src={content.videoUrl}
            />
          </div>
        )}

        {lesson.type === 'audio' && content.audioUrl && (
          <div className="rounded-xl border p-6 bg-muted/30 flex flex-col items-center gap-4">
            <Headphones className="h-12 w-12 text-muted-foreground" />
            <audio controls className="w-full" src={content.audioUrl} />
          </div>
        )}

        {lesson.type === 'html' && content.htmlContent && (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: content.htmlContent }}
          />
        )}

        {lesson.type === 'embedded' && content.embedUrl && (
          <div className="rounded-xl overflow-hidden border" style={{ height: content.embedHeight || 480 }}>
            <iframe
              src={content.embedUrl}
              className="w-full h-full"
              allowFullScreen
              title={lesson.title}
            />
          </div>
        )}

        {lesson.type === 'slides' && content.slidesUrl && (
          <div className="rounded-xl overflow-hidden border" style={{ height: 480 }}>
            <iframe
              src={content.slidesUrl}
              className="w-full h-full"
              allowFullScreen
              title={lesson.title}
            />
          </div>
        )}

        {lesson.type === 'document' && content.documentUrl && (
          <div className="space-y-3">
            {content.documentType === 'pdf' && (
              <div className="rounded-xl overflow-hidden border" style={{ height: 560 }}>
                <iframe
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
          </div>
        )}

        {lesson.type === 'scorm' && content.scormPackageUrl && (
          <div className="rounded-xl overflow-hidden border" style={{ height: 560 }}>
            <iframe
              src={content.scormPackageUrl}
              className="w-full h-full"
              title={lesson.title}
            />
          </div>
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
                  {att.sizeKb && <span className="text-xs text-muted-foreground">({Math.round(att.sizeKb / 1024 * 10) / 10} MB)</span>}
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
  const [markingDone, setMarkingDone] = useState(false);

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

      // Find or create enrollment
      let enr = enrollments.find(e => e.courseId === courseId) ?? null;
      if (!enr) {
        // Auto-enroll
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

      // Select first unlocked lesson
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

  // All lessons flat list for prev/next navigation
  const allLessons = course?.modules.flatMap(m => m.lessons) ?? [];
  const currentIdx = selectedLesson ? allLessons.findIndex(l => l.id === selectedLesson.id) : -1;
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;
  const isDone = selectedLesson ? completedLessonIds.has(selectedLesson.id) : false;

  const pct = allLessons.length > 0
    ? Math.round((completedLessonIds.size / allLessons.length) * 100)
    : 0;

  // Mark current lesson complete
  const handleMarkComplete = async () => {
    if (!enrollment || !selectedLesson || !course) return;
    setMarkingDone(true);
    try {
      const newLessonIds = [...completedLessonIds, selectedLesson.id];
      // Check if the module is now complete
      const mod = course.modules.find(m => m.lessons.some(l => l.id === selectedLesson.id));
      const newModuleIds = [...completedModuleIds];
      if (mod && mod.lessons.every(l => newLessonIds.includes(l.id))) {
        newModuleIds.push(mod.id);
      }
      const allComplete = newLessonIds.length === allLessons.length;

      await updateEnrollmentProgress(enrollment.id, {
        completedLessonIds: newLessonIds,
        completedModuleIds: newModuleIds,
        status: allComplete ? 'completed' : 'in_progress',
        ...(allComplete ? { completedAt: new Date() as unknown as import('firebase/firestore').Timestamp } : {}),
      });

      setCompletedLessonIds(new Set(newLessonIds));
      setCompletedModuleIds(new Set(newModuleIds));

      // Advance to next lesson automatically
      if (nextLesson) setSelectedLesson(nextLesson);
    } finally {
      setMarkingDone(false);
    }
  };

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col h-screen bg-background overflow-hidden">
          {/* Top bar */}
          <header className="bg-accent text-accent-foreground border-b shrink-0 z-20">
            <div className="flex items-center gap-3 px-4 h-14">
              {/* Sidebar toggle (mobile) */}
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
                {/* Progress chip */}
                {!loading && course && (
                  <div className="hidden sm:flex items-center gap-2">
                    <Progress value={pct} className="w-24 h-1.5" />
                    <span className="text-xs text-accent-foreground/70">{pct}%</span>
                  </div>
                )}

                {isAdmin && (
                  <Link href={`/admin/courses`}>
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
                'shrink-0 border-r bg-card flex flex-col transition-all duration-200 overflow-hidden',
                'w-72',
                // On mobile, overlay
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
                    setSidebarOpen(false); // close on mobile after select
                  }}
                />
              </aside>

              {/* Main content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedLesson ? (
                  <>
                    {/* Lesson content */}
                    <div className="flex-1 overflow-y-auto">
                      <LessonViewer lesson={selectedLesson} />
                    </div>

                    {/* Bottom navigation bar */}
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
                        <span className="text-xs text-muted-foreground">
                          {currentIdx + 1} / {allLessons.length}
                        </span>
                      </div>

                      {isDone ? (
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCheck className="h-4 w-4" /> Completada
                          </span>
                          {nextLesson && (
                            <Button size="sm" onClick={() => setSelectedLesson(nextLesson)} className="gap-1">
                              Siguiente <ChevronRight className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleMarkComplete}
                          disabled={markingDone}
                          className="gap-1"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {markingDone ? 'Guardando…' : 'Marcar como completada'}
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  // Course complete or no lessons
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                    {pct === 100 ? (
                      <>
                        <div className="text-5xl">🎖️</div>
                        <h2 className="text-2xl font-bold">¡Curso completado!</h2>
                        <p className="text-muted-foreground max-w-sm">
                          Has terminado todos los módulos de <strong>{course.title}</strong>. ¡Excelente trabajo!
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
