'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import { getCourse } from '@/lib/firestore-service';
import type { Course } from '@/lib/types-lms';
import {
  BookOpen,
  ChevronLeft,
  LogOut,
  ShieldCheck,
  Clock,
  AlertCircle,
  Construction,
  Tag,
  Users,
} from 'lucide-react';

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params?.courseId as string;
  const { user, profile, logout } = useAuth();
  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    getCourse(courseId)
      .then((data) => {
        if (!data) setNotFound(true);
        else setCourse(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [courseId]);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">
          {/* Header */}
          <header className="bg-accent text-accent-foreground py-4 sm:py-6 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <Link href="/" aria-label="Volver al inicio">
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

              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-sm">
                <Link
                  href="/"
                  className="flex items-center gap-1 text-accent-foreground/70 hover:text-accent-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Inicio
                </Link>
                <span className="text-accent-foreground/40">/</span>
                <Link
                  href="/courses"
                  className="text-accent-foreground/70 hover:text-accent-foreground transition-colors"
                >
                  Cursos
                </Link>
                {course && (
                  <>
                    <span className="text-accent-foreground/40">/</span>
                    <span className="text-accent-foreground font-semibold truncate max-w-[200px]">
                      {course.title}
                    </span>
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="flex-grow p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-2/3 rounded-xl" />
                  <Skeleton className="h-4 w-full rounded-xl" />
                  <Skeleton className="h-48 w-full rounded-2xl" />
                </div>
              ) : notFound ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center gap-3">
                  <AlertCircle className="h-10 w-10 text-muted-foreground" />
                  <p className="font-semibold text-lg">Curso no encontrado</p>
                  <p className="text-muted-foreground text-sm max-w-xs">
                    Este curso no existe o fue eliminado.
                  </p>
                  <Button asChild variant="outline">
                    <Link href="/">
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Volver al inicio
                    </Link>
                  </Button>
                </div>
              ) : course ? (
                <>
                  {/* Course header */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-xs gap-1">
                        <Construction className="h-3 w-3" />
                        Reproductor en desarrollo
                      </Badge>
                      {course.status === 'published' && (
                        <Badge variant="secondary" className="text-xs">Publicado</Badge>
                      )}
                      {course.category && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Tag className="h-3 w-3" />
                          {course.category}
                        </Badge>
                      )}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold">{course.title}</h1>
                    {course.description && (
                      <p className="text-muted-foreground leading-relaxed">{course.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      {course.durationDays && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {course.durationDays} días para completar
                        </span>
                      )}
                      {course.targetRoles?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {course.targetRoles.join(', ')}
                        </span>
                      )}
                      {course.modules?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-4 w-4" />
                          {course.modules.length} módulo{course.modules.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Coming soon notice */}
                  <Card className="border-sky-200 bg-sky-50/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Construction className="h-5 w-5 text-sky-600" />
                        <CardTitle className="text-base text-sky-800">
                          Reproductor de contenido en desarrollo
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sky-700 text-sm leading-relaxed">
                        El reproductor interactivo de este curso estará disponible próximamente.
                        Estamos construyendo soporte para videos, documentos, presentaciones y
                        evaluaciones integradas.
                      </CardDescription>
                      <Button asChild variant="outline" className="mt-4">
                        <Link href="/">
                          <ChevronLeft className="mr-2 h-4 w-4" />
                          Volver a mi ruta
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Module list preview */}
                  {course.modules?.length > 0 && (
                    <div>
                      <h2 className="font-semibold text-base mb-3">
                        Contenido del curso ({course.modules.length} módulo{course.modules.length !== 1 ? 's' : ''})
                      </h2>
                      <div className="space-y-2">
                        {course.modules.map((mod, i) => (
                          <div
                            key={mod.id}
                            className="flex items-center gap-3 p-3 rounded-xl border bg-card opacity-60"
                          >
                            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-mono font-semibold shrink-0">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{mod.title}</p>
                              {mod.lessons?.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {mod.lessons.length} lección{mod.lessons.length !== 1 ? 'es' : ''}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">Próximamente</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </main>

          <footer className="bg-accent text-accent-foreground/80 py-4 px-4 sm:px-8 mt-8">
            <div className="max-w-4xl mx-auto text-center text-sm">
              <p>&copy; {new Date().getFullYear()} Aviva. Todos los derechos reservados.</p>
            </div>
          </footer>
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
