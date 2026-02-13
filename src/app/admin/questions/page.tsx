'use client';

import { useState, useMemo } from 'react';
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
import { toast } from '@/hooks/use-toast';
import { HelpCircle, Plus, Pencil, Trash2, Search, Filter, Check, X } from 'lucide-react';
import type { QuestionFormData, QuizDifficulty, QuestionType } from '@/lib/types-scalable';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

export default function QuestionsPage() {
  const { profile } = useAuth();
  const { products } = useProducts();
  const { questions, loading, refresh } = useQuestions();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<QuestionFormData>({
    text: '',
    explanation: '',
    type: 'single_choice',
    difficulty: 'medium',
    options: [
      { text: '', isCorrect: false, order: 0 },
      { text: '', isCorrect: false, order: 1 },
    ],
    tags: [],
    category: '',
    isTricky: false,
    trickyHint: '',
  });
  const [tagsInput, setTagsInput] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      const matchesSearch =
        question.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (question.category && question.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
        question.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesProduct = filterProduct === 'all' || question.productId === filterProduct;
      const matchesDifficulty = filterDifficulty === 'all' || question.difficulty === filterDifficulty;

      return matchesSearch && matchesProduct && matchesDifficulty;
    });
  }, [questions, searchQuery, filterProduct, filterDifficulty]);

  const handleOpenDialog = (question?: any) => {
    if (question) {
      setEditingQuestion(question);
      setFormData({
        text: question.text,
        explanation: question.explanation || '',
        type: question.type,
        difficulty: question.difficulty,
        options: question.options,
        tags: question.tags || [],
        category: question.category || '',
        isTricky: question.isTricky,
        trickyHint: question.trickyHint || '',
      });
      setTagsInput((question.tags || []).join(', '));
      setSelectedProductId(question.productId);
    } else {
      setEditingQuestion(null);
      setFormData({
        text: '',
        explanation: '',
        type: 'single_choice',
        difficulty: 'medium',
        options: [
          { text: '', isCorrect: false, order: 0 },
          { text: '', isCorrect: false, order: 1 },
        ],
        tags: [],
        category: '',
        isTricky: false,
        trickyHint: '',
      });
      setTagsInput('');
      setSelectedProductId(products[0]?.id || '');
    }
    setDialogOpen(true);
  };

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

    if (!profile?.id || !selectedProductId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Falta información requerida.',
      });
      return;
    }

    // Validaciones
    if (formData.options.length < 2) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debe haber al menos 2 opciones.',
      });
      return;
    }

    const correctOptions = formData.options.filter(opt => opt.isCorrect);
    if (correctOptions.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debe haber al menos una respuesta correcta.',
      });
      return;
    }

    if (formData.type === 'single_choice' && correctOptions.length > 1) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'En preguntas de selección simple solo puede haber una respuesta correcta.',
      });
      return;
    }

    setSaving(true);

    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const questionData = {
        organizationId: 'aviva-credito',
        productId: selectedProductId,
        ...formData,
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
        await createQuestion(questionData, profile.id);
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

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'hard': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Banco de Preguntas</h1>
          <p className="text-muted-foreground">
            Gestiona el repositorio de preguntas para tus quizzes
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

                {/* Tipo y dificultad */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipo *</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value as QuestionType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single_choice">Selección Simple</SelectItem>
                        <SelectItem value="multiple_choice">Selección Múltiple</SelectItem>
                        <SelectItem value="tricky">Pregunta Tricky</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="difficulty">Dificultad *</Label>
                    <Select
                      value={formData.difficulty}
                      onValueChange={(value) => setFormData({ ...formData, difficulty: value as QuizDifficulty })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Fácil</SelectItem>
                        <SelectItem value="medium">Medio</SelectItem>
                        <SelectItem value="hard">Difícil</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Opciones */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Opciones de Respuesta *</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addOption}>
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar opción
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {formData.options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="flex items-center">
                          <Switch
                            checked={option.isCorrect}
                            onCheckedChange={(checked) => updateOption(index, 'isCorrect', checked)}
                          />
                        </div>
                        <Input
                          value={option.text}
                          onChange={(e) => updateOption(index, 'text', e.target.value)}
                          placeholder={`Opción ${index + 1}`}
                          required
                          className="flex-1"
                        />
                        {formData.options.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOption(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Activa el switch para marcar las respuestas correctas
                  </p>
                </div>

                {/* Pregunta Tricky */}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isTricky}
                    onCheckedChange={(checked) => setFormData({ ...formData, isTricky: checked })}
                  />
                  <Label>Pregunta Tricky (otorga vida extra si se responde correctamente)</Label>
                </div>

                {formData.isTricky && (
                  <div className="space-y-2">
                    <Label htmlFor="trickyHint">Pista para pregunta tricky</Label>
                    <Input
                      id="trickyHint"
                      value={formData.trickyHint}
                      onChange={(e) => setFormData({ ...formData, trickyHint: e.target.value })}
                      placeholder="Pista opcional para ayudar al usuario"
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

            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por dificultad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las dificultades</SelectItem>
                <SelectItem value="easy">Fácil</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="hard">Difícil</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-3xl">{questions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fáciles</CardDescription>
            <CardTitle className="text-3xl">
              {questions.filter(q => q.difficulty === 'easy').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Medias</CardDescription>
            <CardTitle className="text-3xl">
              {questions.filter(q => q.difficulty === 'medium').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Difíciles</CardDescription>
            <CardTitle className="text-3xl">
              {questions.filter(q => q.difficulty === 'hard').length}
            </CardTitle>
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
              {searchQuery || filterProduct !== 'all' || filterDifficulty !== 'all'
                ? 'No se encontraron preguntas con los filtros seleccionados'
                : 'No hay preguntas aún'}
            </p>
            {!searchQuery && filterProduct === 'all' && filterDifficulty === 'all' && (
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

                    {/* Options */}
                    <div className="space-y-1">
                      {question.options.map((option, index) => (
                        <div
                          key={option.id}
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

                    {/* Metadata */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-1 rounded-full bg-secondary">
                        {getProductName(question.productId)}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full text-white ${getDifficultyColor(question.difficulty)}`}>
                        {question.difficulty === 'easy' ? 'Fácil' : question.difficulty === 'medium' ? 'Medio' : 'Difícil'}
                      </span>
                      {question.isTricky && (
                        <span className="text-xs px-2 py-1 rounded-full bg-purple-500 text-white">
                          ⚡ Tricky
                        </span>
                      )}
                      {question.category && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          {question.category}
                        </span>
                      )}
                      {question.tags.map((tag) => (
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
