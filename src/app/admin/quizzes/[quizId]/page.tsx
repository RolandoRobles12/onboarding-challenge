'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProducts, useQuestions } from '@/hooks/use-firestore';
import { useAuth } from '@/context/AuthContext';
import { getQuiz, updateQuiz, createQuestion } from '@/lib/firestore-service';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronUp,
  Search, Check, Loader2, BookOpen, Save, Eye, Timer, Target,
  RefreshCw, Shuffle, MessageSquare, ShieldCheck, PenLine, Sparkles, ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Mission, QuizDifficulty, Question, AssessmentConfig, FeedbackMode, QuestionType } from '@/lib/types-scalable';
import { DEFAULT_ASSESSMENT_CONFIG } from '@/lib/types-scalable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import Link from 'next/link';

interface MissionDraft {
  id: string;
  title: string;
  narrative: string;
  description: string;
  maxErrors: number;
  bonusPoints: number;
  questionIds: string[];
  expanded: boolean;
}

function createEmptyMission(order: number): MissionDraft {
  return {
    id: crypto.randomUUID(),
    title: `Misión ${order + 1}`,
    narrative: '',
    description: '',
    maxErrors: 2,
    bonusPoints: 10,
    questionIds: [],
    expanded: true,
  };
}

// ─── Quick inline question creation ─────────────────────────────────────────

interface QuickCreateDialogProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  userId: string;
  onCreated: (questionId: string, questionText: string) => void;
}

function QuickCreateDialog({ open, onClose, productId, userId, onCreated }: QuickCreateDialogProps) {
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState('');
  const [type, setType] = useState<QuestionType>('single_choice');
  const [options, setOptions] = useState([
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [explanation, setExplanation] = useState('');

  const reset = () => {
    setText(''); setType('single_choice'); setDifficulty('medium'); setExplanation('');
    setOptions([
      { text: '', isCorrect: false }, { text: '', isCorrect: false },
      { text: '', isCorrect: false }, { text: '', isCorrect: false },
    ]);
  };

  const handleTypeChange = (newType: QuestionType) => {
    setType(newType);
    if (newType === 'true_false') {
      setOptions([{ text: 'Verdadero', isCorrect: false }, { text: 'Falso', isCorrect: false }]);
    } else if (newType !== type) {
      setOptions([{ text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }]);
    }
  };

  const setOptionCorrect = (idx: number, val: boolean) => {
    setOptions(prev => prev.map((o, i) => {
      if (type === 'single_choice' || type === 'true_false') {
        return { ...o, isCorrect: i === idx ? val : false };
      }
      return i === idx ? { ...o, isCorrect: val } : o;
    }));
  };

  const handleSave = async () => {
    if (!text.trim()) return;
    const validOpts = options.filter(o => o.text.trim());
    const correctOpts = validOpts.filter(o => o.isCorrect);
    if (type !== 'open_text' && correctOpts.length === 0) return;
    setSaving(true);
    try {
      const id = await createQuestion({
        organizationId: 'aviva-credito',
        productId,
        text: text.trim(),
        explanation: explanation.trim() || undefined,
        type,
        difficulty,
        options: validOpts.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i })),
        tags: [],
        active: true,
        isTricky: type === 'tricky',
      }, userId);
      onCreated(id, text.trim());
      reset();
      onClose();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const TYPE_OPTS: { value: QuestionType; label: string }[] = [
    { value: 'single_choice', label: 'Una respuesta' },
    { value: 'multiple_choice', label: 'Múltiple' },
    { value: 'true_false', label: 'V / F' },
    { value: 'open_text', label: 'Abierta' },
    { value: 'tricky', label: 'Tricky ⚡' },
  ];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Crear pregunta rápida
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex gap-1.5 flex-wrap">
            {TYPE_OPTS.map(t => (
              <button key={t.value} type="button" onClick={() => handleTypeChange(t.value)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-all ${type === t.value ? 'border-primary bg-primary text-white' : 'border-muted-foreground/30 hover:border-primary/50'}`}>
                {t.label}
              </button>
            ))}
            <Select value={difficulty} onValueChange={v => setDifficulty(v as typeof difficulty)}>
              <SelectTrigger className="h-6 text-xs w-24 ml-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Fácil</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="hard">Difícil</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Textarea
            placeholder="Escribe la pregunta..."
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            className="text-sm"
          />

          {type !== 'open_text' && type !== 'true_false' && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">Opciones — activa la(s) correcta(s):</p>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Switch checked={opt.isCorrect} onCheckedChange={v => setOptionCorrect(i, v)} />
                  <Input
                    value={opt.text}
                    onChange={e => setOptions(prev => prev.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                    placeholder={`Opción ${i + 1}`}
                    className="h-8 text-sm flex-1"
                  />
                </div>
              ))}
            </div>
          )}

          {type === 'true_false' && (
            <div className="flex gap-2">
              {['Verdadero', 'Falso'].map((val, i) => (
                <button key={val} type="button" onClick={() => setOptionCorrect(i, true)}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${options[i]?.isCorrect ? 'border-primary bg-primary/10 text-primary' : 'border-muted hover:border-primary/30'}`}>
                  {val === 'Verdadero' ? '✓ Verdadero' : '✗ Falso'}
                </button>
              ))}
            </div>
          )}

          {type === 'open_text' && (
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
              <PenLine className="h-4 w-4 shrink-0 mt-0.5" />
              Respuesta abierta. Puedes editar los conceptos clave desde el Banco de Preguntas después.
            </div>
          )}

          <Input
            value={explanation}
            onChange={e => setExplanation(e.target.value)}
            placeholder="Explicación (opcional)"
            className="h-8 text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !text.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Crear y agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionSelector({
  productId,
  selectedIds,
  onToggle,
  onSetAll,
  userId,
  onQuickCreate,
}: {
  productId: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSetAll: (ids: string[]) => void;
  userId: string;
  onQuickCreate: (id: string) => void;
}) {
  const { questions, refresh } = useQuestions(productId || undefined);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDiff, setFilterDiff] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const categories = Array.from(new Set(questions.map((q) => q.category).filter(Boolean))) as string[];

  const filtered = questions.filter((q) => {
    const matchSearch =
      q.text.toLowerCase().includes(search.toLowerCase()) ||
      (q.category || '').toLowerCase().includes(search.toLowerCase());
    const matchDiff = filterDiff === 'all' || q.difficulty === filterDiff;
    const matchCategory = filterCategory === 'all' || q.category === filterCategory;
    return matchSearch && matchDiff && matchCategory;
  });

  const filteredIds = filtered.map((q) => q.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  const handleSelectAll = () => {
    const newIds = Array.from(new Set([...selectedIds, ...filteredIds]));
    onSetAll(newIds);
  };

  const handleDeselectAll = () => {
    onSetAll(selectedIds.filter((id) => !filteredIds.includes(id)));
  };

  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <QuickCreateDialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        productId={productId}
        userId={userId}
        onCreated={(id, _text) => {
          refresh();
          onQuickCreate(id);
        }}
      />

      <div className="flex gap-2 mb-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs shrink-0 border-primary/40 text-primary hover:bg-primary/10"
          onClick={() => setQuickCreateOpen(true)}
          disabled={!productId}
        >
          <Sparkles className="h-3.5 w-3.5" /> Crear pregunta
        </Button>
      </div>
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar pregunta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={filterDiff} onValueChange={setFilterDiff}>
          <SelectTrigger className="w-24 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Dificultad</SelectItem>
            <SelectItem value="easy">Fácil</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="hard">Difícil</SelectItem>
          </SelectContent>
        </Select>
        {categories.length > 0 && (
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Categoría</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={allFilteredSelected ? handleDeselectAll : handleSelectAll}
          >
            <Check className="h-3 w-3" />
            {allFilteredSelected ? 'Deseleccionar visibles' : `Seleccionar todas (${filtered.length})`}
          </Button>
        </div>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {productId ? 'No hay preguntas para este producto' : 'Selecciona un producto primero'}
          </p>
        ) : (
          filtered.map((q) => {
            const isSelected = selectedIds.includes(q.id);
            return (
              <div
                key={q.id}
                onClick={() => onToggle(q.id)}
                className={cn(
                  'flex items-start gap-2 p-2 rounded cursor-pointer text-sm transition-colors',
                  isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'
                )}
              >
                <div
                  className={cn(
                    'h-4 w-4 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                    isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'
                  )}
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="line-clamp-2 leading-snug">{q.text}</p>
                  <div className="flex gap-1 mt-0.5">
                    <span
                      className={cn(
                        'text-[10px] px-1 rounded',
                        q.difficulty === 'easy'
                          ? 'bg-green-100 text-green-700'
                          : q.difficulty === 'hard'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      )}
                    >
                      {q.difficulty}
                    </span>
                    {q.category && (
                      <span className="text-[10px] px-1 rounded bg-blue-100 text-blue-700">
                        {q.category}
                      </span>
                    )}
                    {q.isTricky && (
                      <span className="text-[10px] px-1 rounded bg-purple-100 text-purple-700">
                        tricky
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
        {selectedIds.length} preguntas seleccionadas · {filtered.length} visibles de {questions.length} totales
      </div>
    </div>
  );
}

export default function EditQuizPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.quizId as string;
  const { profile } = useAuth();
  const { products } = useProducts();

  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assessmentConfig, setAssessmentConfig] = useState<AssessmentConfig>({ ...DEFAULT_ASSESSMENT_CONFIG });
  const [formData, setFormData] = useState({
    productId: '',
    title: '',
    description: '',
    difficulty: 'medium' as QuizDifficulty,
    estimatedDuration: 30,
    tags: [] as string[],
    tagsInput: '',
  });
  const [missions, setMissions] = useState<MissionDraft[]>([createEmptyMission(0)]);

  // Load quiz data on mount
  useEffect(() => {
    if (!quizId) return;
    setLoadingQuiz(true);
    getQuiz(quizId).then(quiz => {
      if (!quiz) {
        toast({ title: 'Evaluación no encontrada', variant: 'destructive' });
        router.push('/admin/quizzes');
        return;
      }
      setFormData({
        productId: quiz.productId,
        title: quiz.title,
        description: quiz.description || '',
        difficulty: quiz.difficulty,
        estimatedDuration: quiz.estimatedDuration,
        tags: quiz.tags || [],
        tagsInput: '',
      });
      if (quiz.assessmentConfig) {
        setAssessmentConfig(quiz.assessmentConfig);
      }
      if (quiz.missions && quiz.missions.length > 0) {
        setMissions(quiz.missions.map(m => ({
          id: m.id,
          title: m.title,
          narrative: m.narrative || '',
          description: m.description || '',
          maxErrors: m.maxErrors,
          bonusPoints: m.bonusPoints,
          questionIds: m.questionIds,
          expanded: false,
        })));
      }
    }).finally(() => setLoadingQuiz(false));
  }, [quizId, router]);

  const setField = (key: string, value: any) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const addMission = () => {
    setMissions((prev) => [...prev, createEmptyMission(prev.length)]);
  };

  const removeMission = (id: string) => {
    setMissions((prev) => prev.filter((m) => m.id !== id));
  };

  const moveMission = (id: string, dir: -1 | 1) => {
    setMissions((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx + dir < 0 || idx + dir >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
      return arr;
    });
  };

  const updateMission = (id: string, updates: Partial<MissionDraft>) => {
    setMissions((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  };

  const toggleQuestion = (missionId: string, questionId: string) => {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== missionId) return m;
        const exists = m.questionIds.includes(questionId);
        return {
          ...m,
          questionIds: exists
            ? m.questionIds.filter((id) => id !== questionId)
            : [...m.questionIds, questionId],
        };
      })
    );
  };

  const setMissionQuestions = (missionId: string, questionIds: string[]) => {
    setMissions((prev) =>
      prev.map((m) => (m.id === missionId ? { ...m, questionIds } : m))
    );
  };

  const handleAddTag = () => {
    const tag = formData.tagsInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      setField('tags', [...formData.tags, tag]);
    }
    setField('tagsInput', '');
  };

  const totalQuestions = missions.reduce((sum, m) => sum + m.questionIds.length, 0);

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: 'El título es obligatorio', variant: 'destructive' });
      return;
    }
    if (!formData.productId) {
      toast({ title: 'Selecciona un producto', variant: 'destructive' });
      return;
    }
    if (missions.some((m) => m.questionIds.length === 0)) {
      toast({ title: 'Cada misión debe tener al menos una pregunta', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const quizMissions: Mission[] = missions.map((m, i) => ({
        id: m.id,
        title: m.title,
        narrative: m.narrative,
        description: m.description,
        order: i,
        questionIds: m.questionIds,
        maxErrors: m.maxErrors,
        bonusPoints: m.bonusPoints,
      }));

      await updateQuiz(quizId, {
        productId: formData.productId,
        title: formData.title,
        description: formData.description,
        difficulty: formData.difficulty,
        estimatedDuration: formData.estimatedDuration,
        missions: quizMissions,
        totalQuestions,
        tags: formData.tags,
        assessmentConfig,
      });

      toast({ title: 'Evaluación actualizada' });
      router.push('/admin/quizzes');
    } catch (err: any) {
      toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loadingQuiz) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/quizzes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Editar Evaluación</h1>
            <p className="text-muted-foreground mt-1">Modifica el contenido y configuración de la evaluación</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2" size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Cambios
        </Button>
      </div>

      {/* Quiz Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Información de la Evaluación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Ej: Certificación Promotores BA"
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Describe el contenido y objetivos del quiz..."
                rows={2}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Producto *</Label>
              <Select value={formData.productId} onValueChange={(v) => setField('productId', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecciona producto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dificultad</Label>
              <Select
                value={formData.difficulty}
                onValueChange={(v) => setField('difficulty', v as QuizDifficulty)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Fácil</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="hard">Difícil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duración estimada (min)</Label>
              <Input
                type="number"
                min={5}
                max={180}
                value={formData.estimatedDuration}
                onChange={(e) => setField('estimatedDuration', parseInt(e.target.value) || 30)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Etiquetas</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={formData.tagsInput}
                  onChange={(e) => setField('tagsInput', e.target.value)}
                  placeholder="Agregar etiqueta..."
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                />
                <Button variant="outline" onClick={handleAddTag} type="button">+</Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {formData.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => setField('tags', formData.tags.filter((x) => x !== t))}
                    >
                      {t} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assessment Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Configuración de Evaluación
          </CardTitle>
          <CardDescription>Define las reglas del motor de evaluación para este desafío</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Timer className="h-4 w-4 text-orange-500" /> Tiempo límite (minutos)
              </Label>
              <Input
                type="number"
                min={0}
                max={180}
                value={assessmentConfig.timeLimit > 0 ? Math.round(assessmentConfig.timeLimit / 60) : ''}
                onChange={e => {
                  const mins = parseInt(e.target.value) || 0;
                  setAssessmentConfig(prev => ({ ...prev, timeLimit: mins * 60 }));
                }}
                placeholder="0 = sin límite"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">0 = sin límite de tiempo</p>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Target className="h-4 w-4 text-emerald-500" /> Puntuación mínima (%)
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={assessmentConfig.passingScore || ''}
                onChange={e => setAssessmentConfig(prev => ({ ...prev, passingScore: parseInt(e.target.value) || 0 }))}
                placeholder="0 = no aplica"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">% mínimo para aprobar. 0 = no aplica</p>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <RefreshCw className="h-4 w-4 text-blue-500" /> Intentos máximos
              </Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={assessmentConfig.maxAttempts || ''}
                onChange={e => setAssessmentConfig(prev => ({ ...prev, maxAttempts: parseInt(e.target.value) || 0 }))}
                placeholder="0 = ilimitados"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">0 = intentos ilimitados</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <MessageSquare className="h-4 w-4 text-purple-500" /> Mostrar feedback
            </Label>
            <div className="flex gap-2 flex-wrap">
              {([
                ['always', 'Inmediato (por pregunta)'],
                ['after_attempt', 'Al terminar el intento'],
                ['never', 'No mostrar'],
              ] as [FeedbackMode, string][]).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAssessmentConfig(prev => ({ ...prev, showFeedback: val }))}
                  className={`px-3 py-1.5 text-sm rounded-lg border-2 transition-all ${
                    assessmentConfig.showFeedback === val
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-muted hover:border-primary/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                key: 'randomizeQuestions' as const,
                label: 'Aleatorizar orden de preguntas',
                description: 'Cada intento tendrá las preguntas en orden diferente',
                icon: Shuffle,
              },
              {
                key: 'randomizeOptions' as const,
                label: 'Aleatorizar opciones de respuesta',
                description: 'Las opciones de cada pregunta se mezclarán aleatoriamente',
                icon: Shuffle,
              },
              {
                key: 'allowRetry' as const,
                label: 'Permitir reintento al reprobar',
                description: 'El vendedor puede volver a intentar si no alcanza el mínimo',
                icon: RefreshCw,
              },
              {
                key: 'isStandalone' as const,
                label: 'Examen independiente',
                description: 'Aparece en el catálogo sin necesitar pertenecer a una ruta',
                icon: BookOpen,
              },
            ].map(({ key, label, description, icon: Icon }) => (
              <div key={key} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                <Switch
                  checked={assessmentConfig[key] as boolean}
                  onCheckedChange={v => setAssessmentConfig(prev => ({ ...prev, [key]: v }))}
                />
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats bar */}
      <div className="flex gap-6 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <BookOpen className="h-4 w-4 text-primary" />
          {missions.length} misiones
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <Eye className="h-4 w-4 text-primary" />
          {totalQuestions} preguntas en total
        </span>
      </div>

      {/* Missions */}
      <div className="space-y-4">
        {missions.map((mission, idx) => (
          <Card key={mission.id} className="border-2 transition-colors hover:border-primary/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <Input
                    value={mission.title}
                    onChange={(e) => updateMission(mission.id, { title: e.target.value })}
                    className="font-semibold text-base border-0 px-0 focus-visible:ring-0 h-auto"
                    placeholder="Título de la misión"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveMission(mission.id, -1)}
                    disabled={idx === 0}
                    className="h-7 w-7"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveMission(mission.id, 1)}
                    disabled={idx === missions.length - 1}
                    className="h-7 w-7"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateMission(mission.id, { expanded: !mission.expanded })}
                    className="h-7 w-7"
                  >
                    {mission.expanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMission(mission.id)}
                    disabled={missions.length === 1}
                    className="h-7 w-7 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground ml-11">
                <span>{mission.questionIds.length} preguntas</span>
                <span>Max {mission.maxErrors} errores</span>
              </div>
            </CardHeader>

            {mission.expanded && (
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label className="text-xs">Narrativa (texto introductorio)</Label>
                    <Textarea
                      value={mission.narrative}
                      onChange={(e) => updateMission(mission.id, { narrative: e.target.value })}
                      placeholder="Describe la historia o contexto de esta misión..."
                      rows={2}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Máx. errores permitidos</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={mission.maxErrors}
                      onChange={(e) =>
                        updateMission(mission.id, { maxErrors: parseInt(e.target.value) || 2 })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Puntos bonus (sin errores)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={mission.bonusPoints}
                      onChange={(e) =>
                        updateMission(mission.id, { bonusPoints: parseInt(e.target.value) || 0 })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Preguntas de esta misión</Label>
                  <QuestionSelector
                    productId={formData.productId}
                    selectedIds={mission.questionIds}
                    onToggle={(qId) => toggleQuestion(mission.id, qId)}
                    onSetAll={(ids) => setMissionQuestions(mission.id, ids)}
                    userId={profile?.uid || ''}
                    onQuickCreate={(id) => toggleQuestion(mission.id, id)}
                  />
                </div>
              </CardContent>
            )}
          </Card>
        ))}

        <Button variant="outline" onClick={addMission} className="w-full gap-2 border-dashed">
          <Plus className="h-4 w-4" /> Agregar Misión
        </Button>
      </div>

      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => router.push('/admin/quizzes')}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[140px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Cambios
        </Button>
      </div>
    </div>
  );
}
