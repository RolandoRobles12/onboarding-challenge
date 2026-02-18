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
  getJourneyForms,
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
  BookOpen, Swords, Medal, Info, ListChecks, Pencil, X, ClipboardList,
} from 'lucide-react';
import type {
  Journey, JourneyStep, JourneyStepType, JourneyStage,
  ChecklistItem, CertificateSigner, JourneyForm,
} from '@/lib/types-scalable';
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
    label: 'Formulario',
    description: 'Recopila información o evaluación del vendedor',
    icon: FileText,
    defaultTitle: 'Formulario',
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
  checklist: {
    label: 'Lista de verificación',
    description: 'El vendedor confirma ítems antes de avanzar',
    icon: ListChecks,
    defaultTitle: 'Lista de verificación',
    color: 'text-indigo-600',
  },
};

const PURPOSE_EMOJI: Record<string, string> = {
  seller_data: '📋',
  experience_rating: '⭐',
  trainer_rating: '👨‍🏫',
  seller_evaluation: '📊',
  general: '📝',
};

// ─── ActionCard ───────────────────────────────────────────────────────────────

function ActionCard({
  action, index, total, quizzes, courses, signers, badges, forms,
  onUpdate, onRemove, onMoveUp, onMoveDown,
}: {
  action: JourneyStep;
  index: number;
  total: number;
  quizzes: Quiz[];
  courses: Course[];
  signers: CertificateSigner[];
  badges: BadgeType[];
  forms: JourneyForm[];
  onUpdate: (s: JourneyStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const cfg = STEP_TYPE_CONFIG[action.type];
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg bg-card shadow-sm ml-3">
      {/* Reorder controls */}
      <div className="flex flex-col gap-1 pt-1">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs text-muted-foreground text-center font-mono">{index + 1}</span>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Action icon */}
      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 space-y-2 min-w-0">
        {/* Type + Title row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de acción</Label>
            <Select
              value={action.type}
              onValueChange={(v) =>
                onUpdate({
                  ...action,
                  type: v as JourneyStepType,
                  title: STEP_TYPE_CONFIG[v as JourneyStepType].defaultTitle,
                  config: {},
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STEP_TYPE_CONFIG).map(([type, c]) => {
                  const StepIcon = c.icon;
                  return (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        <StepIcon className={`h-3 w-3 ${c.color}`} />
                        <span>{c.label}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground leading-tight">{cfg.description}</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Título de la acción</Label>
            <Input
              className="h-7 text-xs"
              value={action.title}
              onChange={(e) => onUpdate({ ...action, title: e.target.value })}
              placeholder={cfg.defaultTitle}
            />
          </div>
        </div>

        {/* info_form: formId picker */}
        {action.type === 'info_form' && (
          <div className="space-y-1">
            <Label className="text-xs">Formulario asignado</Label>
            <Select
              value={action.config.formId || '__none__'}
              onValueChange={(v) => onUpdate({
                ...action,
                config: { ...action.config, formId: v === '__none__' ? undefined : v },
              })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Selecciona un formulario..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground italic">Sin formulario asignado</span>
                </SelectItem>
                {forms.filter(f => f.active).length === 0 ? (
                  <SelectItem value="__empty__" disabled>
                    No hay formularios creados aún
                  </SelectItem>
                ) : (
                  forms.filter(f => f.active).map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="flex items-center gap-2">
                        <span>{PURPOSE_EMOJI[f.purpose] ?? '📝'}</span>
                        <span>{f.title}</span>
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {action.config.formId ? (
              (() => {
                const selectedForm = forms.find(f => f.id === action.config.formId);
                return selectedForm ? (
                  <p className="text-[10px] text-muted-foreground">
                    {selectedForm.description || `${selectedForm.fields.filter(f => f.type !== 'section_header').length} campos • Responde: ${selectedForm.respondent}`}
                  </p>
                ) : null;
              })()
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Crea formularios en{' '}
                <a href="/admin/forms" className="underline text-primary">Formularios</a>.
              </p>
            )}
          </div>
        )}

        {/* checklist: item builder */}
        {action.type === 'checklist' && (
          <div className="space-y-2">
            <Label className="text-xs">Ítems de verificación</Label>
            <div className="space-y-1.5">
              {(action.config.checklistItems || []).map((item, i) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={() => {
                      const items = [...(action.config.checklistItems || [])];
                      items[i] = { ...item, required: !item.required };
                      onUpdate({ ...action, config: { ...action.config, checklistItems: items } });
                    }}
                    className="h-3.5 w-3.5 accent-primary"
                    title="Obligatorio para avanzar"
                  />
                  <Input
                    value={item.text}
                    className="h-7 text-xs flex-1"
                    onChange={(e) => {
                      const items = [...(action.config.checklistItems || [])];
                      items[i] = { ...item, text: e.target.value };
                      onUpdate({ ...action, config: { ...action.config, checklistItems: items } });
                    }}
                    placeholder="Descripción del ítem..."
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() =>
                      onUpdate({
                        ...action,
                        config: {
                          ...action.config,
                          checklistItems: (action.config.checklistItems || []).filter((_, j) => j !== i),
                        },
                      })
                    }
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs border-dashed gap-1 text-muted-foreground"
                onClick={() => {
                  const newItem: ChecklistItem = { id: crypto.randomUUID(), text: '', required: true };
                  onUpdate({
                    ...action,
                    config: {
                      ...action.config,
                      checklistItems: [...(action.config.checklistItems || []), newItem],
                    },
                  });
                }}
              >
                <Plus className="h-3 w-3" /> Agregar ítem
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              El checkbox indica si el ítem es obligatorio para avanzar.
            </p>
          </div>
        )}

        {/* Course selector */}
        {action.type === 'course' && (
          <div className="space-y-1">
            <Label className="text-xs">Curso asignado</Label>
            <Select
              value={action.config.courseId || ''}
              onValueChange={(v) => onUpdate({ ...action, config: { ...action.config, courseId: v } })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Selecciona un curso..." />
              </SelectTrigger>
              <SelectContent>
                {courses.filter(c => c.status === 'published').length === 0 ? (
                  <SelectItem value="none" disabled>No hay cursos publicados</SelectItem>
                ) : (
                  courses
                    .filter(c => c.status === 'published')
                    .map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <BookOpen className="h-3 w-3 text-emerald-600" />
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
        {(action.type === 'challenge' || action.type === 'quiz') && (
          <div className="space-y-1">
            <Label className="text-xs">
              {action.type === 'challenge' ? 'Desafío asignado' : 'Quiz asignado'}
            </Label>
            <Select
              value={action.config.quizId || ''}
              onValueChange={(v) => onUpdate({ ...action, config: { ...action.config, quizId: v } })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Selecciona un desafío..." />
              </SelectTrigger>
              <SelectContent>
                {quizzes.length === 0 ? (
                  <SelectItem value="none" disabled>No hay desafíos para este producto</SelectItem>
                ) : (
                  quizzes.map(q => (
                    <SelectItem key={q.id} value={q.id}>
                      <span className="flex items-center gap-2">
                        <Swords className="h-3 w-3 text-orange-600" />
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
        {action.type === 'certificate' && (
          <div className="space-y-2">
            <Label className="text-xs">Firmantes del certificado (máx. 3)</Label>
            {signers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No hay firmantes activos. Créalos en{' '}
                <a href="/admin/certificados" className="underline text-primary">Certificados</a>.
              </p>
            ) : (
              <div className="space-y-1">
                {signers.map(signer => {
                  const selectedIds: string[] = action.config.signerIds ?? [];
                  const checked = selectedIds.includes(signer.id);
                  const atMax = selectedIds.length >= 3 && !checked;
                  return (
                    <label
                      key={signer.id}
                      className={`flex items-center gap-2 text-xs cursor-pointer rounded px-2 py-1 border transition-colors ${
                        checked ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
                      } ${atMax ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 accent-primary"
                        checked={checked}
                        disabled={atMax}
                        onChange={() => {
                          const next = checked
                            ? selectedIds.filter(id => id !== signer.id)
                            : [...selectedIds, signer.id];
                          onUpdate({ ...action, config: { ...action.config, signerIds: next } });
                        }}
                      />
                      <span className="font-medium">{signer.name}</span>
                      <span className="text-muted-foreground">— {signer.position}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Badge selector */}
        {action.type === 'badge' && (
          <div className="space-y-1">
            <Label className="text-xs">Insignia a otorgar</Label>
            <Select
              value={action.config.badgeId || ''}
              onValueChange={(v) => onUpdate({ ...action, config: { ...action.config, badgeId: v } })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Selecciona una insignia..." />
              </SelectTrigger>
              <SelectContent>
                {badges.filter(b => b.active).length === 0 ? (
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

        {/* Minimum score (for courses, challenges, quizzes) */}
        {(action.type === 'course' || action.type === 'challenge' || action.type === 'quiz') && (
          <div className="space-y-1">
            <Label className="text-xs">Score mínimo para avanzar (%)</Label>
            <Input
              className="h-7 text-xs w-24"
              type="number"
              min={0}
              max={100}
              value={action.config.minimumScore ?? ''}
              onChange={(e) =>
                onUpdate({
                  ...action,
                  config: {
                    ...action.config,
                    minimumScore: e.target.value ? parseInt(e.target.value) : undefined,
                  },
                })
              }
              placeholder="70"
            />
            <p className="text-[10px] text-muted-foreground">Deja vacío para no requerir mínimo</p>
          </div>
        )}

        {/* Required toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`req-${action.id}`}
            checked={action.required}
            onChange={(e) => onUpdate({ ...action, required: e.target.checked })}
            className="h-3 w-3"
          />
          <Label htmlFor={`req-${action.id}`} className="text-xs font-normal">Acción obligatoria</Label>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive mt-1 shrink-0 h-7 w-7"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─── StageCard ────────────────────────────────────────────────────────────────

const STAGE_COLORS = [
  { border: 'border-blue-200', bg: 'bg-blue-50/40', header: 'bg-blue-50 border-blue-200', num: 'bg-blue-100 text-blue-700' },
  { border: 'border-emerald-200', bg: 'bg-emerald-50/40', header: 'bg-emerald-50 border-emerald-200', num: 'bg-emerald-100 text-emerald-700' },
  { border: 'border-orange-200', bg: 'bg-orange-50/40', header: 'bg-orange-50 border-orange-200', num: 'bg-orange-100 text-orange-700' },
  { border: 'border-purple-200', bg: 'bg-purple-50/40', header: 'bg-purple-50 border-purple-200', num: 'bg-purple-100 text-purple-700' },
  { border: 'border-pink-200', bg: 'bg-pink-50/40', header: 'bg-pink-50 border-pink-200', num: 'bg-pink-100 text-pink-700' },
];

function StageCard({
  stage, stageIndex, totalStages, quizzes, courses, signers, badges, forms,
  onUpdate, onRemove, onMoveUp, onMoveDown,
}: {
  stage: JourneyStage;
  stageIndex: number;
  totalStages: number;
  quizzes: Quiz[];
  courses: Course[];
  signers: CertificateSigner[];
  badges: BadgeType[];
  forms: JourneyForm[];
  onUpdate: (s: JourneyStage) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(stage.title);
  const color = STAGE_COLORS[stageIndex % STAGE_COLORS.length];

  const saveTitle = () => {
    onUpdate({ ...stage, title: titleInput.trim() || stage.title });
    setEditingTitle(false);
  };

  const addAction = () => {
    const newAction: JourneyStep = {
      id: crypto.randomUUID(),
      type: 'challenge',
      order: stage.actions.length,
      title: 'Nueva acción',
      required: true,
      config: {},
    };
    onUpdate({ ...stage, actions: [...stage.actions, newAction] });
  };

  const insertAction = (afterIndex: number) => {
    const newAction: JourneyStep = {
      id: crypto.randomUUID(),
      type: 'challenge',
      order: afterIndex + 1,
      title: 'Nueva acción',
      required: true,
      config: {},
    };
    const newActions = [...stage.actions];
    newActions.splice(afterIndex + 1, 0, newAction);
    onUpdate({ ...stage, actions: newActions });
  };

  const updateAction = (index: number, updated: JourneyStep) => {
    const newActions = [...stage.actions];
    newActions[index] = updated;
    onUpdate({ ...stage, actions: newActions });
  };

  const removeAction = (index: number) => {
    onUpdate({ ...stage, actions: stage.actions.filter((_, i) => i !== index) });
  };

  const moveAction = (index: number, dir: 'up' | 'down') => {
    const newActions = [...stage.actions];
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newActions.length) return;
    [newActions[index], newActions[target]] = [newActions[target], newActions[index]];
    onUpdate({ ...stage, actions: newActions });
  };

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${color.border} ${color.bg}`}>
      {/* Stage header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${color.header}`}>
        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${color.num}`}>
          {stageIndex + 1}
        </div>

        {editingTitle ? (
          <div className="flex-1 flex items-center gap-2">
            <Input
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              className="h-7 text-sm flex-1"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              onBlur={saveTitle}
            />
          </div>
        ) : (
          <button
            className="flex-1 text-left font-semibold text-sm hover:text-primary transition-colors flex items-center gap-1.5"
            onClick={() => { setEditingTitle(true); setTitleInput(stage.title); }}
          >
            {stage.title}
            <Pencil className="h-3 w-3 opacity-40" />
          </button>
        )}

        <Badge variant="secondary" className="text-xs shrink-0">
          {stage.actions.length} {stage.actions.length === 1 ? 'acción' : 'acciones'}
        </Badge>

        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={stageIndex === 0}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={stageIndex === totalStages - 1}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={onRemove} className="p-1 text-destructive hover:text-destructive/80 rounded">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-muted-foreground hover:text-foreground rounded ml-1"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Stage body */}
      {expanded && (
        <div className="px-4 py-3 space-y-2">
          {/* Optional description */}
          <Input
            value={stage.description || ''}
            onChange={e => onUpdate({ ...stage, description: e.target.value })}
            placeholder="Descripción opcional de esta etapa..."
            className="h-7 text-xs border-0 border-b rounded-none px-0 bg-transparent focus-visible:ring-0 focus-visible:border-primary text-muted-foreground"
          />

          {/* Actions list */}
          {stage.actions.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg py-6 text-center text-muted-foreground text-sm">
              <ClipboardList className="h-6 w-6 mx-auto mb-1 opacity-40" />
              <p>No hay acciones en esta etapa.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {stage.actions.map((action, actionIdx) => (
                <div key={action.id}>
                  <ActionCard
                    action={action}
                    index={actionIdx}
                    total={stage.actions.length}
                    quizzes={quizzes}
                    courses={courses}
                    signers={signers}
                    badges={badges}
                    forms={forms}
                    onUpdate={(a) => updateAction(actionIdx, a)}
                    onRemove={() => removeAction(actionIdx)}
                    onMoveUp={() => moveAction(actionIdx, 'up')}
                    onMoveDown={() => moveAction(actionIdx, 'down')}
                  />
                  {/* Insert action connector */}
                  <div className="flex items-center gap-2 py-0.5 group">
                    <div className="flex-1 border-l border-dashed border-muted ml-8 h-4" />
                    <button
                      onClick={() => insertAction(actionIdx)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 px-2 py-0.5 rounded-full border border-dashed border-muted hover:border-primary transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Plus className="h-3 w-3" /> insertar acción
                    </button>
                    <div className="flex-1 border-r border-dashed border-muted mr-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full border-dashed text-muted-foreground text-xs h-8 hover:text-foreground"
            onClick={addAction}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar acción
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function JourneyPage() {
  const { products, loading: loadingProducts } = useProducts();
  const { profile } = useAuth();

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [stages, setStages] = useState<JourneyStage[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [signers, setSigners] = useState<CertificateSigner[]>([]);
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [forms, setForms] = useState<JourneyForm[]>([]);
  const [journeyName, setJourneyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load global resources
  useEffect(() => {
    getCertificateSigners().then(setSigners).catch(() => setSigners([]));
    getCourses().then(setCourses).catch(() => setCourses([]));
    getAllBadges().then(setBadges).catch(() => setBadges([]));
    getJourneyForms().then(setForms).catch(() => setForms([]));
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
          setJourneyName(existingJourney.name);

          // Backward compat: if stages[], use them; if steps[], wrap in one stage
          const anyJ = existingJourney as any;
          if (anyJ.stages && anyJ.stages.length > 0) {
            setStages(
              [...anyJ.stages]
                .sort((a: JourneyStage, b: JourneyStage) => a.order - b.order)
                .map((s: JourneyStage) => ({
                  ...s,
                  actions: [...(s.actions || [])].sort((a: any, b: any) => a.order - b.order),
                }))
            );
          } else if (existingJourney.steps && existingJourney.steps.length > 0) {
            setStages([{
              id: crypto.randomUUID(),
              order: 0,
              title: 'Etapa principal',
              required: true,
              actions: [...existingJourney.steps].sort((a, b) => a.order - b.order),
            }]);
          } else {
            setStages([]);
          }
        } else {
          setJourney(null);
          const product = products.find(p => p.id === selectedProductId);
          setJourneyName(`Ruta de ${product?.name || 'Producto'}`);
          // Default 3-stage structure
          setStages([
            {
              id: crypto.randomUUID(), order: 0, title: 'Bienvenida', required: true,
              actions: [
                { id: crypto.randomUUID(), type: 'info_form', order: 0, title: 'Datos del vendedor', required: true, config: {} },
              ],
            },
            {
              id: crypto.randomUUID(), order: 1, title: 'Capacitación', required: true,
              actions: [
                { id: crypto.randomUUID(), type: 'challenge', order: 0, title: 'Desafío de producto', required: true, config: {} },
                { id: crypto.randomUUID(), type: 'results', order: 1, title: 'Ver resultados', required: true, config: {} },
              ],
            },
            {
              id: crypto.randomUUID(), order: 2, title: 'Cierre', required: false,
              actions: [
                { id: crypto.randomUUID(), type: 'certificate', order: 0, title: 'Obtener certificado', required: false, config: {} },
              ],
            },
          ]);
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

  // ── Stage management ────────────────────────────────────────────────────

  const addStage = () => {
    const newStage: JourneyStage = {
      id: crypto.randomUUID(),
      order: stages.length,
      title: `Etapa ${stages.length + 1}`,
      required: true,
      actions: [],
    };
    setStages([...stages, newStage]);
  };

  const insertStage = (afterIndex: number) => {
    const newStage: JourneyStage = {
      id: crypto.randomUUID(),
      order: afterIndex + 1,
      title: 'Nueva etapa',
      required: true,
      actions: [],
    };
    const newStages = [...stages];
    newStages.splice(afterIndex + 1, 0, newStage);
    setStages(newStages);
  };

  const updateStage = (index: number, updated: JourneyStage) => {
    const newStages = [...stages];
    newStages[index] = updated;
    setStages(newStages);
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const moveStage = (index: number, dir: 'up' | 'down') => {
    const newStages = [...stages];
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newStages.length) return;
    [newStages[index], newStages[target]] = [newStages[target], newStages[index]];
    setStages(newStages);
  };

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedProductId) return;
    const userId = profile?.uid || 'admin';
    if (!journeyName.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ingresa un nombre para la ruta.' });
      return;
    }

    setSaving(true);
    try {
      const stagesWithOrder = stages.map((s, i) => ({
        ...s,
        order: i,
        actions: s.actions.map((a, j) => ({ ...a, order: j })),
      }));
      // Keep a flattened steps[] for backward compat with older readers
      const flatSteps = stagesWithOrder.flatMap(s => s.actions);

      await saveJourney(
        {
          organizationId: 'aviva-credito',
          productId: selectedProductId,
          name: journeyName,
          stages: stagesWithOrder,
          steps: flatSteps,
          active: true,
        } as any,
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
      setStages([]);
      toast({ title: 'Ruta eliminada' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la ruta.' });
    }
  };

  // Summary
  const totalActions = stages.reduce((sum, s) => sum + s.actions.length, 0);
  const actionTypeCounts = stages
    .flatMap(s => s.actions)
    .reduce((acc, a) => ({ ...acc, [a.type]: (acc[a.type] || 0) + 1 }), {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Route className="h-6 w-6" /> Rutas del Jaguar Aviva
        </h1>
        <p className="text-muted-foreground">
          Diseña el camino de aprendizaje en etapas. Cada etapa contiene acciones (cursos, desafíos, formularios, etc.)
        </p>
      </div>

      {/* Concept info */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="py-3 flex gap-3 items-start">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Cada ruta tiene <strong>etapas</strong> (ej: Bienvenida, Capacitación, Cierre). Dentro de cada etapa
            puedes insertar múltiples <strong>acciones</strong>: formularios de datos, evaluaciones del capacitador,
            cursos, desafíos, listas de verificación y certificados — en cualquier orden.
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
                      Define las etapas y acciones que verá el vendedor al recorrer este producto.
                    </CardDescription>
                    {/* Summary badges */}
                    {stages.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Badge variant="outline" className="text-xs">
                          {stages.length} etapa{stages.length !== 1 ? 's' : ''}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {totalActions} acción{totalActions !== 1 ? 'es' : ''}
                        </Badge>
                        {Object.entries(actionTypeCounts).map(([type, count]) => {
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
                {/* Journey name */}
                <div className="space-y-2 max-w-sm">
                  <Label>Nombre de la ruta</Label>
                  <Input
                    value={journeyName}
                    onChange={(e) => setJourneyName(e.target.value)}
                    placeholder="Ej: Ruta Aviva Tu Compra"
                  />
                </div>

                {/* Stages */}
                <div className="space-y-2">
                  <Label>Etapas ({stages.length})</Label>
                  {stages.length === 0 ? (
                    <div className="border-2 border-dashed rounded-lg py-10 text-center text-muted-foreground">
                      <Route className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No hay etapas. Agrega la primera.</p>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      {stages.map((stage, stageIdx) => (
                        <div key={stage.id}>
                          <StageCard
                            stage={stage}
                            stageIndex={stageIdx}
                            totalStages={stages.length}
                            quizzes={quizzes}
                            courses={courses}
                            signers={signers}
                            badges={badges}
                            forms={forms}
                            onUpdate={(s) => updateStage(stageIdx, s)}
                            onRemove={() => removeStage(stageIdx)}
                            onMoveUp={() => moveStage(stageIdx, 'up')}
                            onMoveDown={() => moveStage(stageIdx, 'down')}
                          />
                          {/* Insert stage connector */}
                          <div className="flex items-center gap-2 py-2 group">
                            <div className="flex-1 border-l-2 border-dashed border-muted ml-8 h-6" />
                            <button
                              onClick={() => insertStage(stageIdx)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 px-3 py-1 rounded-full border border-dashed border-muted hover:border-primary transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Plus className="h-3 w-3" /> Insertar etapa aquí
                            </button>
                            <div className="flex-1 border-r-2 border-dashed border-muted mr-8 h-6" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button variant="outline" className="w-full border-dashed" onClick={addStage}>
                    <Plus className="h-4 w-4 mr-2" /> Agregar etapa
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
