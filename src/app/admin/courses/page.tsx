'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  publishCourse,
  archiveCourse,
  getQuizzes,
} from '@/lib/firestore-service';
import type { Quiz } from '@/lib/types-scalable';
import type { Course, CourseModule, Lesson, LessonType, ContentNavigation } from '@/lib/types-lms';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge as UiBadge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Video,
  FileText,
  Headphones,
  Globe,
  Code,
  Layers,
  Package,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Eye,
  Archive,
  Send,
  Clock,
  LayoutList,
  Search,
  Upload,
  X,
  CheckCircle2,
  Link,
} from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Ventas', 'Finanzas', 'Compliance', 'Tecnología', 'Liderazgo',
  'Onboarding', 'Operaciones', 'Servicio al cliente', 'Otro',
];

const LESSON_TYPES: { value: LessonType; label: string; icon: React.ElementType }[] = [
  { value: 'video',    label: 'Video',               icon: Video },
  { value: 'slides',   label: 'Presentación',         icon: Layers },
  { value: 'document', label: 'Documento (PDF/DOC)',  icon: FileText },
  { value: 'html',     label: 'Contenido HTML',       icon: Code },
  { value: 'embedded', label: 'iFrame / Embebido',   icon: Globe },
  { value: 'audio',    label: 'Audio',                icon: Headphones },
  { value: 'scorm',    label: 'SCORM',                icon: Package },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Borrador',   className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  published: { label: 'Publicado',  className: 'bg-green-100 text-green-800 border-green-200' },
  archived:  { label: 'Archivado',  className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

function lessonIcon(type: LessonType) {
  return LESSON_TYPES.find(t => t.value === type)?.icon ?? FileText;
}

function totalLessons(modules: CourseModule[]) {
  return modules.reduce((sum, m) => sum + m.lessons.length, 0);
}

// ─── Tipos de formulario ──────────────────────────────────────────────────────

interface CourseForm {
  title: string;
  description: string;
  category: string;
  navigation: ContentNavigation;
  passingScore: string;
}

interface LessonForm {
  title: string;
  type: LessonType;
  estimatedDuration: string;
  contentUrl: string;
  htmlContent: string;
  description: string;
}

const DEFAULT_COURSE_FORM: CourseForm = {
  title: '',
  description: '',
  category: 'Onboarding',
  navigation: 'sequential',
  passingScore: '80',
};

const DEFAULT_LESSON_FORM: LessonForm = {
  title: '',
  type: 'video',
  estimatedDuration: '',
  contentUrl: '',
  htmlContent: '',
  description: '',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminCoursesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Datos ──
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);

  // ── Vista ──
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  // ── Filtros (vista lista) ──
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // ── Diálogo "crear rápido" (solo desde lista) ──
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CourseForm>(DEFAULT_COURSE_FORM);

  // ── Editor de curso ──
  const [courseForm, setCourseForm] = useState<CourseForm>(DEFAULT_COURSE_FORM);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleDesc, setModuleDesc] = useState('');

  // ── Diálogo de lección ──
  const [lessonDialog, setLessonDialog] = useState<{
    open: boolean;
    moduleId: string;
    editing: Lesson | null;
  }>({ open: false, moduleId: '', editing: null });
  const [lessonForm, setLessonForm] = useState<LessonForm>(DEFAULT_LESSON_FORM);

  // ── Confirmación de borrado ──
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Guardando ──
  const [saving, setSaving] = useState(false);

  // ─── Carga inicial ────────────────────────────────────────────────────────

  const loadCourses = useCallback(async () => {
    setLoading(true);
    const [data, quizzes] = await Promise.all([
      getCourses(),
      getQuizzes(undefined, false).catch(() => []),
    ]);
    setCourses(data);
    setAvailableQuizzes(quizzes);
    setLoading(false);
  }, []);

  useEffect(() => { loadCourses(); }, [loadCourses]);

  // ─── Lista filtrada ───────────────────────────────────────────────────────

  const filteredCourses = courses.filter(c => {
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.category?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  // ─── Crear curso rápido ───────────────────────────────────────────────────

  async function handleQuickCreate() {
    if (!createForm.title.trim()) return;
    setSaving(true);
    try {
      const id = await createCourse({
        organizationId: 'aviva-credito',
        authorId: user!.uid,
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        category: createForm.category,
        navigation: createForm.navigation,
        passingScore: Number(createForm.passingScore) || 80,
        tags: [],
        modules: [],
        prerequisiteCourseIds: [],
        targetRoles: [],
        branchIds: [],
        recertification: { enabled: false, recurrenceType: 'none', notifyDaysBefore: 7, autoReassign: false },
        status: 'draft',
      }, user!.uid);
      toast({ title: 'Curso creado', description: 'Ahora puedes añadir módulos y lecciones.' });
      setCreateDialogOpen(false);
      setCreateForm(DEFAULT_COURSE_FORM);
      await loadCourses();
      // Abrir editor del nuevo curso
      const created = await import('@/lib/firestore-service').then(m => m.getCourse(id));
      if (created) openEditor(created);
    } catch {
      toast({ title: 'Error al crear curso', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // ─── Editor: abrir/cerrar ─────────────────────────────────────────────────

  function openEditor(course: Course) {
    setEditingCourse(course);
    setCourseForm({
      title: course.title,
      description: course.description,
      category: course.category,
      navigation: course.navigation,
      passingScore: String(course.passingScore ?? 80),
    });
    setModules(course.modules ?? []);
    setExpandedModuleId(null);
    setEditingModuleId(null);
    setView('editor');
  }

  function closeEditor() {
    setView('list');
    setEditingCourse(null);
    setModules([]);
    setExpandedModuleId(null);
  }

  // ─── Editor: guardar todo ─────────────────────────────────────────────────

  async function handleSaveAll() {
    if (!editingCourse) return;
    if (!courseForm.title.trim()) {
      toast({ title: 'El título es obligatorio', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateCourse(editingCourse.id, {
        title: courseForm.title.trim(),
        description: courseForm.description.trim(),
        category: courseForm.category,
        navigation: courseForm.navigation,
        passingScore: Number(courseForm.passingScore) || 80,
        modules,
      });
      toast({ title: 'Curso guardado correctamente' });
      setEditingCourse(prev => prev ? { ...prev, modules } : prev);
      await loadCourses();
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // ─── Editor: publicar / archivar ──────────────────────────────────────────

  async function handlePublish(courseId: string) {
    try {
      await publishCourse(courseId);
      toast({ title: 'Curso publicado' });
      await loadCourses();
      if (editingCourse?.id === courseId) setEditingCourse(prev => prev ? { ...prev, status: 'published' } : prev);
    } catch {
      toast({ title: 'Error al publicar', variant: 'destructive' });
    }
  }

  async function handleArchive(courseId: string) {
    try {
      await archiveCourse(courseId);
      toast({ title: 'Curso archivado' });
      await loadCourses();
      if (editingCourse?.id === courseId) setEditingCourse(prev => prev ? { ...prev, status: 'archived' } : prev);
    } catch {
      toast({ title: 'Error al archivar', variant: 'destructive' });
    }
  }

  // ─── Editor: eliminar curso ───────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteCourse(deleteId);
      toast({ title: 'Curso eliminado' });
      if (editingCourse?.id === deleteId) closeEditor();
      setDeleteId(null);
      await loadCourses();
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  }

  // ─── Editor: módulos ──────────────────────────────────────────────────────

  function handleAddModule() {
    const newMod: CourseModule = {
      id: uid(),
      title: 'Nuevo módulo',
      description: '',
      order: modules.length,
      lessons: [],
      prerequisiteModuleIds: [],
      isOptional: false,
    };
    const updated = [...modules, newMod];
    setModules(updated);
    setExpandedModuleId(newMod.id);
    startEditModule(newMod);
  }

  function startEditModule(mod: CourseModule) {
    setEditingModuleId(mod.id);
    setModuleTitle(mod.title);
    setModuleDesc(mod.description ?? '');
  }

  function saveModuleTitle(modId: string) {
    setModules(prev => prev.map(m =>
      m.id === modId ? { ...m, title: moduleTitle, description: moduleDesc } : m
    ));
    setEditingModuleId(null);
  }

  function handleRemoveModule(modId: string) {
    setModules(prev => prev.filter(m => m.id !== modId).map((m, i) => ({ ...m, order: i })));
    if (expandedModuleId === modId) setExpandedModuleId(null);
  }

  function handleMoveModule(modId: string, dir: 'up' | 'down') {
    setModules(prev => {
      const idx = prev.findIndex(m => m.id === modId);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((m, i) => ({ ...m, order: i }));
    });
  }

  // ─── Editor: lecciones ────────────────────────────────────────────────────

  function openLessonDialog(moduleId: string, lesson?: Lesson) {
    setLessonDialog({ open: true, moduleId, editing: lesson ?? null });
    setLessonForm(lesson ? {
      title: lesson.title,
      type: lesson.type,
      estimatedDuration: String(lesson.estimatedDuration ?? ''),
      contentUrl: lesson.content.videoUrl ?? lesson.content.slidesUrl ??
        lesson.content.documentUrl ?? lesson.content.embedUrl ??
        lesson.content.audioUrl ?? lesson.content.scormPackageUrl ?? '',
      htmlContent: lesson.content.htmlContent ?? '',
      description: lesson.description ?? '',
    } : DEFAULT_LESSON_FORM);
  }

  function handleSaveLesson() {
    const { moduleId, editing } = lessonDialog;
    if (!lessonForm.title.trim()) return;

    const content = buildLessonContent(lessonForm);
    const now = { seconds: Date.now() / 1000, nanoseconds: 0 } as unknown as import('firebase/firestore').Timestamp;

    if (editing) {
      const updated: Lesson = {
        ...editing,
        title: lessonForm.title.trim(),
        type: lessonForm.type,
        estimatedDuration: Number(lessonForm.estimatedDuration) || undefined,
        description: lessonForm.description.trim() || undefined,
        content,
        updatedAt: now,
      };
      setModules(prev => prev.map(m => m.id === moduleId
        ? { ...m, lessons: m.lessons.map(l => l.id === editing.id ? updated : l) }
        : m
      ));
    } else {
      const newLesson: Lesson = {
        id: uid(),
        moduleId,
        courseId: editingCourse?.id ?? '',
        title: lessonForm.title.trim(),
        type: lessonForm.type,
        order: (modules.find(m => m.id === moduleId)?.lessons.length ?? 0),
        estimatedDuration: Number(lessonForm.estimatedDuration) || undefined,
        description: lessonForm.description.trim() || undefined,
        content,
        isRequired: true,
        isFreePreview: false,
        createdAt: now,
        updatedAt: now,
      };
      setModules(prev => prev.map(m => m.id === moduleId
        ? { ...m, lessons: [...m.lessons, newLesson] }
        : m
      ));
    }
    setLessonDialog({ open: false, moduleId: '', editing: null });
  }

  function handleUpdateModuleQuiz(modId: string, quizId: string | null) {
    setModules(prev => prev.map(m =>
      m.id === modId ? { ...m, assessmentQuizId: quizId ?? undefined } : m
    ));
  }

  function handleRemoveLesson(moduleId: string, lessonId: string) {
    setModules(prev => prev.map(m => m.id === moduleId
      ? { ...m, lessons: m.lessons.filter(l => l.id !== lessonId).map((l, i) => ({ ...l, order: i })) }
      : m
    ));
  }

  function handleMoveLessonUp(moduleId: string, lessonId: string) {
    setModules(prev => prev.map(m => {
      if (m.id !== moduleId) return m;
      const idx = m.lessons.findIndex(l => l.id === lessonId);
      if (idx <= 0) return m;
      const lessons = [...m.lessons];
      [lessons[idx], lessons[idx - 1]] = [lessons[idx - 1], lessons[idx]];
      return { ...m, lessons: lessons.map((l, i) => ({ ...l, order: i })) };
    }));
  }

  function handleMoveLessonDown(moduleId: string, lessonId: string) {
    setModules(prev => prev.map(m => {
      if (m.id !== moduleId) return m;
      const idx = m.lessons.findIndex(l => l.id === lessonId);
      if (idx < 0 || idx >= m.lessons.length - 1) return m;
      const lessons = [...m.lessons];
      [lessons[idx], lessons[idx + 1]] = [lessons[idx + 1], lessons[idx]];
      return { ...m, lessons: lessons.map((l, i) => ({ ...l, order: i })) };
    }));
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (view === 'editor' && editingCourse) {
    return <CourseEditor
      course={editingCourse}
      courseForm={courseForm}
      setCourseForm={setCourseForm}
      modules={modules}
      availableQuizzes={availableQuizzes}
      expandedModuleId={expandedModuleId}
      setExpandedModuleId={setExpandedModuleId}
      editingModuleId={editingModuleId}
      moduleTitle={moduleTitle}
      setModuleTitle={setModuleTitle}
      moduleDesc={moduleDesc}
      setModuleDesc={setModuleDesc}
      lessonDialog={lessonDialog}
      lessonForm={lessonForm}
      setLessonForm={setLessonForm}
      saving={saving}
      onBack={closeEditor}
      onSaveAll={handleSaveAll}
      onPublish={handlePublish}
      onArchive={handleArchive}
      onDelete={(id) => setDeleteId(id)}
      onAddModule={handleAddModule}
      onStartEditModule={startEditModule}
      onSaveModuleTitle={saveModuleTitle}
      onRemoveModule={handleRemoveModule}
      onMoveModule={handleMoveModule}
      onUpdateModuleQuiz={handleUpdateModuleQuiz}
      onOpenLessonDialog={openLessonDialog}
      onSaveLesson={handleSaveLesson}
      onCloseLessonDialog={() => setLessonDialog({ open: false, moduleId: '', editing: null })}
      onRemoveLesson={handleRemoveLesson}
      onMoveLessonUp={handleMoveLessonUp}
      onMoveLessonDown={handleMoveLessonDown}
    />;
  }

  return (
    <>
      {/* ── Vista: Lista ── */}
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Gestión de Cursos</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Crea y administra cursos con módulos, lecciones y contenido multimedia.
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo curso
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cursos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="published">Publicado</SelectItem>
              <SelectItem value="archived">Archivado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Lista de cursos */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Cargando cursos...</div>
        ) : filteredCourses.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-sky-50 flex items-center justify-center">
                <BookOpen className="h-7 w-7 text-sky-400" />
              </div>
              <p className="font-medium text-foreground">
                {courses.length === 0 ? 'No hay cursos todavía' : 'Sin resultados'}
              </p>
              <p className="text-sm text-muted-foreground">
                {courses.length === 0
                  ? 'Crea tu primer curso haciendo clic en "Nuevo curso".'
                  : 'Prueba con otros filtros.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredCourses.map(course => {
              const st = STATUS_LABELS[course.status] ?? STATUS_LABELS.draft;
              const modCount = course.modules?.length ?? 0;
              const lesCount = totalLessons(course.modules ?? []);
              return (
                <Card key={course.id} className="group flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="h-5 w-5 text-white" />
                      </div>
                      <UiBadge className={st.className}>{st.label}</UiBadge>
                    </div>
                    <CardTitle className="text-base mt-2 line-clamp-2">{course.title}</CardTitle>
                    <CardDescription className="text-xs line-clamp-2">{course.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 flex-1">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <LayoutList className="h-3.5 w-3.5" />
                        {modCount} módulo{modCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {lesCount} lección{lesCount !== 1 ? 'es' : ''}
                      </span>
                      {course.category && (
                        <span className="bg-sky-50 text-sky-700 rounded px-1.5 py-0.5 font-medium">
                          {course.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-auto pt-2 border-t">
                      <Button size="sm" variant="default" className="gap-1 flex-1" onClick={() => openEditor(course)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      {course.status === 'draft' && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handlePublish(course.id)}>
                          <Send className="h-3.5 w-3.5" />
                          Publicar
                        </Button>
                      )}
                      {course.status === 'published' && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handleArchive(course.id)}>
                          <Archive className="h-3.5 w-3.5" />
                          Archivar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(course.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Diálogo: Crear curso ── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo curso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título del curso *</Label>
              <Input
                value={createForm.title}
                onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Ej. Introducción a Crédito Personal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea
                value={createForm.description}
                onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                placeholder="¿De qué trata el curso?"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={createForm.category} onValueChange={v => setCreateForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Navegación</Label>
                <Select value={createForm.navigation} onValueChange={v => setCreateForm(p => ({ ...p, navigation: v as ContentNavigation }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Secuencial</SelectItem>
                    <SelectItem value="free">Libre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleQuickCreate} disabled={saving || !createForm.title.trim()}>
              {saving ? 'Creando...' : 'Crear curso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmación eliminar ── */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este curso?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente. Se eliminarán el curso y toda su estructura de módulos y lecciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Sub-componente: Editor de curso ─────────────────────────────────────────

interface EditorProps {
  course: Course;
  courseForm: CourseForm;
  setCourseForm: React.Dispatch<React.SetStateAction<CourseForm>>;
  modules: CourseModule[];
  availableQuizzes: Quiz[];
  expandedModuleId: string | null;
  setExpandedModuleId: React.Dispatch<React.SetStateAction<string | null>>;
  editingModuleId: string | null;
  moduleTitle: string;
  setModuleTitle: React.Dispatch<React.SetStateAction<string>>;
  moduleDesc: string;
  setModuleDesc: React.Dispatch<React.SetStateAction<string>>;
  lessonDialog: { open: boolean; moduleId: string; editing: Lesson | null };
  lessonForm: LessonForm;
  setLessonForm: React.Dispatch<React.SetStateAction<LessonForm>>;
  saving: boolean;
  onBack: () => void;
  onSaveAll: () => void;
  onPublish: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onAddModule: () => void;
  onStartEditModule: (mod: CourseModule) => void;
  onSaveModuleTitle: (id: string) => void;
  onRemoveModule: (id: string) => void;
  onMoveModule: (id: string, dir: 'up' | 'down') => void;
  onUpdateModuleQuiz: (modId: string, quizId: string | null) => void;
  onOpenLessonDialog: (moduleId: string, lesson?: Lesson) => void;
  onSaveLesson: () => void;
  onCloseLessonDialog: () => void;
  onRemoveLesson: (moduleId: string, lessonId: string) => void;
  onMoveLessonUp: (moduleId: string, lessonId: string) => void;
  onMoveLessonDown: (moduleId: string, lessonId: string) => void;
}

function CourseEditor({
  course, courseForm, setCourseForm, modules, availableQuizzes,
  expandedModuleId, setExpandedModuleId,
  editingModuleId, moduleTitle, setModuleTitle, moduleDesc, setModuleDesc,
  lessonDialog, lessonForm, setLessonForm,
  saving, onBack, onSaveAll, onPublish, onArchive, onDelete,
  onAddModule, onStartEditModule, onSaveModuleTitle, onRemoveModule, onMoveModule,
  onUpdateModuleQuiz,
  onOpenLessonDialog, onSaveLesson, onCloseLessonDialog, onRemoveLesson,
  onMoveLessonUp, onMoveLessonDown,
}: EditorProps) {
  const st = STATUS_LABELS[course.status] ?? STATUS_LABELS.draft;

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Cursos
          </Button>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-lg font-bold truncate max-w-xs">{courseForm.title || 'Sin título'}</h1>
          <UiBadge className={st.className}>{st.label}</UiBadge>
        </div>
        <div className="flex items-center gap-2">
          {course.status === 'draft' && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => onPublish(course.id)}>
              <Send className="h-3.5 w-3.5" />
              Publicar
            </Button>
          )}
          {course.status === 'published' && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => onArchive(course.id)}>
              <Archive className="h-3.5 w-3.5" />
              Archivar
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1" onClick={() => onDelete(course.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={onSaveAll} disabled={saving} className="gap-1">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Columna izquierda: info básica ── */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Información del curso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input
                  value={courseForm.title}
                  onChange={e => setCourseForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Título del curso"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Textarea
                  value={courseForm.description}
                  onChange={e => setCourseForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="¿De qué trata el curso?"
                  rows={4}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={courseForm.category} onValueChange={v => setCourseForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Navegación</Label>
                <Select value={courseForm.navigation} onValueChange={v => setCourseForm(p => ({ ...p, navigation: v as ContentNavigation }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Secuencial (en orden)</SelectItem>
                    <SelectItem value="free">Libre (cualquier orden)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Puntaje mínimo para aprobar (%)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={courseForm.passingScore}
                  onChange={e => setCourseForm(p => ({ ...p, passingScore: e.target.value }))}
                  placeholder="80"
                />
              </div>
            </CardContent>
          </Card>

          {/* Resumen */}
          <Card className="bg-sky-50/50 border-sky-100">
            <CardContent className="py-4">
              <div className="flex justify-around text-center">
                <div>
                  <p className="text-2xl font-bold text-sky-700">{modules.length}</p>
                  <p className="text-xs text-muted-foreground">Módulos</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-sky-700">{totalLessons(modules)}</p>
                  <p className="text-xs text-muted-foreground">Lecciones</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-sky-700">
                    {modules.reduce((s, m) => s + m.lessons.reduce((ls, l) => ls + (l.estimatedDuration ?? 0), 0), 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Min. est.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Columna derecha: módulos y lecciones ── */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Módulos y lecciones
            </h2>
            <Button size="sm" variant="outline" onClick={onAddModule} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Añadir módulo
            </Button>
          </div>

          {modules.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                <LayoutList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Este curso no tiene módulos todavía.<br />
                Haz clic en <strong>Añadir módulo</strong> para empezar.
              </CardContent>
            </Card>
          )}

          {modules.map((mod, modIdx) => {
            const isExpanded = expandedModuleId === mod.id;
            const isEditingTitle = editingModuleId === mod.id;
            return (
              <Card key={mod.id} className="overflow-hidden">
                {/* Cabecera del módulo */}
                <div
                  className="flex items-center gap-2 px-4 py-3 bg-muted/30 cursor-pointer select-none"
                  onClick={() => setExpandedModuleId(isExpanded ? null : mod.id)}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground w-6">{modIdx + 1}</span>
                  {isEditingTitle ? (
                    <div className="flex-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Input
                        value={moduleTitle}
                        onChange={e => setModuleTitle(e.target.value)}
                        className="h-7 text-sm"
                        placeholder="Título del módulo"
                        autoFocus
                      />
                      <Button size="sm" className="h-7 px-2" onClick={() => onSaveModuleTitle(mod.id)}>
                        OK
                      </Button>
                    </div>
                  ) : (
                    <span className="flex-1 font-medium text-sm truncate">{mod.title}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto mr-2">
                    {mod.lessons.length} lección{mod.lessons.length !== 1 ? 'es' : ''}
                  </span>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onStartEditModule(mod)} title="Editar título">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoveModule(mod.id, 'up')} disabled={modIdx === 0}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoveModule(mod.id, 'down')} disabled={modIdx === modules.length - 1}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onRemoveModule(mod.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" /> : <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />}
                </div>

                {/* Lista de lecciones (expandida) */}
                {isExpanded && (
                  <CardContent className="pt-0 pb-3 px-4">
                    {/* Descripción opcional del módulo */}
                    {isEditingTitle ? (
                      <Input
                        value={moduleDesc}
                        onChange={e => setModuleDesc(e.target.value)}
                        className="h-7 text-xs mt-2 mb-3"
                        placeholder="Descripción opcional del módulo"
                      />
                    ) : mod.description ? (
                      <p className="text-xs text-muted-foreground mt-2 mb-3">{mod.description}</p>
                    ) : null}

                    {mod.lessons.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center">
                        No hay lecciones en este módulo.
                      </p>
                    ) : (
                      <div className="space-y-1.5 mt-2">
                        {mod.lessons.map((lesson, lesIdx) => {
                          const LIcon = lessonIcon(lesson.type);
                          const typeLabel = LESSON_TYPES.find(t => t.value === lesson.type)?.label ?? lesson.type;
                          return (
                            <div key={lesson.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                              <div className="h-7 w-7 rounded-md bg-sky-50 flex items-center justify-center flex-shrink-0">
                                <LIcon className="h-3.5 w-3.5 text-sky-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{lesson.title}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-2">
                                  <span>{typeLabel}</span>
                                  {lesson.estimatedDuration && (
                                    <span className="flex items-center gap-0.5">
                                      <Clock className="h-3 w-3" />
                                      {lesson.estimatedDuration} min
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoveLessonUp(mod.id, lesson.id)} disabled={lesIdx === 0}>
                                  <ArrowUp className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMoveLessonDown(mod.id, lesson.id)} disabled={lesIdx === mod.lessons.length - 1}>
                                  <ArrowDown className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onOpenLessonDialog(mod.id, lesson)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onRemoveLesson(mod.id, lesson.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full gap-1 border-dashed text-muted-foreground hover:text-foreground"
                      onClick={() => onOpenLessonDialog(mod.id)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Añadir lección
                    </Button>

                    {/* Module assessment quiz */}
                    <div className="mt-3 pt-3 border-t space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <HelpCircle className="h-3.5 w-3.5" />
                        Evaluación al finalizar el módulo (opcional)
                      </p>
                      <Select
                        value={mod.assessmentQuizId || '__none__'}
                        onValueChange={v => onUpdateModuleQuiz(mod.id, v === '__none__' ? null : v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Sin evaluación" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin evaluación</SelectItem>
                          {availableQuizzes.length === 0 ? (
                            <SelectItem value="empty" disabled>No hay quizzes disponibles</SelectItem>
                          ) : (
                            availableQuizzes.map(q => (
                              <SelectItem key={q.id} value={q.id}>
                                <span className="flex items-center gap-2">
                                  <HelpCircle className="h-3 w-3 text-purple-600" />
                                  {q.title}
                                </span>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">El vendedor completará esta evaluación después de ver todas las lecciones del módulo.</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Diálogo: Lección ── */}
      <Dialog open={lessonDialog.open} onOpenChange={open => !open && onCloseLessonDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{lessonDialog.editing ? 'Editar lección' : 'Nueva lección'}</DialogTitle>
          </DialogHeader>
          <LessonFormFields form={lessonForm} setForm={setLessonForm} courseId={course.id} />
          <DialogFooter>
            <Button variant="outline" onClick={onCloseLessonDialog}>Cancelar</Button>
            <Button onClick={onSaveLesson} disabled={!lessonForm.title.trim()}>
              {lessonDialog.editing ? 'Guardar cambios' : 'Añadir lección'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tipos con soporte de upload a Storage ───────────────────────────────────

const UPLOAD_ACCEPT: Partial<Record<LessonType, string>> = {
  video:    'video/mp4,video/webm,video/quicktime,video/*',
  audio:    'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/*',
  document: '.pdf,.doc,.docx,.ppt,.pptx',
  slides:   '.pdf,.ppt,.pptx,.key',
  scorm:    '.zip',
};

// ─── Sub-componente: Formulario de lección ────────────────────────────────────

function LessonFormFields({
  form,
  setForm,
  courseId,
}: {
  form: LessonForm;
  setForm: React.Dispatch<React.SetStateAction<LessonForm>>;
  courseId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'upload' | 'url'>(
    form.contentUrl ? 'url' : 'upload'
  );

  const acceptAttr = UPLOAD_ACCEPT[form.type];
  const supportsUpload = !!acceptAttr;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !storage) return;
    setUploadError(null);
    setUploadProgress(0);

    const safeId = courseId || 'draft';
    const timestamp = Date.now();
    const storagePath = `courses/${safeId}/lessons/${form.type}/${timestamp}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadProgress(pct);
      },
      err => {
        console.error('Upload error:', err);
        setUploadError('Error al subir el archivo. Intenta de nuevo.');
        setUploadProgress(null);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setForm(p => ({ ...p, contentUrl: url }));
        setUploadProgress(null);
        setInputMode('url');
      }
    );
  }

  function clearFile() {
    setForm(p => ({ ...p, contentUrl: '' }));
    setUploadProgress(null);
    setUploadError(null);
    setInputMode('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const isUploading = uploadProgress !== null;
  const fileNameFromUrl = form.contentUrl
    ? decodeURIComponent(form.contentUrl.split('/').pop()?.split('?')[0] ?? '')
    : '';

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label>Título de la lección *</Label>
        <Input
          value={form.title}
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          placeholder="Ej. Introducción a crédito"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo de contenido</Label>
          <Select
            value={form.type}
            onValueChange={v => {
              setForm(p => ({ ...p, type: v as LessonType, contentUrl: '', htmlContent: '' }));
              setUploadProgress(null);
              setUploadError(null);
              setInputMode('upload');
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LESSON_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  <span className="flex items-center gap-2">
                    <t.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {t.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Duración estimada (min)
          </Label>
          <Input
            type="number"
            min={1}
            value={form.estimatedDuration}
            onChange={e => setForm(p => ({ ...p, estimatedDuration: e.target.value }))}
            placeholder="10"
          />
        </div>
      </div>

      {/* ── Contenido según tipo ── */}
      {form.type === 'html' ? (
        <div className="space-y-1.5">
          <Label>Contenido HTML</Label>
          <Textarea
            value={form.htmlContent}
            onChange={e => setForm(p => ({ ...p, htmlContent: e.target.value }))}
            placeholder="<p>Contenido de la lección...</p>"
            rows={5}
            className="font-mono text-xs"
          />
        </div>
      ) : form.type === 'embedded' ? (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Link className="h-3.5 w-3.5" />
            URL del iFrame (src)
          </Label>
          <Input
            value={form.contentUrl}
            onChange={e => setForm(p => ({ ...p, contentUrl: e.target.value }))}
            placeholder="https://..."
            type="url"
          />
        </div>
      ) : supportsUpload ? (
        <div className="space-y-2">
          {/* Selector upload / url */}
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">Contenido</Label>
            <div className="flex rounded-md border text-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${
                  inputMode === 'upload'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Upload className="h-3 w-3" />
                Subir archivo
              </button>
              <button
                type="button"
                onClick={() => setInputMode('url')}
                className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${
                  inputMode === 'url'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Link className="h-3 w-3" />
                URL externa
              </button>
            </div>
          </div>

          {inputMode === 'upload' ? (
            <div>
              {/* Zona de drop/click */}
              {!form.contentUrl && !isUploading && (
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">
                    {form.type === 'video' && 'Haz clic para subir un video'}
                    {form.type === 'audio' && 'Haz clic para subir un audio'}
                    {form.type === 'document' && 'Haz clic para subir un documento'}
                    {form.type === 'slides' && 'Haz clic para subir una presentación'}
                    {form.type === 'scorm' && 'Haz clic para subir el paquete SCORM (.zip)'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.type === 'video' && 'MP4, WebM, MOV'}
                    {form.type === 'audio' && 'MP3, WAV, OGG, M4A'}
                    {form.type === 'document' && 'PDF, DOC, DOCX, PPT, PPTX'}
                    {form.type === 'slides' && 'PDF, PPT, PPTX, KEY'}
                    {form.type === 'scorm' && 'ZIP (paquete SCORM 1.2 ó 2004)'}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptAttr}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {/* Progreso de upload */}
              {isUploading && (
                <div className="space-y-2 p-4 border rounded-lg bg-muted/20">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subiendo archivo...</span>
                    <span className="font-semibold text-primary">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Archivo subido */}
              {form.contentUrl && !isUploading && (
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-green-50 border-green-200">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 truncate">
                      {fileNameFromUrl || 'Archivo subido'}
                    </p>
                    <a
                      href={form.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-600 underline truncate block"
                    >
                      Ver archivo
                    </a>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-green-600 hover:text-destructive flex-shrink-0"
                    onClick={clearFile}
                    title="Quitar archivo"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {uploadError && (
                <p className="text-xs text-destructive mt-1">{uploadError}</p>
              )}
            </div>
          ) : (
            /* Modo URL externa */
            <Input
              value={form.contentUrl}
              onChange={e => setForm(p => ({ ...p, contentUrl: e.target.value }))}
              placeholder="https://..."
              type="url"
            />
          )}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Descripción (opcional)</Label>
        <Textarea
          value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="Breve descripción de esta lección"
          rows={2}
        />
      </div>
    </div>
  );
}

// ─── Helper: construir LessonContent desde formulario ───────────────────────

function buildLessonContent(form: LessonForm) {
  const url = form.contentUrl.trim();
  switch (form.type) {
    case 'video':    return { videoUrl: url || undefined };
    case 'slides':   return { slidesUrl: url || undefined };
    case 'document': return { documentUrl: url || undefined };
    case 'html':     return { htmlContent: form.htmlContent || undefined };
    case 'embedded': return { embedUrl: url || undefined };
    case 'audio':    return { audioUrl: url || undefined };
    case 'scorm':    return { scormPackageUrl: url || undefined };
    default:         return {};
  }
}
