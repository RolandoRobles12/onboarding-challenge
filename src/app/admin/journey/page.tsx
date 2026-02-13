'use client';

import { useState, useEffect } from 'react';
import { useProducts } from '@/hooks/use-firestore';
import { useAuth } from '@/context/AuthContext';
import { getQuizzes, getJourneyByProduct, saveJourney, deleteJourney } from '@/lib/firestore-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  Route, Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  FileText, HelpCircle, BarChart2, Award, Save, RefreshCw
} from 'lucide-react';
import type { Journey, JourneyStep, JourneyStepType } from '@/lib/types-scalable';
import type { Quiz } from '@/lib/types-scalable';

const STEP_TYPE_CONFIG: Record<JourneyStepType, { label: string; icon: React.ElementType; defaultTitle: string }> = {
  info_form: { label: 'Formulario de datos', icon: FileText, defaultTitle: 'Datos del vendedor' },
  quiz: { label: 'Quiz / Evaluación', icon: HelpCircle, defaultTitle: 'Evaluación de producto' },
  results: { label: 'Resultados', icon: BarChart2, defaultTitle: 'Ver resultados' },
  certificate: { label: 'Certificado', icon: Award, defaultTitle: 'Obtener certificado' },
};

function StepCard({
  step,
  index,
  total,
  quizzes,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: JourneyStep;
  index: number;
  total: number;
  quizzes: Quiz[];
  onUpdate: (s: JourneyStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const cfg = STEP_TYPE_CONFIG[step.type];
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-3 p-4 border rounded-lg bg-card">
      <div className="flex flex-col gap-1 pt-1">
        <button onClick={onMoveUp} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ChevronUp className="h-4 w-4" />
        </button>
        <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
        <button onClick={onMoveDown} disabled={index === total - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1.5">
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
      </div>

      <div className="flex-1 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de paso</Label>
            <Select value={step.type} onValueChange={(v) => onUpdate({ ...step, type: v as JourneyStepType, title: STEP_TYPE_CONFIG[v as JourneyStepType].defaultTitle, config: {} })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STEP_TYPE_CONFIG).map(([type, c]) => (
                  <SelectItem key={type} value={type}>
                    <span className="flex items-center gap-2">
                      <c.icon className="h-3.5 w-3.5" /> {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {step.type === 'quiz' && (
          <div className="space-y-1">
            <Label className="text-xs">Quiz asignado</Label>
            <Select
              value={step.config.quizId || ''}
              onValueChange={(v) => onUpdate({ ...step, config: { ...step.config, quizId: v } })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecciona un quiz..." />
              </SelectTrigger>
              <SelectContent>
                {quizzes.length === 0 ? (
                  <SelectItem value="none" disabled>No hay quizzes para este producto</SelectItem>
                ) : (
                  quizzes.map(q => (
                    <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

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

      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive mt-1" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function JourneyPage() {
  const { products, loading: loadingProducts } = useProducts();
  const { profile } = useAuth();
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [journeyName, setJourneyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
          // Default journey steps
          setSteps([
            { id: crypto.randomUUID(), type: 'info_form', order: 0, title: 'Datos del vendedor', required: true, config: {} },
            { id: crypto.randomUUID(), type: 'quiz', order: 1, title: 'Evaluación de producto', required: true, config: {} },
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
      type: 'quiz',
      order: steps.length,
      title: 'Nuevo paso',
      required: true,
      config: {},
    };
    setSteps([...steps, newStep]);
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
    if (!selectedProductId || !profile?.uid) return;
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
        profile.uid,
        journey?.id
      );
      toast({ title: 'Ruta guardada', description: 'La ruta del vendedor se guardó correctamente.' });
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Route className="h-6 w-6" /> Rutas del Vendedor
        </h1>
        <p className="text-muted-foreground">
          Define el journey que seguirá el vendedor para cada producto
        </p>
      </div>

      {/* Selector de Producto */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 max-w-sm">
            <Label>Selecciona el Producto</Label>
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
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
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

      {/* Journey Builder */}
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
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle>
                      {journey ? 'Editar Ruta' : 'Nueva Ruta'}
                    </CardTitle>
                    <CardDescription>
                      Arrastra para reordenar. Define qué pasos verá el vendedor al completar el producto.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {journey && (
                      <Button variant="outline" size="sm" className="text-destructive" onClick={handleDelete}>
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
                      <p>No hay pasos definidos. Agrega el primero.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {steps.map((step, index) => (
                        <StepCard
                          key={step.id}
                          step={step}
                          index={index}
                          total={steps.length}
                          quizzes={quizzes}
                          onUpdate={(s) => updateStep(index, s)}
                          onRemove={() => removeStep(index)}
                          onMoveUp={() => moveStep(index, 'up')}
                          onMoveDown={() => moveStep(index, 'down')}
                        />
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
