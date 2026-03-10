'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
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
import { HelpCircle, Plus, Pencil, Trash2, Search, Check, X, PenLine, ImageIcon, Upload } from 'lucide-react';
import type { QuestionFormData, QuestionType, QuestionOption, KnowledgeModule } from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS } from '@/lib/types-scalable';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

export default function QuestionsPage() {
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

      return matchesSearch && matchesProduct && matchesModule;
    });
  }, [questions, searchQuery, filterProduct, filterModule]);

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
    if (!confirm('¿Estás seguro de que quieres eliminar esta pregunta?')) {
      return;
    }

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

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de preguntas</CardDescription>
            <CardTitle className="text-3xl">{questions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Con módulo asignado</CardDescription>
            <CardTitle className="text-3xl">{questions.filter(q => q.module).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sin módulo</CardDescription>
            <CardTitle className="text-3xl">{questions.filter(q => !q.module).length}</CardTitle>
          </CardHeader>
        </Card>
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
        <div className="space-y-3">
          {filteredQuestions.map((question) => (
            <Card key={question.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-lg">{question.text}</p>
                        {question.explanation && (
                          <p className="text-sm text-muted-foreground mt-1">
                            💡 {question.explanation}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(question)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(question.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Options / Answers */}
                    {question.type === 'open_text' ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted text-muted-foreground italic">
                        <PenLine className="h-4 w-4 shrink-0" />
                        Respuesta abierta — calificación manual
                      </div>
                    ) : question.type === 'fill_in_the_blank' && question.validAnswers ? (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-xs text-muted-foreground self-center">Respuestas válidas:</span>
                        {question.validAnswers.map((ans: string) => (
                          <Badge key={ans} variant="secondary" className="text-xs">{ans}</Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {question.options.map((option: any, optIdx: number) => (
                          <div
                            key={option.text || optIdx}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                              option.isCorrect
                                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                : 'bg-muted'
                            }`}
                          >
                            {option.isCorrect ? (
                              <Check className="h-4 w-4 flex-shrink-0" />
                            ) : (
                              <X className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            )}
                            <span>{option.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-1 rounded-full bg-secondary">
                        {getProductName(question.productId)}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {QUESTION_TYPE_LABELS[question.type as QuestionType] || question.type}
                      </span>
                      {(question.isTricky || question.type === 'tricky') && (
                        <span className="text-xs px-2 py-1 rounded-full bg-purple-500 text-white">
                          ⚡ Tricky
                        </span>
                      )}
                      {question.module && (
                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium">
                          📡 {KNOWLEDGE_MODULE_LABELS[question.module as KnowledgeModule] ?? question.module}
                        </span>
                      )}
                      {question.category && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          {question.category}
                        </span>
                      )}
                      {question.tags.map((tag: string) => (
                        <span key={tag} className="text-xs px-2 py-1 rounded-full bg-muted">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
