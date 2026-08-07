'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import { getCourses, getUserEnrollments } from '@/lib/firestore-service';
import type { Course, CourseEnrollment } from '@/lib/types-lms';
import {
  BookOpen,
  ChevronLeft,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  PlayCircle,
  Circle,
  Clock,
} from 'lucide-react';

function courseStats(course: Course) {
  const lessons = course.modules.flatMap(m => m.lessons);
  const minutes = lessons.reduce((s, l) => s + (l.estimatedDuration ?? 0), 0);
  return { lessonCount: lessons.length, minutes };
}

export default function CoursesPage() {
  const { user, profile, logout } = useAuth();
  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);

  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Record<string, CourseEnrollment>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    Promise.all([
      getCourses().catch(() => [] as Course[]),
      getUserEnrollments(profile.uid).catch(() => [] as CourseEnrollment[]),
    ]).then(([allCourses, myEnrollments]) => {
      if (cancelled) return;
      setCourses(allCourses.filter(c => c.status === 'published'));
      const map: Record<string, CourseEnrollment> = {};
      myEnrollments.forEach(e => { map[e.courseId] = e; });
      setEnrollments(map);
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [profile]);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">
          {/* Header */}
          <header className="bg-accent text-accent-foreground py-4 sm:py-6 px-4">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <Link href="/" aria-label="Volver al LMS">
                  <AvivaLogo className="h-10 sm:h-12 w-auto" />
                </Link>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Link href="/admin/courses">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 hidden sm:flex gap-1"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Gestionar cursos
                      </Button>
                    </Link>
                  )}
                  {user && (
                    <Button
                      variant="ghost"
                      onClick={logout}
                      className="text-accent-foreground hover:bg-accent/20"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Salir</span>
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="flex items-center gap-1 text-accent-foreground/70 hover:text-accent-foreground text-sm transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  LMS
                </Link>
                <span className="text-accent-foreground/40">/</span>
                <span className="text-accent-foreground font-semibold text-sm">Cursos</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <h1 className="text-3xl sm:text-4xl font-bold font-headline">Cursos</h1>
                {!loading && courses.length > 0 && (
                  <Badge className="bg-white/15 text-accent-foreground border-white/20 text-xs">
                    {courses.length}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-accent-foreground/80">
                Contenido estructurado con videos, documentos y evaluaciones.
              </p>
            </div>
          </header>

          <main className="flex-grow p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
                </div>
              ) : courses.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-xl">
                    <BookOpen className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Aún no hay cursos publicados</h2>
                  <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
                    En cuanto tu equipo publique un curso, aparecerá aquí.
                  </p>
                  <Button asChild variant="outline" className="mt-2">
                    <Link href="/">
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Volver al LMS
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {courses.map(course => {
                    const { lessonCount, minutes } = courseStats(course);
                    const enr = enrollments[course.id];
                    const done = enr?.completedLessonIds?.length ?? 0;
                    const status = enr?.status;
                    return (
                      <Card key={course.id} className="overflow-hidden flex flex-col">
                        {course.thumbnail ? (
                          <div className="h-28 w-full bg-muted overflow-hidden">
                            <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="h-28 w-full bg-gradient-to-br from-sky-500/15 to-blue-600/10 flex items-center justify-center">
                            <BookOpen className="h-8 w-8 text-sky-600/60" />
                          </div>
                        )}
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {course.category && (
                              <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
                            )}
                            {status === 'completed' ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px] gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Completado
                              </Badge>
                            ) : status === 'in_progress' ? (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] gap-1">
                                <PlayCircle className="h-3 w-3" /> En progreso
                              </Badge>
                            ) : null}
                          </div>
                          <CardTitle className="text-base leading-snug mt-1">{course.title}</CardTitle>
                          <CardDescription className="text-xs line-clamp-2">{course.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0 mt-auto space-y-3">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Circle className="h-3 w-3" /> {lessonCount} lecciones</span>
                            {minutes > 0 && (
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {minutes} min</span>
                            )}
                          </div>
                          {status && lessonCount > 0 && (
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${Math.round((done / lessonCount) * 100)}%` }}
                              />
                            </div>
                          )}
                          <Button asChild size="sm" className="w-full gap-1.5">
                            <Link href={`/courses/${course.id}`}>
                              {status === 'completed' ? 'Ver de nuevo' : status ? 'Continuar' : 'Empezar curso'}
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

            </div>
          </main>

          <footer className="bg-accent text-accent-foreground/80 py-4 px-4 sm:px-8 mt-8">
            <div className="max-w-7xl mx-auto text-center text-sm">
              <p>&copy; {new Date().getFullYear()} Aviva. Todos los derechos reservados.</p>
            </div>
          </footer>
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
