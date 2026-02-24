'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useQuestions } from '@/hooks/use-firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  HelpCircle,
  Upload,
  ArrowRight,
  BookOpen,
  AlertCircle,
  Pencil,
  Trash2,
  Plus,
  Save,
  X,
  DatabaseZap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PulseCategory } from '@/lib/types-scalable';
import {
  getPulseCategories,
  savePulseCategory,
  deletePulseCategory,
  seedDefaultCategoriesIfEmpty,
} from '@/lib/firestore-service';

// ── Color presets ──────────────────────────────────────────────────────────

type ColorPreset = {
  label: string;
  color: string;
  dotColor: string;
};

const COLOR_PRESETS: Record<string, ColorPreset> = {
  blue:   { color: 'bg-blue-500/10 border-blue-200 text-blue-700',     dotColor: 'bg-blue-500',   label: 'Azul' },
  green:  { color: 'bg-green-500/10 border-green-200 text-green-700',   dotColor: 'bg-green-500',  label: 'Verde' },
  purple: { color: 'bg-purple-500/10 border-purple-200 text-purple-700', dotColor: 'bg-purple-500', label: 'Morado' },
  orange: { color: 'bg-orange-500/10 border-orange-200 text-orange-700', dotColor: 'bg-orange-500', label: 'Naranja' },
  red:    { color: 'bg-red-500/10 border-red-200 text-red-700',          dotColor: 'bg-red-500',    label: 'Rojo' },
  yellow: { color: 'bg-yellow-500/10 border-yellow-200 text-yellow-700', dotColor: 'bg-yellow-500', label: 'Amarillo' },
  pink:   { color: 'bg-pink-500/10 border-pink-200 text-pink-700',       dotColor: 'bg-pink-500',   label: 'Rosa' },
  teal:   { color: 'bg-teal-500/10 border-teal-200 text-teal-700',       dotColor: 'bg-teal-500',   label: 'Verde azulado' },
};

const DOT_COLORS: Record<string, string> = {
  'bg-blue-500':   'bg-blue-500',
  'bg-green-500':  'bg-green-500',
  'bg-purple-500': 'bg-purple-500',
  'bg-orange-500': 'bg-orange-500',
  'bg-red-500':    'bg-red-500',
  'bg-yellow-500': 'bg-yellow-500',
  'bg-pink-500':   'bg-pink-500',
  'bg-teal-500':   'bg-teal-500',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function findPresetKey(color: string): string {
  return Object.entries(COLOR_PRESETS).find(([, p]) => p.color === color)?.[0] ?? 'blue';
}

// ── Empty form state ───────────────────────────────────────────────────────

type FormState = {
  emoji: string;
  name: string;
  key: string;
  description: string;
  colorPreset: string;
  order: number;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  emoji: '',
  name: '',
  key: '',
  description: '',
  colorPreset: 'blue',
  order: 0,
  active: true,
};

// ── Component ──────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { questions, loading: questionsLoading } = useQuestions();

  const [categories, setCategories] = useState<PulseCategory[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<PulseCategory | null>(null); // null = create
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Load categories from Firestore
  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    try {
      await seedDefaultCategoriesIfEmpty();
      const cats = await getPulseCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Error loading categories:', err);
    } finally {
      setCatLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Open dialog for creating a new category
  function openCreate() {
    setEditingCat(null);
    setForm({ ...EMPTY_FORM, order: categories.length });
    setDialogOpen(true);
  }

  // Open dialog for editing an existing category
  function openEdit(cat: PulseCategory) {
    setEditingCat(cat);
    setForm({
      emoji: cat.emoji,
      name: cat.name,
      key: cat.key,
      description: cat.description,
      colorPreset: findPresetKey(cat.color),
      order: cat.order,
      active: cat.active,
    });
    setDialogOpen(true);
  }

  // Auto-generate key slug from name (only when creating)
  function handleNameChange(value: string) {
    setForm(prev => ({
      ...prev,
      name: value,
      key: editingCat ? prev.key : slugify(value),
    }));
  }

  // Save (create or update)
  async function handleSave() {
    const preset = COLOR_PRESETS[form.colorPreset] ?? COLOR_PRESETS.blue;
    const payload: Omit<PulseCategory, 'id'> = {
      key: form.key.trim(),
      name: form.name.trim(),
      emoji: form.emoji.trim(),
      description: form.description.trim(),
      color: preset.color,
      dotColor: preset.dotColor,
      order: form.order,
      active: form.active,
    };
    setSaving(true);
    try {
      await savePulseCategory(payload, editingCat?.id);
      setDialogOpen(false);
      await loadCategories();
    } catch (err) {
      console.error('Error saving category:', err);
    } finally {
      setSaving(false);
    }
  }

  // Delete a category
  async function handleDelete(id: string) {
    setSaving(true);
    try {
      await deletePulseCategory(id);
      setDeleteConfirmId(null);
      await loadCategories();
    } catch (err) {
      console.error('Error deleting category:', err);
    } finally {
      setSaving(false);
    }
  }

  // Seed base questions
  async function handleSeedQuestions() {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await fetch('/api/pulse/seed-questions', { method: 'POST' });
      const data = await res.json() as { message?: string; error?: string };
      setSeedResult(data.message ?? data.error ?? 'Listo');
    } catch {
      setSeedResult('Error al cargar preguntas');
    } finally {
      setSeeding(false);
    }
  }

  // Stats per category
  const loading = catLoading || questionsLoading;

  const categoryStats = categories.map(cat => {
    const qs = questions.filter(q => q.module === cat.key);
    const withRate = qs.filter(q => q.averageCorrectRate > 0);
    const avgCorrect = withRate.length > 0
      ? Math.round(withRate.reduce((s, q) => s + q.averageCorrectRate, 0) / withRate.length)
      : null;
    return { cat, count: qs.length, avgCorrect };
  });

  const totalWithModule = questions.filter(q => q.module).length;
  const emptyCategories = categoryStats.filter(s => s.count === 0).length;
  const maxCount = Math.max(...categoryStats.map(s => s.count), 1);

  const isFormValid = form.name.trim().length > 0 && form.key.trim().length > 0 && form.emoji.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-primary" /> Categorias del Pulso
          </h1>
          <p className="text-muted-foreground mt-1">
            Categorias temáticas del cuestionario diario. Cada categoría agrupa preguntas
            que el sistema mezcla automáticamente en el Pulso de Conocimiento.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <Button variant="outline" onClick={handleSeedQuestions} disabled={seeding}>
            <DatabaseZap className="h-4 w-4 mr-2" />
            {seeding ? 'Cargando...' : 'Cargar preguntas base'}
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/import">
              <Upload className="h-4 w-4 mr-2" /> Importar preguntas
            </Link>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Agregar categoría
          </Button>
        </div>
      </div>

      {/* Seed result banner */}
      {seedResult && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          <DatabaseZap className="h-4 w-4 shrink-0" />
          <span>{seedResult}</span>
          <button onClick={() => setSeedResult(null)} className="ml-auto text-green-600 hover:text-green-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary strip */}
      {loading ? (
        <div className="flex gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-full" />)}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="px-3 py-1 rounded-full bg-muted font-medium">
            {questions.length} preguntas en total
          </span>
          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
            {totalWithModule} asignadas a módulo
          </span>
          <span className="px-3 py-1 rounded-full bg-muted font-medium">
            {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'}
          </span>
          {emptyCategories > 0 && (
            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 font-medium flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {emptyCategories} {emptyCategories === 1 ? 'categoría vacía' : 'categorías vacías'}
            </span>
          )}
        </div>
      )}

      {/* Category grid */}
      {catLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categoryStats.map(({ cat, count, avgCorrect }) => {
            const isEmpty = count === 0;
            return (
              <Card
                key={cat.id}
                className={cn(
                  'border-2 transition-shadow hover:shadow-md',
                  isEmpty ? 'border-dashed border-muted-foreground/30' : 'border-transparent'
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-2xl shrink-0">{cat.emoji}</span>
                      <CardTitle className="text-base leading-tight truncate">
                        {cat.name}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isEmpty ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                          Vacía
                        </Badge>
                      ) : (
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold border', cat.color)}>
                          {count} preguntas
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(cat)}
                        title="Editar categoría"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmId(cat.id)}
                        title="Eliminar categoría"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-xs mt-1">{cat.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Stats row */}
                  {questionsLoading ? (
                    <Skeleton className="h-10" />
                  ) : (
                    <div className="flex gap-3">
                      <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-center">
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-[10px] text-muted-foreground">preguntas</p>
                      </div>
                      <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-center">
                        <p className={cn(
                          'text-2xl font-bold',
                          avgCorrect === null
                            ? 'text-muted-foreground'
                            : avgCorrect >= 70
                              ? 'text-green-600'
                              : 'text-orange-500'
                        )}>
                          {avgCorrect !== null ? `${avgCorrect}%` : '—'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">% aciertos</p>
                      </div>
                    </div>
                  )}

                  {/* Progress bar */}
                  {!questionsLoading && !isEmpty && (
                    <div className="space-y-1">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', cat.dotColor)}
                          style={{ width: `${Math.min(100, Math.round((count / maxCount) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    {!isEmpty && (
                      <Button asChild variant="outline" size="sm" className="flex-1">
                        <Link href={`/admin/questions?module=${cat.key}`}>
                          <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                          Ver preguntas
                        </Link>
                      </Button>
                    )}
                    <Button
                      asChild
                      size="sm"
                      variant={isEmpty ? 'default' : 'ghost'}
                      className={cn(isEmpty ? 'flex-1' : '')}
                    >
                      <Link href={`/admin/import?module=${cat.key}`}>
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        {isEmpty ? 'Importar preguntas' : 'Importar'}
                      </Link>
                    </Button>
                    {isEmpty && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/questions?new=1&module=${cat.key}`}>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add category card */}
          <button
            onClick={openCreate}
            className="border-2 border-dashed border-muted-foreground/30 rounded-xl flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">Agregar categoría</span>
          </button>
        </div>
      )}

      {/* Info box */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Como funciona el Pulso?</p>
              <p>Cada día el sistema mezcla 7 preguntas automáticamente, distribuyéndolas entre todos los módulos disponibles. Cuantas más preguntas tenga cada categoría, más variado será el cuestionario diario y menos repetición verá el equipo.</p>
              <p className="mt-1">Se priorizan las preguntas con menor porcentaje de aciertos para reforzar los temas con más errores.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Emoji + Name row */}
            <div className="flex gap-3">
              <div className="w-20">
                <Label htmlFor="cat-emoji">Emoji</Label>
                <Input
                  id="cat-emoji"
                  value={form.emoji}
                  onChange={e => setForm(prev => ({ ...prev, emoji: e.target.value }))}
                  placeholder="💬"
                  className="text-center text-xl mt-1"
                  maxLength={4}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="cat-name">Nombre</Label>
                <Input
                  id="cat-name"
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Nombre de la categoría"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Key / Slug */}
            <div>
              <Label htmlFor="cat-key">
                Clave (slug)
                {editingCat && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">Solo lectura después de guardar</span>
                )}
              </Label>
              <Input
                id="cat-key"
                value={form.key}
                onChange={e => !editingCat && setForm(prev => ({ ...prev, key: slugify(e.target.value) }))}
                placeholder="nombre_slug"
                className="mt-1 font-mono text-sm"
                readOnly={!!editingCat}
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="cat-description">Descripción</Label>
              <textarea
                id="cat-description"
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Breve descripción del tema..."
                className="mt-1 flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                rows={3}
              />
            </div>

            {/* Color preset */}
            <div>
              <Label>Color</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, colorPreset: key }))}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-2 text-xs font-medium transition-all',
                      preset.color,
                      form.colorPreset === key
                        ? 'border-current ring-2 ring-current ring-offset-1'
                        : 'border-transparent hover:border-current/50'
                    )}
                  >
                    <span className={cn('w-3 h-3 rounded-full', preset.dotColor)} />
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Order */}
            <div>
              <Label htmlFor="cat-order">Orden</Label>
              <Input
                id="cat-order"
                type="number"
                min={0}
                value={form.order}
                onChange={e => setForm(prev => ({ ...prev, order: Number(e.target.value) }))}
                className="mt-1 w-24"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" type="button">
                <X className="h-4 w-4 mr-1.5" /> Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving || !isFormValid}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'Guardando...' : editingCat ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={open => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Eliminar categoría
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción es permanente. Las preguntas que ya tienen asignada esta categoría
            conservarán su clave, pero la categoría no aparecerá en la lista.
          </p>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" type="button">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              {saving ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
