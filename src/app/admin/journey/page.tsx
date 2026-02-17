'use client';

import { useState, useEffect } from 'react';
import { useProducts } from '@/hooks/use-firestore';
import { useAuth } from '@/context/AuthContext';
import {
  getQuizzes,
  getJourneyByProduct,
  saveJourney,
  deleteJourney,
  getCertificateSigners,
  getCourses,
  getAllBadges,
} from '@/lib/firestore-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Route, Plus, Trash2, ChevronUp, ChevronDown,
  FileText, HelpCircle, BarChart2, Award, Save, RefreshCw,
  BookOpen, Swords, Medal, Info,
} from 'lucide-react';
import type { Journey, JourneyStep, JourneyStepType, CertificateSigner } from '@/lib/types-scalable';
import type { Quiz, Badge as BadgeType } from '@/lib/types-scalable';
import type { Course } from '@/lib/types-lms';

// ─── Step type configuration ────────────────────────────────────────────────

const STEP_TYPE_CONFIG: Record<JourneyStepType, {
  label: string;
  description: string;
  icon: React.ElementType;
  defaultTitle: string;
  color: string;
}> = {
  info_form: {
    label: 'Formulario de datos',
    description: 'Recopila información del vendedor al inicio',
    icon: FileText,
    defaultTitle: 'Datos del Jaguar Aviva',
    color: 'text-blue-600',
  },
  course: {
    label: 'Curso',
    description: 'Módulo de capacitación estructurado con lecciones',
    icon: BookOpen,
    defaultTitle: 'Módulo de capacitación',
    color: 'text-emerald-600',
  },
  challenge: {
    label: 'Desafío',
    description: 'Quiz gamificado con vidas y puntos',
    icon: Swords,
    defaultTitle: 'Desafío de producto',
    color: 'text-orange-600',
  },
  quiz: {
    label: 'Evaluación',
    description: 'Evaluación formal de conocimientos',
    icon: HelpCircle,
    defaultTitle: 'Evaluación de producto',
    color: 'text-purple-600',
  },
  results: {
    label: 'Resultados',
    description: 'Pantalla de resultados y retroalimentación',
    icon: BarChart2,
    defaultTitle: 'Ver resultados',
    color: 'text-cyan-600',
  },
  certificate: {
    label: 'Certificado',
    description: 'Emite un certificado de completación',
    icon: Award,
    defaultTitle: 'Obtener certificado',
    color: 'text-amber-600',
  },
  badge: {
    label: 'Insignia',
    description: 'Otorga una insignia al completar el paso',
    icon: Medal,
    defaultTitle: 'Obtener insignia',
    color: 'text-pink-600',
  },
};

// ─── StepCard ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  total,
  quizzes,
  courses,
  signers,
  badges,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: JourneyStep;
  index: number;
  total: number;
  quizzes: Quiz[];
  courses: Course[];
  signers: CertificateSigner[];
  badges: BadgeType[];
  onUpdate: (s: JourneyStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const cfg = STEP_TYPE_CONFIG[step.type];
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-3 p-4 border rounded-lg bg-card shadow-sm">
      {/* Reorder controls */}
      <div className="flex flex-col gap-1 pt-1">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground text-center font-mono">{index + 1}</span>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Step icon */}
      <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon className={`h-4 w-4 ${cfg.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3 min-w-0">
        {/* Type + Title row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de paso</Label>
            <Select
              value={step.type}
              onValueChange={(v) =>
                onUpdate({
                  ...step,
                  type: v as JourneyStepType,
                  title: STEP_TYPE_CONFIG[v as JourneyStepType].defaultTitle,
                  config: {},
                })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STEP_TYPE_CONFIG).map(([type, c]) => {
                  const StepIcon = c.icon;
                  return (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        <StepIcon className={`h-3.5 w-3.5 ${c.color}`} />
                        <span>{c.label}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{cfg.description}</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Título del paso</Label>
            <Input
              className="h-8 text-sm"
              value={step.title}
              onChange={(e) => onUpdate({ ...step, title: e.target.value })}
              placeholder={cfg.defaultTitle}
            />
          </div>
        </div>

        {/* Course selector */}
        {step.type === 'course' && (
          <div className="space-y-1">
            <Label className="text-xs">Curso asignado</Label>
            <Select
              value={step.config.courseId || ''}
              onValueChange={(v) => onUpdate({ ...step, config: { ...step.config, courseId: v } })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecciona un curso..." />
              </SelectTrigger>
              <SelectContent>
                {courses.length === 0 ? (
                  <SelectItem value="none" disabled>No hay cursos publicados</SelectItem>
                ) : (
                  courses
                    .filter(c => c.status === 'published')
                    .map(c => (
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
          </div>
        )}

        {/* Challenge / Quiz selector */}
        {(step.type === 'challenge' || step.type === 'quiz') && (
          <div className="space-y-1">
            <Label className="text-xs">
              {step.type === 'challenge' ? 'Desafío asignado' : 'Quiz asignado'}
            </Label>
            <Select
              value={step.config.quizId || ''}
              onValueChange={(v) => onUpdate({ ...step, config: { ...step.config, quizId: v } })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecciona un desafío..." />
              </SelectTrigger>
              <SelectContent>
                {quizzes.length === 0 ? (
                  <SelectItem value="none" disabled>No hay desafíos para este producto</SelectItem>
                ) : (
                  quizzes.map(q => (
                    <SelectItem key={q.id} value={q.id}>
                      <span className="flex items-center gap-2">
                        <Swords className="h-3.5 w-3.5 text-orange-600" />
                        {q.title}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Certificate signers */}
        {step.type === 'certificate' && (
          <div className="space-y-2">
            <Label className="text-xs">Firmantes del certificado (máx. 3)</Label>
            {signers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No hay firmantes activos. Créalos en{' '}
                <a href="/admin/certificados" className="underline text-primary">Certificados</a>.
              </p>
            ) : (
              <div className="space-y-1.5">
                {signers.map(signer => {
                  const selectedIds: string[] = step.config.signerIds ?? [];
                  const checked = selectedIds.includes(signer.id);
                  const atMax = selectedIds.length >= 3 && !checked;
                  return (
                    <label
                      key={signer.id}
                      className={`flex items-center gap-2.5 text-sm cursor-pointer rounded-md px-2 py-1.5 border transition-colors ${
                        checked ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
                      } ${atMax ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={checked}
                        disabled={atMax}
                        onChange={() => {
                          const next = checked
                            ? selectedIds.filter(id => id !== signer.id)
                            : [...selectedIds, signer.id];
                          onUpdate({ ...step, config: { ...step.config, signerIds: next } });
                        }}
                      />
                      <span className="font-medium">{signer.name}</span>
                      <span className="text-muted-foreground text-xs">— {signer.position}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Badge selector */}
        {step.type === 'badge' && (
          <div className="space-y-1">
            <Label className="text-xs">Insignia a otorgar</Label>
            <Select
              value={step.config.badgeId || ''}
              onValueChange={(v) => onUpdate({ ...step, config: { ...step.config, badgeId: v } })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecciona una insignia..." />
              </SelectTrigger>
              <SelectContent>
                {badges.length === 0 ? (
                  <SelectItem value="none" disabled>No hay insignias activas</SelectItem>
                ) : (
                  badges
                    .filter(b => b.active)
                    .map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span>{b.emoji}</span>
                          {b.name}
                        </span>
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Score mínimo (para cursos y desafíos) */}
        {(step.type === 'course' || step.type === 'challenge' || step.type === 'quiz') && (
          <div className="space-y-1">
            <Label className="text-xs">Score mínimo para avanzar (%)</Label>
            <Input
              className="h-8 text-sm w-32"
              type="number"
              min={0}
              max={100}
              value={step.config.minimumScore ?? ''}
              onChange={(e) =>
                onUpdate({
                  ...step,
                  config: {
                    ...step.config,
                    minimumScore: e.target.value ? parseInt(e.target.value) : undefined,
                  },
                })
              }
              placeholder="Ej: 70"
            />
            <p className="text-[11px] text-muted-foreground">Deja vacío para no requerir mínimo</p>
          </div>
        )}

        {/* Required */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`req-${step.id}`}
            checked={step.required}
            onChange={(e) => onUpdate({ ...step, required: e.target.checked })}
            className="h-3.5 w-3.5"
          />
          <Label htmlFor={`req-${step.id}`} className="text-xs font-normal">Paso obligatorio</Label>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive mt-1 shrink-0"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function JourneyPage() {
  const { products, loading: loadingProducts } = useProducts();
  const { profile } = useAuth();

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [signers, setSigners] = useState<CertificateSigner[]>([]);
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [journeyName, setJourneyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load global resources (not per-product)
  useEffect(() => {
    // getCertificateSigners only returns active signers — deleted ones won't appear
    getCertificateSigners().then(setSigners).catch(() => setSigners([]));
    getCourses().then(setCourses).catch(() => setCourses([]));
    getAllBadges().then(setBadges).catch(() => setBadges([]));
  }, []);

  // Load product-specific data
  useEffect(() => {
    if (!selectedProductId) return;
    setLoading(true);

    async function load() {
      try {
        const [existingJourney, productQuizzes] = await Promise.all([
          getJourneyByProduct(selectedProductId),
          getQuizzes(selectedProductId, false),
        ]);

        if (existingJourney) {
          setJourney(existingJourney);
          setSteps([...existingJourney.steps].sort((a, b) => a.order - b.order));
          setJourneyName(existingJourney.name);
        } else {
          setJourney(null);
          setSteps([
            { id: crypto.randomUUID(), type: 'info_form', order: 0, title: 'Datos del Jaguar Aviva', required: true, config: {} },
            { id: crypto.randomUUID(), type: 'challenge', order: 1, title: 'Desafío de producto', required: true, config: {} },
            { id: crypto.randomUUID(), type: 'results', order: 2, title: 'Ver resultados', required: true, config: {} },
            { id: crypto.randomUUID(), type: 'certificate', order: 3, title: 'Obtener certificado', required: false, config: {} },
          ]);
          const product = products.find(p => p.id === selectedProductId);
          setJourneyName(`Ruta de ${product?.name || 'Producto'}`);
        }

        setQuizzes(productQuizzes);
      } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la ruta.' });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [selectedProductId, products]);

  const addStep = () => {
    const newStep: JourneyStep = {
      id: crypto.randomUUID(),
      type: 'challenge',
      order: steps.length,
      title: 'Nuevo paso',
      required: true,
      config: {},
    };
    setSteps([...steps, newStep]);
  };

  const insertStep = (afterIndex: number) => {
    const newStep: JourneyStep = {
      id: crypto.randomUUID(),
      type: 'challenge',
      order: afterIndex + 1,
      title: 'Nuevo paso',
      required: true,
      config: {},
    };
    const newSteps = [...steps];
    newSteps.splice(afterIndex + 1, 0, newStep);
    setSteps(newSteps);
  };

  const updateStep = (index: number, updated: JourneyStep) => {
    const newSteps = [...steps];
    newSteps[index] = updated;
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...steps];
    const target = direction === 'up' ? index - 1 : index + 1;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    setSteps(newSteps);
  };

  const handleSave = async () => {
    if (!selectedProductId) return;
    const userId = profile?.uid || 'admin';
    if (!journeyName.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ingresa un nombre para la ruta.' });
      return;
    }

    setSaving(true);
    try {
      const stepsWithOrder = steps.map((s, i) => ({ ...s, order: i }));
      await saveJourney(
        {
          organizationId: 'aviva-credito',
          productId: selectedProductId,
          name: journeyName,
          steps: stepsWithOrder,
          active: true,
        },
        userId,
        journey?.id
      );
      toast({ title: 'Ruta guardada', description: 'La ruta se guardó correctamente.' });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la ruta.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!journey?.id || !confirm('¿Eliminar esta ruta?')) return;
    try {
      await deleteJourney(journey.id);
      setJourney(null);
      setSteps([]);
      toast({ title: 'Ruta eliminada' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la ruta.' });
    }
  };

  // Step type summary for visual indicator
  const stepTypeCounts = steps.reduce(
    (acc, s) => ({ ...acc, [s.type]: (acc[s.type] || 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Route className="h-6 w-6" /> Rutas del Jaguar Aviva
        </h1>
        <p className="text-muted-foreground">
          Diseña el camino de aprendizaje del vendedor: combina formularios, cursos, desafíos y certificados
        </p>
      </div>

      {/* Concept info */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="py-3 flex gap-3 items-start">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Cada ruta está vinculada a un <strong>producto</strong>. Los pasos pueden ser:
            formularios de datos, <strong>cursos</strong> del LMS, <strong>desafíos</strong> gamificados,
            evaluaciones, resultados, insignias y certificados. El vendedor los recorre en el orden definido.
          </p>
        </CardContent>
      </Card>

      {/* Product selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 max-w-sm">
            <Label>Producto</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un producto..." />
              </SelectTrigger>
              <SelectContent>
                {loadingProducts ? (
                  <SelectItem value="loading" disabled>Cargando productos...</SelectItem>
                ) : products.length === 0 ? (
                  <SelectItem value="none" disabled>No hay productos creados</SelectItem>
                ) : (
                  products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Journey builder */}
      {selectedProductId && (
        <>
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Cargando ruta...</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="space-y-1">
                    <CardTitle>{journey ? 'Editar Ruta' : 'Nueva Ruta'}</CardTitle>
                    <CardDescription>
                      Define los pasos que verá el vendedor al recorrer este producto.
                    </CardDescription>
                    {/* Step type summary */}
                    {steps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(stepTypeCounts).map(([type, count]) => {
                          const cfg = STEP_TYPE_CONFIG[type as JourneyStepType];
                          if (!cfg) return null;
                          const StepIcon = cfg.icon;
                          return (
                            <Badge key={type} variant="secondary" className="text-xs gap-1">
                              <StepIcon className={`h-3 w-3 ${cfg.color}`} />
                              {count} {cfg.label}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {journey && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={handleDelete}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Eliminar ruta
                      </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Save className="h-4 w-4 mr-1" />
                      {saving ? 'Guardando...' : 'Guardar ruta'}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-sm">
                  <Label>Nombre de la ruta</Label>
                  <Input
                    value={journeyName}
                    onChange={(e) => setJourneyName(e.target.value)}
                    placeholder="Ej: Ruta Aviva Tu Compra"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Pasos del journey ({steps.length})</Label>
                  {steps.length === 0 ? (
                    <div className="border-2 border-dashed rounded-lg py-8 text-center text-muted-foreground">
                      <Route className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No hay pasos. Agrega el primero.</p>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      {steps.map((step, index) => (
                        <div key={step.id}>
                          <StepCard
                            step={step}
                            index={index}
                            total={steps.length}
                            quizzes={quizzes}
                            courses={courses}
                            signers={signers}
                            badges={badges}
                            onUpdate={(s) => updateStep(index, s)}
                            onRemove={() => removeStep(index)}
                            onMoveUp={() => moveStep(index, 'up')}
                            onMoveDown={() => moveStep(index, 'down')}
                          />
                          {/* Insert step connector */}
                          <div className="flex items-center gap-2 py-1 group">
                            <div className="flex-1 border-l-2 border-dashed border-muted ml-5 h-5" />
                            <button
                              onClick={() => insertStep(index)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 px-2 py-1 rounded-full border border-dashed border-muted hover:border-primary transition-all opacity-0 group-hover:opacity-100"
                              title="Insertar paso aquí"
                            >
                              <Plus className="h-3 w-3" /> Insertar paso aquí
                            </button>
                            <div className="flex-1 border-r-2 border-dashed border-muted mr-5 h-5" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button variant="outline" className="w-full" onClick={addStep}>
                    <Plus className="h-4 w-4 mr-2" /> Agregar paso
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
