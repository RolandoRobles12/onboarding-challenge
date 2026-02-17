'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getCourses, getCourseEnrollments, adminEnrollUserInCourse, getAllUsers } from '@/lib/firestore-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  UserCheck,
  BookOpen,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  UserPlus,
  Award,
  TrendingUp,
} from 'lucide-react';
import type { Course } from '@/lib/types-lms';
import type { CourseEnrollment, EnrollmentStatus } from '@/lib/types-lms';
import type { UserProfile } from '@/lib/types-scalable';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EnrollmentStatus, { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'outline' | 'destructive'; color: string }> = {
  enrolled: { label: 'Inscrito', icon: Clock, variant: 'secondary', color: 'text-blue-600' },
  in_progress: { label: 'En progreso', icon: TrendingUp, variant: 'default', color: 'text-amber-600' },
  completed: { label: 'Completado', icon: CheckCircle2, variant: 'outline', color: 'text-emerald-600' },
  expired: { label: 'Expirado', icon: AlertCircle, variant: 'destructive', color: 'text-red-600' },
};

function progressPercent(enrollment: CourseEnrollment, course: Course): number {
  const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
  if (totalLessons === 0) return 0;
  return Math.round((enrollment.completedLessonIds.length / totalLessons) * 100);
}

function formatDate(ts: import('firebase/firestore').Timestamp | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EnrollmentsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingBase, setLoadingBase] = useState(true);

  // Enroll dialog
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollUserId, setEnrollUserId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  // Load courses + users once
  useEffect(() => {
    Promise.all([getCourses(), getAllUsers()])
      .then(([c, u]) => {
        setCourses(c);
        setUsers(u);
      })
      .finally(() => setLoadingBase(false));
  }, []);

  const loadEnrollments = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    try {
      const data = await getCourseEnrollments(selectedCourseId);
      setEnrollments(data);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las inscripciones.' });
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId, toast]);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  const handleEnroll = async () => {
    if (!enrollUserId || !selectedCourseId || !profile?.uid) return;
    setEnrolling(true);
    try {
      await adminEnrollUserInCourse(enrollUserId, selectedCourseId, profile.uid);
      toast({ title: 'Usuario inscrito', description: 'La inscripción se registró correctamente.' });
      setEnrollDialogOpen(false);
      setEnrollUserId('');
      await loadEnrollments();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo inscribir al usuario.' });
    } finally {
      setEnrolling(false);
    }
  };

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const publishedCourses = courses.filter(c => c.status === 'published');

  // Summary stats
  const stats = {
    total: enrollments.length,
    inProgress: enrollments.filter(e => e.status === 'in_progress').length,
    completed: enrollments.filter(e => e.status === 'completed').length,
    enrolled: enrollments.filter(e => e.status === 'enrolled').length,
  };

  // User map for display names
  const userMap = Object.fromEntries(users.map(u => [u.uid, u]));

  // Already-enrolled user IDs for this course
  const enrolledUserIds = new Set(enrollments.map(e => e.userId));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6" /> Inscripciones y Progreso
          </h1>
          <p className="text-muted-foreground">
            Gestiona quién está inscrito en cada curso y monitorea su avance
          </p>
        </div>
        {selectedCourseId && (
          <Button onClick={() => setEnrollDialogOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" /> Inscribir usuario
          </Button>
        )}
      </div>

      {/* Course selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 max-w-sm">
            <Label>Selecciona el curso</Label>
            {loadingBase ? (
              <div className="h-10 rounded-md bg-muted animate-pulse" />
            ) : (
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige un curso..." />
                </SelectTrigger>
                <SelectContent>
                  {publishedCourses.length === 0 ? (
                    <SelectItem value="none" disabled>No hay cursos publicados</SelectItem>
                  ) : (
                    publishedCourses.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
                          {c.title}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      {selectedCourseId && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total inscritos', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'En progreso', value: stats.inProgress, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Completados', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Sin iniciar', value: stats.enrolled, icon: Clock, color: 'text-slate-600', bg: 'bg-slate-50' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <CardContent className="py-4 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Enrollments list */}
      {selectedCourseId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-emerald-600" />
                  {selectedCourse?.title || 'Curso'}
                </CardTitle>
                <CardDescription>
                  {enrollments.length} usuario{enrollments.length !== 1 ? 's' : ''} inscritos
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadEnrollments} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : enrollments.length === 0 ? (
              <div className="py-10 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground font-medium">Ningún usuario inscrito aún</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Usa el botón "Inscribir usuario" para agregar participantes manualmente
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Header row */}
                <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  <span className="col-span-4">Usuario</span>
                  <span className="col-span-2">Estado</span>
                  <span className="col-span-3">Progreso</span>
                  <span className="col-span-2">Inscrito</span>
                  <span className="col-span-1">Score</span>
                </div>

                {enrollments.map(enrollment => {
                  const user = userMap[enrollment.userId];
                  const statusCfg = STATUS_CONFIG[enrollment.status] || STATUS_CONFIG.enrolled;
                  const StatusIcon = statusCfg.icon;
                  const progress = selectedCourse ? progressPercent(enrollment, selectedCourse) : 0;

                  return (
                    <div
                      key={enrollment.id}
                      className="grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors items-center"
                    >
                      {/* User */}
                      <div className="col-span-4 flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">
                            {(user?.nombre || enrollment.userId).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {user?.nombre || 'Usuario desconocido'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user?.email || enrollment.userId}
                          </p>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        <Badge variant={statusCfg.variant} className="gap-1 text-xs">
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </Badge>
                      </div>

                      {/* Progress bar */}
                      <div className="col-span-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{progress}%</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {enrollment.completedLessonIds.length} lección{enrollment.completedLessonIds.length !== 1 ? 'es' : ''}
                        </p>
                      </div>

                      {/* Enrolled date */}
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(enrollment.enrolledAt)}
                        </span>
                      </div>

                      {/* Score */}
                      <div className="col-span-1">
                        {enrollment.overallScore !== undefined ? (
                          <span className="text-sm font-semibold flex items-center gap-1">
                            {enrollment.certificateId && <Award className="h-3 w-3 text-amber-500" />}
                            {enrollment.overallScore}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enroll user dialog */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Inscribir usuario
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Curso: </span>
              <span className="font-medium">{selectedCourse?.title}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Selecciona el usuario</Label>
              <Select value={enrollUserId} onValueChange={setEnrollUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige un usuario..." />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter(u => !enrolledUserIds.has(u.uid))
                    .map(u => (
                      <SelectItem key={u.uid} value={u.uid}>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{u.nombre}</span>
                          <span className="text-muted-foreground text-xs">— {u.email}</span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {users.filter(u => !enrolledUserIds.has(u.uid)).length === 0 && (
                <p className="text-xs text-muted-foreground">Todos los usuarios ya están inscritos en este curso.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEnroll} disabled={!enrollUserId || enrolling}>
              {enrolling ? 'Inscribiendo...' : 'Inscribir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
