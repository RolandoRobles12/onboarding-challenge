'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getJourneyForms,
  createJourneyForm,
  updateJourneyForm,
  deleteJourneyForm,
  getFormResponses,
  getAllUsers,
  getKioscos,
} from '@/lib/firestore-service';
import type {
  JourneyForm,
  FormField,
  FormFieldType,
  FormPurpose,
  FormRespondent,
  FormResponse,
  UserProfile,
  Kiosko,
} from '@/lib/types-scalable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ClipboardList,
  Star,
  BarChart2,
  AlignLeft,
  Hash,
  Calendar,
  CheckSquare,
  Circle,
  Minus,
  X,
  Save,
  Eye,
  Copy,
  ImageIcon,
  Upload,
  Users,
  MapPin,
  Inbox,
  Search,
  TrendingUp,
  FileText,
  Download,
} from 'lucide-react';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// ─── Constantes ───────────────────────────────────────────────────────────────

const PURPOSE_CONFIG: Record<FormPurpose, { label: string; emoji: string; description: string; color: string }> = {
  seller_data: {
    label: 'Datos del vendedor',
    emoji: '📋',
    description: 'Recopila información básica: kiosko, fecha de ingreso, etc.',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  experience_rating: {
    label: 'Evaluación de experiencia',
    emoji: '⭐',
    description: 'El vendedor evalúa su propia experiencia de aprendizaje.',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  trainer_rating: {
    label: 'Evaluación del capacitador',
    emoji: '👨‍🏫',
    description: 'El vendedor califica a su capacitador.',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  seller_evaluation: {
    label: 'Evaluación del vendedor',
    emoji: '📊',
    description: 'El capacitador o gerente evalúa el desempeño del vendedor.',
    color: 'bg-green-100 text-green-800 border-green-200',
  },
  general: {
    label: 'General',
    emoji: '📝',
    description: 'Formulario de propósito general.',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

const RESPONDENT_CONFIG: Record<FormRespondent, { label: string; emoji: string }> = {
  seller: { label: 'Vendedor', emoji: '🛒' },
  trainer: { label: 'Capacitador', emoji: '👨‍🏫' },
  manager: { label: 'Gerente / Evaluador', emoji: '👔' },
};

const FIELD_TYPE_CONFIG: Record<FormFieldType, { label: string; icon: React.ReactNode; description: string }> = {
  text: { label: 'Texto corto', icon: <AlignLeft className="h-4 w-4" />, description: 'Una línea de texto' },
  textarea: { label: 'Texto largo', icon: <AlignLeft className="h-4 w-4 opacity-70" />, description: 'Párrafo de texto' },
  number: { label: 'Número', icon: <Hash className="h-4 w-4" />, description: 'Campo numérico' },
  date: { label: 'Fecha', icon: <Calendar className="h-4 w-4" />, description: 'Selector de fecha' },
  single_choice: { label: 'Opción única', icon: <Circle className="h-4 w-4" />, description: 'Radio: selecciona una' },
  multiple_choice: { label: 'Opción múltiple', icon: <CheckSquare className="h-4 w-4" />, description: 'Checkbox: selecciona varias' },
  rating_stars: { label: 'Estrellas (1–5)', icon: <Star className="h-4 w-4" />, description: 'Calificación con estrellas' },
  rating_nps: { label: 'NPS (0–10)', icon: <BarChart2 className="h-4 w-4" />, description: 'Net Promoter Score' },
  rating_scale: { label: 'Escala personalizada', icon: <BarChart2 className="h-4 w-4 opacity-70" />, description: 'Escala numérica 1–N' },
  section_header: { label: 'Encabezado de sección', icon: <Minus className="h-4 w-4" />, description: 'Separador visual (no captura datos)' },
  trainer_select: { label: 'Selector de capacitador', icon: <Users className="h-4 w-4" />, description: 'Lista buscable de capacitadores del sistema' },
  kiosk_select: { label: 'Selector de kiosko', icon: <MapPin className="h-4 w-4" />, description: 'Lista buscable de kioscos registrados' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newField(order: number): FormField {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    label: '',
    placeholder: '',
    required: false,
    order,
  };
}

function blankForm(orgId: string): Omit<JourneyForm, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> {
  return {
    organizationId: orgId,
    title: '',
    description: '',
    purpose: 'general',
    respondent: 'seller',
    fields: [],
    active: true,
  };
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

interface FieldEditorProps {
  field: FormField;
  index: number;
  total: number;
  onChange: (updated: FormField) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function FieldEditor({ field, index, total, onChange, onDelete, onMoveUp, onMoveDown }: FieldEditorProps) {
  const update = (patch: Partial<FormField>) => onChange({ ...field, ...patch });
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [imgUploading, setImgUploading] = useState(false);

  const needsOptions = field.type === 'single_choice' || field.type === 'multiple_choice';
  const needsScale = field.type === 'rating_scale';
  const isHeader = field.type === 'section_header';

  async function handleImageUpload(file: File) {
    if (!storage) return;
    setImgUploading(true);
    const path = `certificates/form-images/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on('state_changed', () => {}, () => { setImgUploading(false); }, async () => {
      const url = await getDownloadURL(task.snapshot.ref);
      update({ imageUrl: url });
      setImgUploading(false);
    });
  }

  const addOption = () => {
    const opts = field.options ?? [];
    update({ options: [...opts, { id: crypto.randomUUID(), label: '' }] });
  };

  const updateOption = (optId: string, label: string) => {
    update({ options: (field.options ?? []).map(o => o.id === optId ? { ...o, label } : o) });
  };

  const removeOption = (optId: string) => {
    update({ options: (field.options ?? []).filter(o => o.id !== optId) });
  };

  return (
    <div className="border rounded-lg p-4 bg-card space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground w-5">{index + 1}</span>
        <div className="flex-1">
          <Select value={field.type} onValueChange={v => update({ type: v as FormFieldType })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(FIELD_TYPE_CONFIG) as [FormFieldType, typeof FIELD_TYPE_CONFIG[FormFieldType]][]).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  <span className="flex items-center gap-2">
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={index === 0}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={index === total - 1}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Label */}
      <div>
        <Input
          placeholder={isHeader ? 'Título de la sección' : 'Pregunta o etiqueta del campo'}
          value={field.label}
          onChange={e => update({ label: e.target.value })}
          className="text-sm"
        />
      </div>

      {/* Image upload (for non-header fields) */}
      {!isHeader && (
        <div>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
          />
          {field.imageUrl ? (
            <div className="relative inline-block">
              <img src={field.imageUrl} alt="Imagen del campo" className="max-h-32 rounded-lg border object-contain" />
              <button
                type="button"
                onClick={() => update({ imageUrl: undefined })}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={imgUploading}
              onClick={() => imgInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded px-2 py-1 transition-colors"
            >
              {imgUploading ? <Upload className="h-3 w-3 animate-pulse" /> : <ImageIcon className="h-3 w-3" />}
              {imgUploading ? 'Subiendo…' : 'Agregar imagen'}
            </button>
          )}
        </div>
      )}

      {/* Section header description */}
      {isHeader && (
        <Textarea
          placeholder="Descripción opcional de la sección"
          value={field.description ?? ''}
          onChange={e => update({ description: e.target.value })}
          rows={2}
          className="text-sm resize-none"
        />
      )}

      {/* Placeholder (for input fields) */}
      {!isHeader && field.type !== 'rating_stars' && field.type !== 'rating_nps' && field.type !== 'rating_scale' && !needsOptions && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Texto de ayuda (placeholder)"
            value={field.placeholder ?? ''}
            onChange={e => update({ placeholder: e.target.value })}
            className="text-sm"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={field.required}
              onChange={e => update({ required: e.target.checked })}
              className="rounded"
            />
            Obligatorio
          </label>
        </div>
      )}

      {/* Required checkbox for non-text fields */}
      {!isHeader && (field.type === 'rating_stars' || field.type === 'rating_nps' || field.type === 'rating_scale' || needsOptions) && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={field.required}
            onChange={e => update({ required: e.target.checked })}
            className="rounded"
          />
          Obligatorio
        </label>
      )}

      {/* Options for single/multiple choice */}
      {needsOptions && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Opciones:</p>
          {(field.options ?? []).map((opt) => (
            <div key={opt.id} className="flex items-center gap-2">
              <div className="text-muted-foreground">
                {field.type === 'single_choice' ? <Circle className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
              </div>
              <Input
                placeholder="Texto de la opción"
                value={opt.label}
                onChange={e => updateOption(opt.id, e.target.value)}
                className="text-sm h-7"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => removeOption(opt.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addOption}>
            <Plus className="h-3 w-3 mr-1" /> Agregar opción
          </Button>
        </div>
      )}

      {/* Custom scale config */}
      {needsScale && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Valor mínimo</Label>
            <Input
              type="number"
              value={field.minValue ?? 1}
              onChange={e => update({ minValue: Number(e.target.value) })}
              className="h-8 text-sm"
            />
            <Input
              placeholder='Etiqueta mínima (ej: "Muy malo")'
              value={field.minLabel ?? ''}
              onChange={e => update({ minLabel: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor máximo</Label>
            <Input
              type="number"
              value={field.maxValue ?? 10}
              onChange={e => update({ maxValue: Number(e.target.value) })}
              className="h-8 text-sm"
            />
            <Input
              placeholder='Etiqueta máxima (ej: "Excelente")'
              value={field.maxLabel ?? ''}
              onChange={e => update({ maxLabel: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      {/* Help text for all non-header fields */}
      {!isHeader && (
        <Input
          placeholder="Texto de ayuda opcional (aparece debajo del campo)"
          value={field.helpText ?? ''}
          onChange={e => update({ helpText: e.target.value })}
          className="text-xs h-7"
        />
      )}
    </div>
  );
}

// ─── Editor de formulario ─────────────────────────────────────────────────────

interface FormEditorProps {
  form: Omit<JourneyForm, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string };
  saving: boolean;
  onSave: (form: Omit<JourneyForm, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string }) => void;
  onCancel: () => void;
}

function FormEditor({ form: initialForm, saving, onSave, onCancel }: FormEditorProps) {
  const [form, setForm] = useState(initialForm);

  const update = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const updateField = (index: number, updated: FormField) => {
    const fields = [...form.fields];
    fields[index] = { ...updated, order: index };
    update({ fields });
  };

  const deleteField = (index: number) => {
    const fields = form.fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, order: i }));
    update({ fields });
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const fields = [...form.fields];
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    update({ fields: fields.map((f, i) => ({ ...f, order: i })) });
  };

  const addField = () => {
    update({ fields: [...form.fields, newField(form.fields.length)] });
  };

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">{form.id ? 'Editar formulario' : 'Nuevo formulario'}</h2>
          <p className="text-sm text-muted-foreground">Diseña los campos y configura quién responde</p>
        </div>
      </div>

      {/* Metadata card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información general</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre del formulario *</Label>
            <Input
              placeholder="Ej: Evaluación de capacitación por el vendedor"
              value={form.title}
              onChange={e => update({ title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Textarea
              placeholder="Explica brevemente para qué sirve este formulario"
              value={form.description ?? ''}
              onChange={e => update({ description: e.target.value })}
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Propósito</Label>
              <Select value={form.purpose} onValueChange={v => update({ purpose: v as FormPurpose })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PURPOSE_CONFIG) as [FormPurpose, typeof PURPOSE_CONFIG[FormPurpose]][]).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.emoji} {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{PURPOSE_CONFIG[form.purpose].description}</p>
            </div>
            <div className="space-y-1.5">
              <Label>¿Quién responde?</Label>
              <Select value={form.respondent} onValueChange={v => update({ respondent: v as FormRespondent })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(RESPONDENT_CONFIG) as [FormRespondent, typeof RESPONDENT_CONFIG[FormRespondent]][]).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.emoji} {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fields card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos del formulario</CardTitle>
          <CardDescription>
            {form.fields.length === 0
              ? 'Aún no hay campos. Agrega el primero con el botón de abajo.'
              : `${form.fields.length} campo${form.fields.length !== 1 ? 's' : ''} configurado${form.fields.length !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.fields.map((field, i) => (
            <FieldEditor
              key={field.id}
              field={field}
              index={i}
              total={form.fields.length}
              onChange={updated => updateField(i, updated)}
              onDelete={() => deleteField(i)}
              onMoveUp={() => moveField(i, -1)}
              onMoveDown={() => moveField(i, 1)}
            />
          ))}
          <Button variant="outline" className="w-full" onClick={addField}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar campo
          </Button>
        </CardContent>
      </Card>

      {/* Action bar */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={() => onSave(form)} disabled={saving || !form.title.trim()}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar formulario'}
        </Button>
      </div>
    </div>
  );
}

// ─── Vista previa del formulario ──────────────────────────────────────────────

function FormPreview({ form, onClose }: { form: JourneyForm; onClose: () => void }) {
  const purpose = PURPOSE_CONFIG[form.purpose];
  const respondent = RESPONDENT_CONFIG[form.respondent];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Vista previa</h2>
          <p className="text-sm text-muted-foreground">Así verá el formulario quien lo responda</p>
        </div>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{purpose.emoji}</span>
                <CardTitle className="text-lg">{form.title}</CardTitle>
              </div>
              {form.description && (
                <CardDescription>{form.description}</CardDescription>
              )}
            </div>
            <div className="shrink-0 flex flex-col gap-1.5 items-end">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${purpose.color}`}>
                {purpose.label}
              </span>
              <span className="text-xs text-muted-foreground">
                Responde: {respondent.emoji} {respondent.label}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {form.fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Sin campos configurados</p>
          )}
          {form.fields.map(field => {
            if (field.type === 'section_header') {
              return (
                <div key={field.id} className="pt-2 pb-1 border-b">
                  <h3 className="font-semibold text-base">{field.label || 'Sección sin título'}</h3>
                  {field.description && <p className="text-sm text-muted-foreground mt-0.5">{field.description}</p>}
                </div>
              );
            }
            return (
              <div key={field.id} className="space-y-1.5">
                <Label>
                  {field.label || <span className="italic text-muted-foreground">Sin etiqueta</span>}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                {(field.type === 'text' || field.type === 'number' || field.type === 'date') && (
                  <Input type={field.type} placeholder={field.placeholder} disabled className="bg-muted" />
                )}
                {field.type === 'textarea' && (
                  <Textarea placeholder={field.placeholder} disabled rows={3} className="bg-muted resize-none" />
                )}
                {field.type === 'rating_stars' && (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} className="h-8 w-8 text-muted-foreground/40" />
                    ))}
                  </div>
                )}
                {field.type === 'rating_nps' && (
                  <div className="flex flex-wrap gap-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <button key={n} className="h-9 w-9 rounded border text-sm font-medium text-muted-foreground bg-muted" disabled>
                        {n}
                      </button>
                    ))}
                    <div className="w-full flex justify-between text-xs text-muted-foreground mt-1">
                      <span>No lo recomendaría</span>
                      <span>Lo recomendaría ampliamente</span>
                    </div>
                  </div>
                )}
                {field.type === 'rating_scale' && (
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: (field.maxValue ?? 10) - (field.minValue ?? 1) + 1 }, (_, i) => i + (field.minValue ?? 1)).map(n => (
                        <button key={n} className="h-9 w-9 rounded border text-sm font-medium text-muted-foreground bg-muted" disabled>
                          {n}
                        </button>
                      ))}
                    </div>
                    {(field.minLabel || field.maxLabel) && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{field.minLabel}</span>
                        <span>{field.maxLabel}</span>
                      </div>
                    )}
                  </div>
                )}
                {(field.type === 'single_choice' || field.type === 'multiple_choice') && (
                  <div className="space-y-2">
                    {(field.options ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Sin opciones configuradas</p>
                    )}
                    {(field.options ?? []).map(opt => (
                      <label key={opt.id} className="flex items-center gap-2 text-sm cursor-not-allowed opacity-70">
                        <input
                          type={field.type === 'single_choice' ? 'radio' : 'checkbox'}
                          disabled
                          className="rounded"
                        />
                        {opt.label || <span className="italic text-muted-foreground">Opción sin texto</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers de resolución de valores ────────────────────────────────────────

function resolveFieldValue(
  field: FormField,
  value: string | string[] | number,
  usersMap: Record<string, UserProfile>,
  kioscos: Kiosko[]
): string {
  if (field.type === 'single_choice') {
    const id = String(value);
    return field.options?.find(o => o.id === id)?.label ?? id;
  }
  if (field.type === 'multiple_choice') {
    const ids = Array.isArray(value) ? value.map(String) : [String(value)];
    return ids.map(id => field.options?.find(o => o.id === id)?.label ?? id).join(', ');
  }
  if (field.type === 'trainer_select') {
    const u = usersMap[String(value)];
    return u?.nombre ?? String(value);
  }
  if (field.type === 'kiosk_select') {
    const k = kioscos.find(k => k.id === String(value) || k.name === String(value));
    return k?.name ?? String(value);
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function formatDate(ts: import('firebase/firestore').Timestamp | undefined): string {
  if (!ts) return '—';
  return new Date(ts.seconds * 1000).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Analítica por campo ──────────────────────────────────────────────────────

function FieldAnalytics({ field, responses, usersMap, kioscos }: {
  field: FormField;
  responses: FormResponse[];
  usersMap: Record<string, UserProfile>;
  kioscos: Kiosko[];
}) {
  const answers = responses
    .flatMap(r => r.answers.filter(a => a.fieldId === field.id))
    .filter(a => a.value !== '' && a.value !== null && a.value !== undefined);

  if (answers.length === 0) return (
    <p className="text-xs text-muted-foreground italic">Sin respuestas</p>
  );

  // Rating fields → average
  if (field.type === 'rating_stars' || field.type === 'rating_nps' || field.type === 'rating_scale') {
    const nums = answers.map(a => Number(a.value)).filter(n => !isNaN(n));
    const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
    const max = field.type === 'rating_stars' ? 5 : field.type === 'rating_nps' ? 10 : (field.maxValue ?? 10);
    const pct = Math.round((avg / max) * 100);
    // NPS: promoters (9-10), detractors (0-6)
    let npsScore: number | null = null;
    if (field.type === 'rating_nps' && nums.length) {
      const promoters = nums.filter(n => n >= 9).length / nums.length;
      const detractors = nums.filter(n => n <= 6).length / nums.length;
      npsScore = Math.round((promoters - detractors) * 100);
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-primary">{avg.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground">/ {max} · {nums.length} respuestas</span>
          {npsScore !== null && (
            <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${npsScore >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              NPS: {npsScore > 0 ? '+' : ''}{npsScore}
            </span>
          )}
        </div>
        <Progress value={pct} className="h-2 max-w-xs" />
        {field.type === 'rating_stars' && (
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map(n => (
              <Star key={n} className={`h-4 w-4 ${n <= Math.round(avg) ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Choice fields → frequency bars
  if (field.type === 'single_choice' || field.type === 'multiple_choice' ||
      field.type === 'kiosk_select' || field.type === 'trainer_select') {
    const counts: Record<string, number> = {};
    answers.forEach(a => {
      const resolved = resolveFieldValue(field, a.value, usersMap, kioscos);
      const parts = resolved.split(', ');
      parts.forEach(p => { counts[p] = (counts[p] ?? 0) + 1; });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] ?? 1;
    return (
      <div className="space-y-2">
        {sorted.map(([label, count]) => (
          <div key={label} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate max-w-[260px]">{label}</span>
              <span className="text-muted-foreground ml-2 shrink-0">{count} ({Math.round(count / answers.length * 100)}%)</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(count / max * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Text/textarea/date/number → list of values
  const unique = [...new Set(answers.map(a => String(a.value)).filter(Boolean))].slice(0, 8);
  return (
    <div className="space-y-1">
      {unique.map((v, i) => (
        <p key={i} className="text-xs bg-muted/50 rounded px-2 py-1 truncate">{v}</p>
      ))}
      {answers.length > 8 && <p className="text-xs text-muted-foreground">+{answers.length - 8} más…</p>}
    </div>
  );
}

// ─── Vista de respuestas ──────────────────────────────────────────────────────

function FormResponsesView({ form, onClose }: { form: JourneyForm; onClose: () => void }) {
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserProfile>>({});
  const [kioscos, setKioscos] = useState<Kiosko[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [resp, users, kioscoList] = await Promise.all([
        getFormResponses(form.id),
        getAllUsers(),
        getKioscos(),
      ]);
      setResponses(resp);
      const map: Record<string, UserProfile> = {};
      users.forEach(u => { map[u.uid] = u; });
      setUsersMap(map);
      setKioscos(kioscoList);
      setLoading(false);
    })();
  }, [form.id]);

  const dataFields = form.fields.filter(f => f.type !== 'section_header');

  const filteredResponses = responses.filter(r => {
    if (!search.trim()) return true;
    const respondent = usersMap[r.respondentId];
    const name = (respondent?.nombre || r.respondentId).toLowerCase();
    if (name.includes(search.toLowerCase())) return true;
    return r.answers.some(a => {
      const field = form.fields.find(f => f.id === a.fieldId);
      if (!field) return false;
      return resolveFieldValue(field, a.value, usersMap, kioscos).toLowerCase().includes(search.toLowerCase());
    });
  });

  // Summary stats
  const uniqueRespondents = new Set(responses.map(r => r.respondentId)).size;
  const lastDate = responses[0]?.submittedAt;
  const firstDate = responses[responses.length - 1]?.submittedAt;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate">{form.title}</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Cargando...' : `${responses.length} respuesta${responses.length !== 1 ? 's' : ''} · ${uniqueRespondents} respondente${uniqueRespondents !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando datos...</div>
      ) : responses.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Sin respuestas todavía</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="analitica">
          <TabsList>
            <TabsTrigger value="analitica"><BarChart2 className="h-4 w-4 mr-1.5" />Analítica</TabsTrigger>
            <TabsTrigger value="respuestas"><FileText className="h-4 w-4 mr-1.5" />Respuestas ({responses.length})</TabsTrigger>
          </TabsList>

          {/* ── ANALÍTICA ─────────────────────────────────────────── */}
          <TabsContent value="analitica" className="mt-4 space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total respuestas', value: responses.length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Respondentes únicos', value: uniqueRespondents, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Primera respuesta', value: firstDate ? new Date(firstDate.seconds * 1000).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—', icon: Calendar, color: 'text-slate-600', bg: 'bg-slate-50' },
                { label: 'Última respuesta', value: lastDate ? new Date(lastDate.seconds * 1000).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <Card key={s.label}>
                    <CardContent className="py-3 flex items-center gap-2.5">
                      <div className={`h-9 w-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-4 w-4 ${s.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-bold leading-tight truncate">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Per-field analytics */}
            <div className="grid gap-4 sm:grid-cols-2">
              {dataFields.map(field => (
                <Card key={field.id}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold leading-tight">{field.label || '(campo sin título)'}</CardTitle>
                    <CardDescription className="text-xs">{FIELD_TYPE_CONFIG[field.type]?.label}</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <FieldAnalytics field={field} responses={responses} usersMap={usersMap} kioscos={kioscos} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── RESPUESTAS INDIVIDUALES ──────────────────────────── */}
          <TabsContent value="respuestas" className="mt-4 space-y-4">
            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nombre o valor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full h-9 rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {filteredResponses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin resultados para "{search}"</p>
            ) : (
              filteredResponses.map((resp, i) => {
                const respondent = usersMap[resp.respondentId];
                const displayName = respondent?.nombre || resp.respondentId;
                const subject = resp.subjectId ? usersMap[resp.subjectId] : undefined;
                return (
                  <Card key={resp.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(resp.submittedAt)}
                              {subject && <> · Evaluado: <span className="font-medium">{subject.nombre}</span></>}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">#{filteredResponses.length - i}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="divide-y">
                        {resp.answers.map(ans => {
                          const field = form.fields.find(f => f.id === ans.fieldId);
                          if (!field || field.type === 'section_header') return null;
                          const resolved = resolveFieldValue(field, ans.value, usersMap, kioscos);
                          if (!resolved) return null;
                          return (
                            <div key={ans.fieldId} className="grid grid-cols-[2fr_3fr] gap-3 py-2 text-sm">
                              <p className="text-muted-foreground text-xs leading-snug">{field.label}</p>
                              <p className="text-foreground text-xs leading-snug font-medium">{resolved}</p>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── Vista de Reportería global ───────────────────────────────────────────────

function FormsReportingView({ forms, onClose }: { forms: JourneyForm[]; onClose: () => void }) {
  const [allResponses, setAllResponses] = useState<Record<string, FormResponse[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const results = await Promise.all(
        forms.map(f => getFormResponses(f.id).then(r => [f.id, r] as [string, FormResponse[]]))
      );
      const map: Record<string, FormResponse[]> = {};
      results.forEach(([id, r]) => { map[id] = r; });
      setAllResponses(map);
      setLoading(false);
    })();
  }, [forms]);

  const totalResponses = Object.values(allResponses).reduce((s, r) => s + r.length, 0);
  const allUniqueRespondents = new Set(
    Object.values(allResponses).flatMap(r => r.map(x => x.respondentId))
  ).size;
  const formsWithResponses = Object.values(allResponses).filter(r => r.length > 0).length;

  // Sorted forms by response count
  const formStats = forms.map(f => {
    const resp = allResponses[f.id] ?? [];
    const lastTs = resp[0]?.submittedAt;
    return {
      form: f,
      count: resp.length,
      lastDate: lastTs ? new Date(lastTs.seconds * 1000) : null,
    };
  }).sort((a, b) => b.count - a.count);

  const maxCount = formStats[0]?.count ?? 1;

  // Responses by purpose
  const byPurpose: Record<string, number> = {};
  forms.forEach(f => {
    byPurpose[f.purpose] = (byPurpose[f.purpose] ?? 0) + (allResponses[f.id]?.length ?? 0);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Reportería global
          </h2>
          <p className="text-sm text-muted-foreground">Resumen de respuestas en todos los formularios</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando datos...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total respuestas', value: totalResponses, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Respondentes únicos', value: allUniqueRespondents, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Formularios activos', value: forms.length, icon: ClipboardList, color: 'text-slate-600', bg: 'bg-slate-50' },
              { label: 'Con respuestas', value: formsWithResponses, icon: BarChart2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            ].map(s => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <CardContent className="py-3 flex items-center gap-2.5">
                    <div className={`h-9 w-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-4 w-4 ${s.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-tight">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Responses by purpose */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Respuestas por propósito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(Object.entries(PURPOSE_CONFIG) as [FormPurpose, typeof PURPOSE_CONFIG[FormPurpose]][])
                .filter(([key]) => byPurpose[key] > 0)
                .sort((a, b) => (byPurpose[b[0]] ?? 0) - (byPurpose[a[0]] ?? 0))
                .map(([key, cfg]) => {
                  const count = byPurpose[key] ?? 0;
                  const pct = totalResponses ? Math.round(count / totalResponses * 100) : 0;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{cfg.emoji} {cfg.label}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              {totalResponses === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin respuestas registradas</p>
              )}
            </CardContent>
          </Card>

          {/* Per-form breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Detalle por formulario</CardTitle>
              <CardDescription className="text-xs">Ordenado por número de respuestas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {formStats.map(({ form, count, lastDate }) => {
                const purpose = PURPOSE_CONFIG[form.purpose];
                const pct = maxCount > 0 ? Math.round(count / maxCount * 100) : 0;
                return (
                  <div key={form.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{purpose.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{form.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {lastDate
                              ? `Última resp.: ${lastDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}`
                              : 'Sin respuestas'}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold shrink-0 tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${count > 0 ? 'bg-primary' : 'bg-muted'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {forms.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin formularios</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type ViewMode = 'list' | 'editor' | 'preview' | 'responses' | 'reporting';

export default function AdminFormsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [forms, setForms] = useState<JourneyForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [editingForm, setEditingForm] = useState<(Omit<JourneyForm, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string }) | null>(null);
  // Mientras el editor esté abierto hay trabajo en curso que se perdería al
  // cerrar la pestaña — el guardado es explícito, no automático.
  useUnsavedChanges(editingForm !== null);
  const [previewForm, setPreviewForm] = useState<JourneyForm | null>(null);
  const [responsesForm, setResponsesForm] = useState<JourneyForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JourneyForm | null>(null);
  const [filterPurpose, setFilterPurpose] = useState<FormPurpose | 'all'>('all');
  const [filterRespondent, setFilterRespondent] = useState<FormRespondent | 'all'>('all');

  const orgId = profile?.uid ? 'aviva-credito' : 'aviva-credito';

  const loadForms = useCallback(async () => {
    setLoading(true);
    const data = await getJourneyForms(orgId);
    setForms(data);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { loadForms(); }, [loadForms]);

  const handleNew = () => {
    setEditingForm(blankForm(orgId));
    setView('editor');
  };

  const handleEdit = (form: JourneyForm) => {
    setEditingForm(form);
    setView('editor');
  };

  const handlePreview = (form: JourneyForm) => {
    setPreviewForm(form);
    setView('preview');
  };

  const handleViewResponses = (form: JourneyForm) => {
    setResponsesForm(form);
    setView('responses');
  };

  const handleDuplicate = async (form: JourneyForm) => {
    if (!user) return;
    try {
      const { id: _id, createdAt: _ca, updatedAt: _ua, createdBy: _cb, ...rest } = form;
      await createJourneyForm({ ...rest, title: `${form.title} (copia)` }, user.uid);
      toast({ title: 'Formulario duplicado' });
      loadForms();
    } catch {
      toast({ title: 'Error al duplicar', variant: 'destructive' });
    }
  };

  const handleSave = async (formData: Omit<JourneyForm, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string }) => {
    if (!user) return;
    setSaving(true);
    try {
      if (formData.id) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...updates } = formData;
        await updateJourneyForm(formData.id, updates);
        toast({ title: 'Formulario actualizado' });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...rest } = formData;
        await createJourneyForm(rest, user.uid);
        toast({ title: 'Formulario creado' });
      }
      await loadForms();
      setView('list');
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteJourneyForm(deleteTarget.id);
      toast({ title: 'Formulario eliminado' });
      setDeleteTarget(null);
      loadForms();
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  };

  const filtered = forms.filter(f => {
    if (!f.active) return false;
    if (filterPurpose !== 'all' && f.purpose !== filterPurpose) return false;
    if (filterRespondent !== 'all' && f.respondent !== filterRespondent) return false;
    return true;
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (view === 'editor' && editingForm !== null) {
    return (
      <FormEditor
        form={editingForm}
        saving={saving}
        onSave={handleSave}
        onCancel={() => setView('list')}
      />
    );
  }

  if (view === 'preview' && previewForm) {
    return <FormPreview form={previewForm} onClose={() => setView('list')} />;
  }

  if (view === 'responses' && responsesForm) {
    return <FormResponsesView form={responsesForm} onClose={() => setView('list')} />;
  }

  if (view === 'reporting') {
    return <FormsReportingView forms={forms.filter(f => f.active)} onClose={() => setView('list')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Formularios
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Diseña formularios para capturar datos de vendedores, evaluar capacitadores o registrar evaluaciones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setView('reporting')}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Reportería
          </Button>
          <Button onClick={handleNew}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo formulario
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterPurpose} onValueChange={v => setFilterPurpose(v as FormPurpose | 'all')}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="Filtrar por propósito" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los propósitos</SelectItem>
            {(Object.entries(PURPOSE_CONFIG) as [FormPurpose, typeof PURPOSE_CONFIG[FormPurpose]][]).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.emoji} {cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRespondent} onValueChange={v => setFilterRespondent(v as FormRespondent | 'all')}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="Filtrar por respondente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los respondentes</SelectItem>
            {(Object.entries(RESPONDENT_CONFIG) as [FormRespondent, typeof RESPONDENT_CONFIG[FormRespondent]][]).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.emoji} {cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.entries(PURPOSE_CONFIG) as [FormPurpose, typeof PURPOSE_CONFIG[FormPurpose]][]).map(([key, cfg]) => {
          const count = forms.filter(f => f.active && f.purpose === key).length;
          return (
            <Card key={key} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setFilterPurpose(key)}>
              <CardContent className="p-3 text-center">
                <div className="text-xl mb-0.5">{cfg.emoji}</div>
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground leading-tight">{cfg.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Forms list */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando formularios...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {forms.filter(f => f.active).length === 0
                ? 'Aún no has creado ningún formulario'
                : 'Sin resultados para los filtros seleccionados'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Crea formularios para capturar información durante las rutas de capacitación.
            </p>
            {forms.filter(f => f.active).length === 0 && (
              <Button className="mt-4" onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" /> Crear primer formulario
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(form => {
            const purpose = PURPOSE_CONFIG[form.purpose];
            const respondent = RESPONDENT_CONFIG[form.respondent];
            const fieldCount = form.fields.filter(f => f.type !== 'section_header').length;
            return (
              <Card key={form.id} className="flex flex-col hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl shrink-0">{purpose.emoji}</span>
                      <CardTitle className="text-sm font-semibold leading-tight truncate">
                        {form.title}
                      </CardTitle>
                    </div>
                  </div>
                  {form.description && (
                    <CardDescription className="text-xs line-clamp-2 mt-1">{form.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0 flex-1 flex flex-col justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${purpose.color}`}>
                      {purpose.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground font-medium">
                      {respondent.emoji} {respondent.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground">
                      {fieldCount} campo{fieldCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => handleViewResponses(form)}>
                      <Inbox className="h-3.5 w-3.5 mr-1" /> Respuestas
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" onClick={() => handlePreview(form)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" onClick={() => handleEdit(form)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" onClick={() => handleDuplicate(form)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs px-2.5 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(form)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar formulario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &ldquo;{deleteTarget?.title}&rdquo;. Esta acción no se puede deshacer. Los pasos de rutas que usen este formulario quedarán sin formulario asignado.
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
    </div>
  );
}
