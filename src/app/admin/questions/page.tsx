'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuestions, useProducts } from '@/hooks/use-firestore';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createQuestion, updateQuestion, deleteQuestion } from '@/lib/firestore-service';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { toast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { HelpCircle, Plus, Pencil, Trash2, Search, Check, X, PenLine, ImageIcon, Upload, AlertTriangle, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import type { QuestionFormData, QuestionType, QuestionOption, KnowledgeModule } from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS, KNOWLEDGE_MODULES } from '@/lib/types-scalable';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

type SortKey = 'recent' | 'text' | 'used' | 'rate';

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Más recientes',
  text: 'Texto (A-Z)',
  used: 'Más usadas',
  rate: 'Menor tasa de acierto',
};

const PAGE_SIZE = 50;

/**
 * Marca preguntas que probablemente vengan mal de una importación y que un
 * admin nunca encontraría a mano entre cientos de registros.
 */
function reviewReasons(q: any): string[] {
  const reasons: string[] = [];
  const needsOptions = q.type !== 'open_text' && q.type !== 'fill_in_the_blank';
  const options: { text?: string; isCorrect?: boolean }[] = q.options ?? [];

  if (needsOptions) {
    if (options.length < 2) reasons.push('Tiene menos de 2 opciones');
    if (!options.some(o => o.isCorrect)) reasons.push('Ninguna opción está marcada como correcta');
    if (options.some(o => !o.text?.trim())) reasons.push('Hay opciones vacías');
    // Restos de importación: nombres de canal / identificadores como respuesta
    if (options.some(o => /^#|_{2,}|^[a-z0-9_]+--/.test(o.text?.trim() ?? ''))) {
      reasons.push('Las opciones parecen identificadores, no respuestas');
    }
    const texts = options.map(o => (o.text ?? '').trim().toLowerCase()).filter(Boolean);
    if (new Set(texts).size !== texts.length) reasons.push('Hay opciones repetidas');
  }
  if (!q.text?.trim()) reasons.push('Sin enunciado');
  if (!q.module) reasons.push('Sin módulo — no puede entrar al Pulso');
  return reasons;
}

export default function QuestionsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { profile } = useAuth();
  const { products } = useProducts();
  const { questions, loading, refresh } = useQuestions();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterModule, setFilterModule] = useState<string>(() => searchParams.get('module') ?? 'all');

  // Sync module filter if URL param changes (e.g. navigating from categories page)
  useEffect(() => {
    const mod = searchParams.get('module');
    if (mod) setFilterModule(mod);
  }, [searchParams]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // ── Vista de banco: orden, paginación, selección y filas expandidas ──
  // Antes se renderizaban las N preguntas como tarjetas completas: con cientos
  // de preguntas la página era un muro de scroll imposible de navegar.
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);
  const [bulkModule, setBulkModule] = useState<string>('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const [formData, setFormData] = useState<QuestionFormData>({
    text: '',
    explanation: '',
    imageUrl: '',
    type: 'single_choice',
    options: [
      { text: '', isCorrect: false, order: 0 },
      { text: '', isCorrect: false, order: 1 },
    ],
    tags: [],
    category: '',
    module: undefined,
    isTricky: false,
    trickyHint: '',
    validAnswers: [],
    modelAnswer: '',
  });
  const [validAnswerInput, setValidAnswerInput] = useState('');
  const [distractorInput, setDistractorInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Helpers for question type switching ──────────────────────────────────
  function getDefaultOptionsForType(type: QuestionType): Omit<QuestionOption, 'id'>[] {
    if (type === 'true_false') {
      return [
        { text: 'Verdadero', isCorrect: false, order: 0 },
        { text: 'Falso', isCorrect: false, order: 1 },
      ];
    }
    if (type === 'open_text') return [];
    return [
      { text: '', isCorrect: false, order: 0 },
      { text: '', isCorrect: false, order: 1 },
    ];
  }

  function handleTypeChange(newType: QuestionType) {
    setFormData(prev => ({
      ...prev,
      type: newType,
      options: getDefaultOptionsForType(newType),
      isTricky: newType === 'tricky' ? true : prev.isTricky,
      validAnswers: newType === 'fill_in_the_blank' ? (prev.validAnswers || []) : [],
    }));
  }

  const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    single_choice: 'Selección Simple',
    multiple_choice: 'Selección Múltiple',
    true_false: 'Verdadero / Falso',
    fill_in_the_blank: 'Completar espacio',
    open_text: 'Respuesta abierta',
    tricky: 'Pregunta Tricky ⚡',
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      const matchesSearch =
        question.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (question.category && question.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
        question.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesProduct = filterProduct === 'all' || question.productId === filterProduct;
      const matchesModule = filterModule === 'all' || question.module === filterModule || (filterModule === 'none' && !question.module);
      const matchesReview = !onlyNeedsReview || reviewReasons(question).length > 0;

      return matchesSearch && matchesProduct && matchesModule && matchesReview;
    });
  }, [questions, searchQuery, filterProduct, filterModule, onlyNeedsReview]);

  const sortedQuestions = useMemo(() => {
    const list = [...filteredQuestions];
    switch (sortBy) {
      case 'text':
        return list.sort((a, b) => (a.text ?? '').localeCompare(b.text ?? ''));
      case 'used':
        return list.sort((a, b) => (b.timesUsed ?? 0) - (a.timesUsed ?? 0));
      case 'rate':
        // Las de peor desempeño primero: son las que hay que revisar/reescribir.
        // Las que nunca se han usado no tienen tasa real, van al final.
        return list.sort((a, b) => {
          const au = a.timesUsed ?? 0, bu = b.timesUsed ?? 0;
          if (au === 0 && bu === 0) return 0;
          if (au === 0) return 1;
          if (bu === 0) return -1;
          return (a.averageCorrectRate ?? 0) - (b.averageCorrectRate ?? 0);
        });
      default: {
        const ms = (q: any) => {
          const ts = q.createdAt;
          if (!ts) return 0;
          if (typeof ts.toMillis === 'function') return ts.toMillis();
          return (ts.seconds ?? 0) * 1000;
        };
        return list.sort((a, b) => ms(b) - ms(a));
      }
    }
  }, [filteredQuestions, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedQuestions.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageQuestions = sortedQuestions.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // Al cambiar filtros u orden se vuelve al principio del listado
  useEffect(() => { setPage(0); }, [searchQuery, filterProduct, filterModule, sortBy, onlyNeedsReview]);

  const missingModuleCount = useMemo(() => questions.filter(q => !q.module).length, [questions]);
  const needsReviewCount = useMemo(() => questions.filter(q => reviewReasons(q).length > 0).length, [questions]);

  const pageAllSelected = pageQuestions.length > 0 && pageQuestions.every(q => selectedIds.has(q.id));
  const togglePageSelection = () => setSelectedIds(prev => {
    const next = new Set(prev);
    if (pageAllSelected) pageQuestions.forEach(q => next.delete(q.id));
    else pageQuestions.forEach(q => next.add(q.id));
    return next;
  });
  const toggleSelected = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /** Asigna un módulo a todas las preguntas seleccionadas de una sola vez.
   *  Sin esto, poner módulo a cientos de preguntas importadas implicaba
   *  abrirlas y guardarlas una por una. */
  const handleBulkAssignModule = async () => {
    if (!bulkModule || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkSaving(true);
    try {
      await Promise.all(ids.map(id => updateQuestion(id, { module: bulkModule as KnowledgeModule })));
      toast({
        title: 'Módulo asignado',
        description: `${ids.length} pregunta${ids.length === 1 ? '' : 's'} actualizada${ids.length === 1 ? '' : 's'}.`,
      });
      setSelectedIds(new Set());
      setBulkModule('');
      refresh();
    } catch {
      toast({ variant: 'destructive', title: 'No se pudieron asignar los módulos' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const ok = await confirm({
      title: `¿Eliminar ${ids.length} pregunta${ids.length === 1 ? '' : 's'}?`,
      description: 'Se quitarán del banco y de las evaluaciones que las usen.',
    });
    if (!ok) return;
    setBulkSaving(true);
    try {
      await Promise.all(ids.map(id => deleteQuestion(id)));
      toast({ title: `${ids.length} pregunta${ids.length === 1 ? '' : 's'} eliminada${ids.length === 1 ? '' : 's'}` });
      setSelectedIds(new Set());
      refresh();
    } catch {
      toast({ variant: 'destructive', title: 'No se pudieron eliminar' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleOpenDialog = (question?: any) => {
    if (question) {
      setEditingQuestion(question);
      setFormData({
        text: question.text,
        explanation: question.explanation || '',
        imageUrl: question.imageUrl || '',
        type: question.type,
        options: question.options,
        tags: question.tags || [],
        category: question.category || '',
        module: question.module || undefined,
        isTricky: question.isTricky,
        trickyHint: question.trickyHint || '',
        validAnswers: question.validAnswers || [],
        modelAnswer: question.modelAnswer || '',
      });
      setTagsInput((question.tags || []).join(', '));
      setValidAnswerInput('');
      setDistractorInput('');
      setSelectedProductId(question.productId);
    } else {
      setEditingQuestion(null);
      setFormData({
        text: '',
        explanation: '',
        imageUrl: '',
        type: 'single_choice',
        options: [
          { text: '', isCorrect: false, order: 0 },
          { text: '', isCorrect: false, order: 1 },
        ],
        tags: [],
        category: '',
        module: undefined,
        isTricky: false,
        trickyHint: '',
        validAnswers: [],
        modelAnswer: '',
      });
      setTagsInput('');
      setValidAnswerInput('');
      setDistractorInput('');
      setSelectedProductId(products[0]?.id || '');
    }
    setDialogOpen(true);
  };

  async function handleImageUpload(file: File) {
    if (!storage) return;
    setImageUploading(true);
    const path = `certificates/question-images/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on(
      'state_changed',
      () => {},
      () => { toast({ variant: 'destructive', title: 'Error al subir imagen' }); setImageUploading(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setFormData(prev => ({ ...prev, imageUrl: url }));
        setImageUploading(false);
      }
    );
  }

  const addOption = () => {
    setFormData({
      ...formData,
      options: [
        ...formData.options,
        { text: '', isCorrect: false, order: formData.options.length },
      ],
    });
  };

  const removeOption = (index: number) => {
    if (formData.options.length <= 2) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debe haber al menos 2 opciones.',
      });
      return;
    }

    const newOptions = formData.options.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      options: newOptions.map((opt, i) => ({ ...opt, order: i })),
    });
  };

  const updateOption = (index: number, field: 'text' | 'isCorrect', value: string | boolean) => {
    const newOptions = [...formData.options];
    newOptions[index] = { ...newOptions[index], [field]: value };

    // Si es single choice y marcamos una como correcta, desmarcamos las demás
    if (field === 'isCorrect' && value === true && formData.type === 'single_choice') {
      newOptions.forEach((opt, i) => {
        if (i !== index) {
          opt.isCorrect = false;
        }
      });
    }

    setFormData({ ...formData, options: newOptions });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProductId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Selecciona un producto primero.',
      });
      return;
    }

    // Validaciones según tipo
    if (formData.type === 'open_text') {
      // Sin opciones — no validar
    } else if (formData.type === 'fill_in_the_blank') {
      if (!formData.validAnswers || formData.validAnswers.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Agrega al menos una respuesta válida.' });
        return;
      }
    } else {
      if (formData.options.length < 2) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debe haber al menos 2 opciones.' });
        return;
      }
      const correctOptions = formData.options.filter(opt => opt.isCorrect);
      if (correctOptions.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Debe haber al menos una respuesta correcta.' });
        return;
      }
      if ((formData.type === 'single_choice' || formData.type === 'true_false') && correctOptions.length > 1) {
        toast({ variant: 'destructive', title: 'Error', description: 'Solo puede haber una respuesta correcta para este tipo.' });
        return;
      }
    }

    setSaving(true);

    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      // For fill_in_the_blank: build final options = [correct word, ...distractors]
      let finalOptions = formData.options;
      if (formData.type === 'fill_in_the_blank' && (formData.validAnswers || []).length > 0) {
        const distractors = formData.options.filter(o => !o.isCorrect);
        finalOptions = [
          { text: formData.validAnswers![0], isCorrect: true, order: 0 },
          ...distractors.map((d, i) => ({ ...d, order: i + 1 })),
        ];
      }

      const questionData = {
        organizationId: 'aviva-credito',
        productId: selectedProductId,
        ...formData,
        imageUrl: formData.imageUrl || undefined,
        options: finalOptions,
        tags,
        active: true,
      };

      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, questionData);
        toast({
          title: 'Pregunta actualizada',
          description: 'La pregunta se actualizó correctamente.',
        });
      } else {
        await createQuestion(questionData, profile?.uid || 'admin');
        toast({
          title: 'Pregunta creada',
          description: 'La pregunta se creó correctamente.',
        });
      }

      setDialogOpen(false);
      refresh();
    } catch (error) {
      console.error('Error saving question:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar la pregunta.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (questionId: string) => {
    const ok = await confirm({
      title: '¿Eliminar esta pregunta?',
      description: 'Se quitará del banco y de las evaluaciones que la usen.',
    });
    if (!ok) return;

    try {
      await deleteQuestion(questionId);
      toast({
        title: 'Pregunta eliminada',
        description: 'La pregunta se eliminó correctamente.',
      });
      refresh();
    } catch (error) {
      console.error('Error deleting question:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo eliminar la pregunta.',
      });
    }
  };

  const getProductName = (productId: string) => {
    return products.find(p => p.id === productId)?.name || 'Desconocido';
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Preguntas</h1>
          <p className="text-muted-foreground">
            Crea y organiza preguntas individuales. Luego úsalas en tus Evaluaciones.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Pregunta
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingQuestion ? 'Editar Pregunta' : 'Nueva Pregunta'}
                </DialogTitle>
                <DialogDescription>
                  Completa la información de la pregunta y sus opciones
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Producto */}
                <div className="space-y-2">
                  <Label htmlFor="product">Producto *</Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un producto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Texto de la pregunta */}
                <div className="space-y-2">
                  <Label htmlFor="text">Pregunta *</Label>
                  <Textarea
                    id="text"
                    value={formData.text}
                    onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                    placeholder="Escribe la pregunta aquí"
                    rows={3}
                    required
                  />
                </div>

                {/* Imagen de la pregunta (opcional) */}
                <div className="space-y-2">
                  <Label>Imagen de la pregunta <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                  />
                  {formData.imageUrl ? (
                    <div className="relative inline-block">
                      <img src={formData.imageUrl} alt="Imagen de la pregunta" className="max-h-40 rounded-lg border object-contain" />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-dashed gap-2"
                      disabled={imageUploading}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      {imageUploading ? (
                        <><Upload className="h-4 w-4 animate-pulse" /> Subiendo…</>
                      ) : (
                        <><ImageIcon className="h-4 w-4" /> Agregar imagen</>
                      )}
                    </Button>
                  )}
                </div>

                {/* Tipo */}
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select value={formData.type} onValueChange={(v) => handleTypeChange(v as QuestionType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {formData.type === 'true_false' && 'El alumno elige entre Verdadero o Falso.'}
                    {formData.type === 'fill_in_the_blank' && 'El alumno toca la respuesta del banco de palabras. Usa ___ en el texto para indicar el espacio en blanco.'}
                    {formData.type === 'open_text' && 'Respuesta libre. Calificación manual por el admin.'}
                    {formData.type === 'single_choice' && 'El alumno elige una sola opción correcta.'}
                    {formData.type === 'multiple_choice' && 'El alumno puede elegir varias opciones correctas.'}
                    {formData.type === 'tricky' && 'Otorga una vida extra si se responde correctamente.'}
                  </p>
                </div>

                {/* ── Opciones (single, multiple, tricky) ────────────────── */}
                {(formData.type === 'single_choice' || formData.type === 'multiple_choice' || formData.type === 'tricky') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Opciones de Respuesta *</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addOption}>
                        <Plus className="h-4 w-4 mr-1" /> Agregar opción
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {formData.options.map((option, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Switch
                            checked={option.isCorrect}
                            onCheckedChange={(checked) => updateOption(index, 'isCorrect', checked)}
                          />
                          <Input
                            value={option.text}
                            onChange={(e) => updateOption(index, 'text', e.target.value)}
                            placeholder={`Opción ${index + 1}`}
                            className="flex-1"
                          />
                          {formData.options.length > 2 && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Activa el switch para marcar las respuestas correctas</p>
                  </div>
                )}

                {/* ── Verdadero / Falso ───────────────────────────────────── */}
                {formData.type === 'true_false' && (
                  <div className="space-y-2">
                    <Label>Respuesta correcta *</Label>
                    <div className="flex gap-3">
                      {(['Verdadero', 'Falso'] as const).map((val, idx) => {
                        const isSelected = formData.options[idx]?.isCorrect;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              const opts = [
                                { text: 'Verdadero', isCorrect: val === 'Verdadero', order: 0 },
                                { text: 'Falso', isCorrect: val === 'Falso', order: 1 },
                              ];
                              setFormData(prev => ({ ...prev, options: opts }));
                            }}
                            className={`flex-1 py-3 rounded-lg border-2 font-medium text-sm transition-all ${
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-muted hover:border-primary/40'
                            }`}
                          >
                            {val === 'Verdadero' ? '✓ Verdadero' : '✗ Falso'}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">Selecciona cuál es la respuesta correcta</p>
                  </div>
                )}

                {/* ── Fill in the blank ───────────────────────────────────── */}
                {formData.type === 'fill_in_the_blank' && (
                  <div className="space-y-4">
                    {/* Correct answer variations */}
                    <div className="space-y-2">
                      <Label>Respuesta correcta * <span className="text-muted-foreground font-normal">(sin distinción de mayúsculas)</span></Label>
                      <div className="flex gap-2">
                        <Input
                          value={validAnswerInput}
                          onChange={e => setValidAnswerInput(e.target.value)}
                          placeholder="Ej: crédito de consumo"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = validAnswerInput.trim();
                              if (val && !formData.validAnswers?.includes(val)) {
                                setFormData(prev => ({ ...prev, validAnswers: [...(prev.validAnswers || []), val] }));
                                setValidAnswerInput('');
                              }
                            }
                          }}
                        />
                        <Button type="button" variant="outline" onClick={() => {
                          const val = validAnswerInput.trim();
                          if (val && !formData.validAnswers?.includes(val)) {
                            setFormData(prev => ({ ...prev, validAnswers: [...(prev.validAnswers || []), val] }));
                            setValidAnswerInput('');
                          }
                        }}>Agregar</Button>
                      </div>
                      {(formData.validAnswers || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(formData.validAnswers || []).map(ans => (
                            <Badge key={ans} variant="default" className="gap-1 cursor-pointer"
                              onClick={() => setFormData(prev => ({ ...prev, validAnswers: (prev.validAnswers || []).filter(a => a !== ans) }))}>
                              ✓ {ans} <X className="h-3 w-3" />
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">La primera variación se mostrará en el banco de palabras. Agrega más variaciones para aceptar distintas escrituras (ej: con/sin tilde).</p>
                    </div>

                    {/* Word bank distractors */}
                    <div className="space-y-2">
                      <Label>Palabras distractoras <span className="text-muted-foreground font-normal">(banco de palabras)</span></Label>
                      <div className="flex gap-2">
                        <Input
                          value={distractorInput}
                          onChange={e => setDistractorInput(e.target.value)}
                          placeholder="Ej: crédito hipotecario"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = distractorInput.trim();
                              if (val && !formData.options.some(o => o.text === val)) {
                                setFormData(prev => ({ ...prev, options: [...prev.options.filter(o => !o.isCorrect), { text: val, isCorrect: false, order: prev.options.length }] }));
                                setDistractorInput('');
                              }
                            }
                          }}
                        />
                        <Button type="button" variant="outline" onClick={() => {
                          const val = distractorInput.trim();
                          if (val && !formData.options.some(o => o.text === val)) {
                            setFormData(prev => ({ ...prev, options: [...prev.options.filter(o => !o.isCorrect), { text: val, isCorrect: false, order: prev.options.length }] }));
                            setDistractorInput('');
                          }
                        }}>Agregar</Button>
                      </div>
                      {formData.options.filter(o => !o.isCorrect).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {formData.options.filter(o => !o.isCorrect).map((opt, i) => (
                            <Badge key={i} variant="secondary" className="gap-1 cursor-pointer"
                              onClick={() => setFormData(prev => ({ ...prev, options: prev.options.filter(o => o.text !== opt.text) }))}>
                              {opt.text} <X className="h-3 w-3" />
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Agrega palabras incorrectas que aparecerán junto a la correcta. El alumno debe seleccionar la respuesta correcta tocándola.</p>
                    </div>
                  </div>
                )}

                {/* ── Open text ──────────────────────────────────────────── */}
                {formData.type === 'open_text' && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 flex items-start gap-3 text-sm">
                      <PenLine className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <div className="text-blue-700">
                        <p className="font-medium">Auto-evaluación por palabras clave</p>
                        <p className="text-xs mt-0.5">Define los conceptos clave que debe mencionar el alumno. Se califica automáticamente: 100% si menciona todos, proporcional si menciona algunos.</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Conceptos clave obligatorios <span className="text-muted-foreground font-normal">(auto-evaluación)</span></Label>
                      <div className="flex gap-2">
                        <Input
                          value={validAnswerInput}
                          onChange={e => setValidAnswerInput(e.target.value)}
                          placeholder="Ej: tasa de interés"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = validAnswerInput.trim();
                              if (val && !formData.validAnswers?.includes(val)) {
                                setFormData(prev => ({ ...prev, validAnswers: [...(prev.validAnswers || []), val] }));
                                setValidAnswerInput('');
                              }
                            }
                          }}
                        />
                        <Button type="button" variant="outline" onClick={() => {
                          const val = validAnswerInput.trim();
                          if (val && !formData.validAnswers?.includes(val)) {
                            setFormData(prev => ({ ...prev, validAnswers: [...(prev.validAnswers || []), val] }));
                            setValidAnswerInput('');
                          }
                        }}>Agregar</Button>
                      </div>
                      {(formData.validAnswers || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(formData.validAnswers || []).map(kw => (
                            <Badge key={kw} variant="secondary" className="gap-1 cursor-pointer"
                              onClick={() => setFormData(prev => ({ ...prev, validAnswers: (prev.validAnswers || []).filter(k => k !== kw) }))}>
                              {kw} <X className="h-3 w-3" />
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Si no defines conceptos clave, cualquier respuesta se considerará válida.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Respuesta modelo <span className="text-muted-foreground font-normal">(referencia para el alumno)</span></Label>
                      <Textarea
                        value={formData.modelAnswer || ''}
                        onChange={e => setFormData(prev => ({ ...prev, modelAnswer: e.target.value }))}
                        placeholder="Escribe aquí la respuesta ideal o completa que un alumno debería dar..."
                        rows={3}
                      />
                      <p className="text-[11px] text-muted-foreground">Se muestra al alumno como retroalimentación después de responder.</p>
                    </div>
                  </div>
                )}

                {/* ── Tricky toggle (para single/multiple) ───────────────── */}
                {(formData.type === 'single_choice' || formData.type === 'multiple_choice') && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.isTricky}
                      onCheckedChange={(checked) => setFormData({ ...formData, isTricky: checked })}
                    />
                    <Label className="font-normal">Pregunta Tricky ⚡ — otorga vida extra si se responde correctamente</Label>
                  </div>
                )}

                {(formData.isTricky || formData.type === 'tricky') && (
                  <div className="space-y-2">
                    <Label>Pista (opcional)</Label>
                    <Input
                      value={formData.trickyHint}
                      onChange={(e) => setFormData({ ...formData, trickyHint: e.target.value })}
                      placeholder="Pista que aparecerá antes de responder"
                    />
                  </div>
                )}

                {/* Explicación */}
                <div className="space-y-2">
                  <Label htmlFor="explanation">Explicación (opcional)</Label>
                  <Textarea
                    id="explanation"
                    value={formData.explanation}
                    onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                    placeholder="Explica por qué esta es la respuesta correcta"
                    rows={2}
                  />
                </div>

                {/* Módulo Knowledge Pulse */}
                <div className="space-y-2">
                  <Label>Módulo de Conocimiento (Pulso Diario)</Label>
                  <Select
                    value={formData.module || 'none'}
                    onValueChange={(v) => setFormData({ ...formData, module: v === 'none' ? undefined : v as KnowledgeModule })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin módulo asignado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin módulo</SelectItem>
                      {(Object.entries(KNOWLEDGE_MODULE_LABELS) as [KnowledgeModule, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Asigna un módulo para incluir esta pregunta en el Pulso de Conocimiento diario.</p>
                </div>

                {/* Categoría y Tags */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoría</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Ej: Requisitos, Documentación"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags (separados por comas)</Label>
                    <Input
                      id="tags"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="crédito, requisitos, proceso"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando...' : editingQuestion ? 'Actualizar' : 'Crear Pregunta'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar preguntas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={filterProduct} onValueChange={setFilterProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por producto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los productos</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterModule} onValueChange={setFilterModule}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los módulos</SelectItem>
                <SelectItem value="none">Sin módulo</SelectItem>
                {(Object.entries(KNOWLEDGE_MODULE_LABELS) as [KnowledgeModule, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Salud del banco — accionable, no sólo estadística.
          Antes eran tres tarjetas grandes con números pasivos; el dato
          importante (preguntas sin módulo, que no pueden entrar al Pulso)
          quedaba como una cifra sin salida. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          <strong className="text-foreground">{questions.length}</strong> preguntas en el banco
        </span>
        {missingModuleCount > 0 && (
          <button
            onClick={() => { setFilterModule('none'); setOnlyNeedsReview(false); }}
            className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
            title="Filtrar las preguntas sin módulo para asignarlo en bloque"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {missingModuleCount} sin módulo — no entran al Pulso
          </button>
        )}
        {needsReviewCount > 0 && (
          <button
            onClick={() => { setOnlyNeedsReview(v => !v); setFilterModule('all'); }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              onlyNeedsReview
                ? 'border-red-400 bg-red-100 text-red-800'
                : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
            }`}
            title="Preguntas con problemas de formato (posibles restos de importación)"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {needsReviewCount} por revisar
          </button>
        )}
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="h-32 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filteredQuestions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {searchQuery || filterProduct !== 'all' || filterModule !== 'all'
                ? 'No se encontraron preguntas con los filtros seleccionados'
                : 'No hay preguntas aún'}
            </p>
            {!searchQuery && filterProduct === 'all' && filterModule === 'all' && (
              <Button className="mt-4" onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Primera Pregunta
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Barra de acciones masivas — aparece al seleccionar filas */}
          {selectedIds.size > 0 && (
            <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 border-primary/30 px-3 py-2">
              <span className="text-sm font-medium">
                {selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-xs text-muted-foreground">Asignar módulo:</span>
                <Select value={bulkModule} onValueChange={setBulkModule}>
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue placeholder="Elige un módulo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWLEDGE_MODULES.map(mod => (
                      <SelectItem key={mod} value={mod}>{KNOWLEDGE_MODULE_LABELS[mod]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" disabled={!bulkModule || bulkSaving} onClick={handleBulkAssignModule}>
                  {bulkSaving ? 'Aplicando...' : 'Aplicar'}
                </Button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30" disabled={bulkSaving} onClick={handleBulkDelete}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelectedIds(new Set())}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Encabezado del listado: conteo + orden */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Mostrando {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, sortedQuestions.length)} de {sortedQuestions.length}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Ordenar:</span>
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortKey)}>
                <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tabla densa: una fila por pregunta, opciones bajo demanda */}
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="w-9 px-3 py-2">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={pageAllSelected}
                      onChange={togglePageSelection}
                      aria-label="Seleccionar todas las de esta página"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Pregunta</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap hidden lg:table-cell">Producto</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap hidden md:table-cell">Tipo</th>
                  <th className="px-2 py-2 font-medium whitespace-nowrap">Módulo</th>
                  <th className="px-2 py-2 font-medium text-right whitespace-nowrap hidden sm:table-cell" title="Veces usada en evaluaciones">Usos</th>
                  <th className="px-2 py-2 font-medium text-right whitespace-nowrap hidden sm:table-cell" title="Tasa de acierto">Acierto</th>
                  <th className="w-20 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageQuestions.map((question) => {
                  const reasons = reviewReasons(question);
                  const isExpanded = expandedId === question.id;
                  const used = question.timesUsed ?? 0;
                  return (
                    <React.Fragment key={question.id}>
                      <tr className={`hover:bg-muted/30 ${selectedIds.has(question.id) ? 'bg-primary/5' : ''}`}>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            className="accent-primary mt-0.5"
                            checked={selectedIds.has(question.id)}
                            onChange={() => toggleSelected(question.id)}
                            aria-label="Seleccionar pregunta"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : question.id)}
                            className="flex items-start gap-1.5 text-left group"
                          >
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
                            <span className="line-clamp-2 group-hover:text-primary transition-colors">
                              {question.text || <span className="italic text-muted-foreground">(sin enunciado)</span>}
                            </span>
                          </button>
                          <div className="flex items-center gap-1.5 mt-1 ml-5 flex-wrap">
                            {reasons.length > 0 && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5"
                                title={reasons.join(' · ')}
                              >
                                <AlertTriangle className="h-3 w-3" /> revisar
                              </span>
                            )}
                            {(question.isTricky || question.type === 'tricky') && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">⚡ tricky</span>
                            )}
                            {question.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{question.category}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top text-xs text-muted-foreground hidden lg:table-cell">
                          {getProductName(question.productId)}
                        </td>
                        <td className="px-2 py-2 align-top text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                          {QUESTION_TYPE_LABELS[question.type as QuestionType] || question.type}
                        </td>
                        <td className="px-2 py-2 align-top whitespace-nowrap">
                          {question.module ? (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {KNOWLEDGE_MODULE_LABELS[question.module as KnowledgeModule] ?? question.module}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-700">— sin módulo</span>
                          )}
                        </td>
                        <td className="px-2 py-2 align-top text-right text-xs tabular-nums hidden sm:table-cell">
                          {used > 0 ? used : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 align-top text-right text-xs tabular-nums hidden sm:table-cell">
                          {used > 0
                            ? <span className={question.averageCorrectRate >= 70 ? 'text-green-600' : question.averageCorrectRate >= 50 ? 'text-amber-600' : 'text-red-600'}>
                                {Math.round(question.averageCorrectRate ?? 0)}%
                              </span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <div className="flex justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenDialog(question)} aria-label="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(question.id)} aria-label="Eliminar">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Detalle: opciones y explicación, sólo al expandir */}
                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td />
                          <td colSpan={7} className="px-2 pb-3 pt-1">
                            {reasons.length > 0 && (
                              <ul className="mb-2 text-xs text-red-700 list-disc list-inside space-y-0.5">
                                {reasons.map(r => <li key={r}>{r}</li>)}
                              </ul>
                            )}
                            {question.explanation && (
                              <p className="text-xs text-muted-foreground mb-2">💡 {question.explanation}</p>
                            )}
                            {question.type === 'open_text' ? (
                              <p className="text-xs italic text-muted-foreground">Respuesta abierta — calificación manual</p>
                            ) : question.type === 'fill_in_the_blank' && question.validAnswers ? (
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="text-xs text-muted-foreground">Respuestas válidas:</span>
                                {question.validAnswers.map((ans: string) => (
                                  <Badge key={ans} variant="secondary" className="text-xs">{ans}</Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-1 max-w-2xl">
                                {question.options.map((option: any, optIdx: number) => (
                                  <div
                                    key={option.text || optIdx}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs ${
                                      option.isCorrect ? 'bg-green-500/10 text-green-700' : 'bg-background border'
                                    }`}
                                  >
                                    {option.isCorrect
                                      ? <Check className="h-3.5 w-3.5 shrink-0" />
                                      : <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                                    <span>{option.text || <span className="italic text-muted-foreground">(vacía)</span>}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {question.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {question.tags.map((tag: string) => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{tag}</span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-8" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                Página {currentPage + 1} de {totalPages}
              </span>
              <Button variant="outline" size="sm" className="h-8" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>
                Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
