'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getAllOnboardingFields, createOnboardingField, updateOnboardingField, deleteOnboardingField } from '@/lib/firestore-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  ClipboardList, Plus, Pencil, Trash2, GripVertical,
  ChevronUp, ChevronDown, Upload, X, Check
} from 'lucide-react';
import type { OnboardingField, OnboardingFieldType, FieldOption } from '@/lib/types-scalable';

const FIELD_TYPE_LABELS: Record<OnboardingFieldType, string> = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  select: 'Lista de opciones',
  date: 'Fecha',
  number: 'Número',
};

function FieldTypeBadge({ type }: { type: OnboardingFieldType }) {
  const colors: Record<OnboardingFieldType, string> = {
    text: 'bg-blue-100 text-blue-700',
    textarea: 'bg-purple-100 text-purple-700',
    select: 'bg-green-100 text-green-700',
    date: 'bg-orange-100 text-orange-700',
    number: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[type]}`}>
      {FIELD_TYPE_LABELS[type]}
    </span>
  );
}

const EMPTY_FORM = {
  label: '',
  fieldKey: '',
  fieldType: 'text' as OnboardingFieldType,
  placeholder: '',
  required: true,
  options: [] as FieldOption[],
};

export default function OnboardingFieldsPage() {
  const { profile } = useAuth();
  const [fields, setFields] = useState<OnboardingField[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<OnboardingField | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const loadFields = async () => {
    setLoading(true);
    try {
      const data = await getAllOnboardingFields();
      setFields(data);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los campos.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFields(); }, []);

  const openDialog = (field?: OnboardingField) => {
    if (field) {
      setEditingField(field);
      setForm({
        label: field.label,
        fieldKey: field.fieldKey,
        fieldType: field.fieldType,
        placeholder: field.placeholder || '',
        required: field.required,
        options: field.options ? [...field.options] : [],
      });
    } else {
      setEditingField(null);
      setForm({ ...EMPTY_FORM, options: [] });
    }
    setNewOptionLabel('');
    setDialogOpen(true);
  };

  // Auto-generate fieldKey from label
  const handleLabelChange = (label: string) => {
    const key = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    setForm({ ...form, label, fieldKey: editingField ? form.fieldKey : key });
  };

  const addOption = () => {
    if (!newOptionLabel.trim()) return;
    const option: FieldOption = {
      id: crypto.randomUUID(),
      value: newOptionLabel.trim().toLowerCase().replace(/\s+/g, '_'),
      label: newOptionLabel.trim(),
    };
    setForm({ ...form, options: [...form.options, option] });
    setNewOptionLabel('');
  };

  const removeOption = (id: string) => {
    setForm({ ...form, options: form.options.filter(o => o.id !== id) });
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const newOptions: FieldOption[] = lines.map(line => {
        // Support "value,label" or just "label"
        const parts = line.split(',');
        const label = parts.length >= 2 ? parts[1].trim() : parts[0].trim();
        const value = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
        return { id: crypto.randomUUID(), value, label };
      });
      setForm({ ...form, options: [...form.options, ...newOptions] });
      toast({ title: `${newOptions.length} opciones importadas` });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userId = profile?.uid || 'admin';
    if (!form.label.trim() || !form.fieldKey.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'El nombre y la clave son obligatorios.' });
      return;
    }
    if (form.fieldType === 'select' && form.options.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Agrega al menos una opción para el campo de selección.' });
      return;
    }

    setSaving(true);
    try {
      const data: Omit<OnboardingField, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
        organizationId: 'aviva-credito',
        label: form.label,
        fieldKey: form.fieldKey,
        fieldType: form.fieldType,
        placeholder: form.placeholder || undefined,
        required: form.required,
        options: form.fieldType === 'select' ? form.options : undefined,
        order: editingField ? editingField.order : fields.length,
        active: true,
      };

      if (editingField) {
        await updateOnboardingField(editingField.id, data);
        toast({ title: 'Campo actualizado' });
      } else {
        await createOnboardingField(data, userId);
        toast({ title: 'Campo creado' });
      }

      setDialogOpen(false);
      loadFields();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el campo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (field: OnboardingField) => {
    if (!confirm(`¿Eliminar el campo "${field.label}"?`)) return;
    try {
      await deleteOnboardingField(field.id);
      toast({ title: 'Campo eliminado' });
      loadFields();
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el campo.' });
    }
  };

  const moveField = async (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const target = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[target]] = [newFields[target], newFields[index]];
    setFields(newFields);
    // Update order in Firestore
    try {
      await Promise.all([
        updateOnboardingField(newFields[index].id, { order: index }),
        updateOnboardingField(newFields[target].id, { order: target }),
      ]);
    } catch {
      loadFields(); // revert on error
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Campos de Ingreso
          </h1>
          <p className="text-muted-foreground">
            Define los campos que verá el vendedor al ingresar por primera vez
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo Campo
        </Button>
      </div>

      {/* Fields List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Card key={i} className="h-20 animate-pulse bg-muted" />)}
        </div>
      ) : fields.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-40" />
            <p className="text-muted-foreground font-medium">No hay campos definidos</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crea el primer campo que verán los vendedores al hacer login
            </p>
            <Button className="mt-4" onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" /> Crear primer campo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <Card key={field.id} className={`transition-opacity ${!field.active ? 'opacity-50' : ''}`}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveField(index, 'up')} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                  <button onClick={() => moveField(index, 'down')} disabled={index === fields.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {index + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{field.label}</span>
                    <FieldTypeBadge type={field.fieldType} />
                    {field.required && (
                      <span className="text-xs text-destructive font-medium">* Requerido</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {field.fieldType === 'select' && field.options && (
                      <span className="text-xs text-muted-foreground">{field.options.length} opciones</span>
                    )}
                    {field.placeholder && (
                      <span className="text-xs text-muted-foreground italic truncate max-w-xs">
                        placeholder: {field.placeholder}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(field)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(field)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview */}
      {fields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa del formulario</CardTitle>
            <CardDescription>Así verán los vendedores este formulario al ingresar por primera vez</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-md space-y-4 p-4 border rounded-lg bg-muted/30">
              {fields.filter(f => f.active).map(field => (
                <div key={field.id} className="space-y-1.5">
                  <Label className="text-sm">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.fieldType === 'text' && (
                    <Input disabled placeholder={field.placeholder || `Ingresa ${field.label.toLowerCase()}`} className="bg-background" />
                  )}
                  {field.fieldType === 'textarea' && (
                    <Textarea disabled placeholder={field.placeholder || `Ingresa ${field.label.toLowerCase()}`} className="bg-background" rows={2} />
                  )}
                  {field.fieldType === 'date' && (
                    <Input type="date" disabled className="bg-background" />
                  )}
                  {field.fieldType === 'number' && (
                    <Input type="number" disabled placeholder={field.placeholder || '0'} className="bg-background" />
                  )}
                  {field.fieldType === 'select' && (
                    <Select disabled>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder={field.placeholder || 'Selecciona una opción...'} />
                      </SelectTrigger>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingField ? 'Editar Campo' : 'Nuevo Campo'}</DialogTitle>
              <DialogDescription>
                {editingField ? 'Modifica la configuración del campo' : 'Define un nuevo campo para el formulario de ingreso'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="label">Nombre del campo *</Label>
                <Input
                  id="label"
                  value={form.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="Ej: Fecha de ingreso, Capacitador, Sucursal..."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de campo *</Label>
                <Select value={form.fieldType} onValueChange={(v) => setForm({ ...form, fieldType: v as OnboardingFieldType, options: [] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                      <SelectItem key={type} value={type}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="placeholder">Placeholder (opcional)</Label>
                <Input
                  id="placeholder"
                  value={form.placeholder}
                  onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                  placeholder="Texto de ayuda que verá el vendedor"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="required"
                  checked={form.required}
                  onChange={(e) => setForm({ ...form, required: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="required" className="font-normal">Campo obligatorio</Label>
              </div>

              {/* Options for select type */}
              {form.fieldType === 'select' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Opciones *</Label>
                    <div className="flex gap-2">
                      <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={importCSV} />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => csvRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" /> Importar CSV
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    CSV: una opción por línea. Formato: <code>valor,Etiqueta</code> o solo <code>Etiqueta</code>
                  </p>

                  <div className="flex gap-2">
                    <Input
                      value={newOptionLabel}
                      onChange={(e) => setNewOptionLabel(e.target.value)}
                      placeholder="Nueva opción..."
                      className="text-sm"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addOption}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {form.options.length > 0 ? (
                    <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                      {form.options.map((opt) => (
                        <div key={opt.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div>
                            <span>{opt.label}</span>
                            <span className="ml-2 text-xs text-muted-foreground font-mono">{opt.value}</span>
                          </div>
                          <button type="button" onClick={() => removeOption(opt.id)} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">Sin opciones aún</p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : editingField ? 'Actualizar' : 'Crear campo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
