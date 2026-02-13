'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProducts, useQuestions } from '@/hooks/use-firestore';
import { useAuth } from '@/context/AuthContext';
import { createQuiz } from '@/lib/firestore-service';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronUp,
  Search, Check, Loader2, BookOpen, Save, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Mission, QuizDifficulty, Question } from '@/lib/types-scalable';

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

function QuestionSelector({
  productId,
  selectedIds,
  onToggle,
}: {
  productId: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const { questions } = useQuestions(productId || undefined);
  const [search, setSearch] = useState('');
  const [filterDiff, setFilterDiff] = useState('all');

  const filtered = questions.filter((q) => {
    const matchSearch =
      q.text.toLowerCase().includes(search.toLowerCase()) ||
      (q.category || '').toLowerCase().includes(search.toLowerCase());
    const matchDiff = filterDiff === 'all' || q.difficulty === filterDiff;
    return matchSearch && matchDiff;
  });

  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <div className="flex gap-2 mb-3">
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
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="easy">Fácil</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="hard">Difícil</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
        {selectedIds.length} preguntas seleccionadas · {filtered.length} disponibles
      </div>
    </div>
  );
}

export default function NewQuizPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { products } = useProducts();

  const [saving, setSaving] = useState(false);
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

      await createQuiz(
        {
          organizationId: 'aviva-credito',
          productId: formData.productId,
          title: formData.title,
          description: formData.description,
          difficulty: formData.difficulty,
          estimatedDuration: formData.estimatedDuration,
          missions: quizMissions,
          totalQuestions,
          active: true,
          published: false,
          tags: formData.tags,
          order: 0,
          version: 1,
          createdBy: profile?.uid || '',
          gamificationConfig: {
            enableLives: true,
            maxLives: 3,
            enableBonusLives: true,
            pointsPerCorrectAnswer: 10,
            pointsPerTrickyQuestion: 20,
            penaltyPerError: 0,
            timeBonus: true,
            enableBadges: true,
            badgeIds: ['first_mission', 'perfectionist', 'speedster', 'no_errors'],
          },
        } as any,
        profile?.uid || ''
      );

      toast({ title: '✅ Quiz creado exitosamente' });
      router.push('/admin/quizzes');
    } catch (err: any) {
      toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Nuevo Quiz</h1>
          <p className="text-muted-foreground mt-1">Configura el quiz y organiza sus misiones</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2" size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Quiz
        </Button>
      </div>

      {/* Quiz Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Quiz</CardTitle>
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
        <Button variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[140px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Quiz
        </Button>
      </div>
    </div>
  );
}
