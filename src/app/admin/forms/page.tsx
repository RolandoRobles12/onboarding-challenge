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
} from '@/lib/firestore-service';
import type {
  JourneyForm,
  FormField,
  FormFieldType,
  FormPurpose,
  FormRespondent,
  FormResponse,
  UserProfile,
} from '@/lib/types-scalable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge as UiBadge } from '@/components/ui/badge';
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

// ─── Vista de respuestas ──────────────────────────────────────────────────────

function FormResponsesView({ form, onClose }: { form: JourneyForm; onClose: () => void }) {
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [resp, users] = await Promise.all([
        getFormResponses(form.id),
        getAllUsers(),
      ]);
      setResponses(resp);
      const map: Record<string, UserProfile> = {};
      users.forEach(u => { map[u.uid] = u; });
      setUsersMap(map);
      setLoading(false);
    })();
  }, [form.id]);

  const fieldMap = Object.fromEntries(form.fields.map(f => [f.id, f]));

  function formatValue(value: string | string[] | number): string {
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  function formatDate(ts: import('firebase/firestore').Timestamp | undefined): string {
    if (!ts) return '—';
    return new Date(ts.seconds * 1000).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Respuestas: {form.title}</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Cargando...' : `${responses.length} respuesta${responses.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando respuestas...</div>
      ) : responses.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Sin respuestas todavía</p>
            <p className="text-sm text-muted-foreground mt-1">
              Las respuestas aparecerán aquí cuando los usuarios completen este formulario.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {responses.map((resp, i) => {
            const respondent = usersMap[resp.respondentId];
            const displayName = respondent?.nombre || resp.respondentId;
            const subject = resp.subjectId ? usersMap[resp.subjectId] : undefined;
            const dataFields = form.fields.filter(f => f.type !== 'section_header');
            return (
              <Card key={resp.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        Respuesta #{responses.length - i}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        <span className="font-medium">{displayName}</span>
                        {subject && <span> · Evaluado: <span className="font-medium">{subject.nombre || resp.subjectId}</span></span>}
                        <span className="ml-2 text-muted-foreground">{formatDate(resp.submittedAt)}</span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {resp.answers.map(ans => {
                      const field = fieldMap[ans.fieldId];
                      if (!field) return null;
                      return (
                        <div key={ans.fieldId} className="grid grid-cols-[1fr_2fr] gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                          <p className="text-muted-foreground font-medium text-xs leading-snug">{field.label || ans.fieldId}</p>
                          <p className="text-foreground text-xs leading-snug">{formatValue(ans.value)}</p>
                        </div>
                      );
                    })}
                    {dataFields.length > 0 && resp.answers.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Sin respuestas registradas</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type ViewMode = 'list' | 'editor' | 'preview' | 'responses';

export default function AdminFormsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [forms, setForms] = useState<JourneyForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [editingForm, setEditingForm] = useState<(Omit<JourneyForm, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string }) | null>(null);
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
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo formulario
        </Button>
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
