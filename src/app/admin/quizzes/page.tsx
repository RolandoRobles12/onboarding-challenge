'use client';

import { useState } from 'react';
import { useQuizzes, useProducts } from '@/hooks/use-firestore';
import { deleteQuiz, publishQuiz } from '@/lib/firestore-service';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileQuestion, Plus, Pencil, Trash2, Search, Globe, EyeOff,
  Clock, BookOpen, Layers, Loader2
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Quiz } from '@/lib/types-scalable';

export default function QuizzesPage() {
  const { quizzes, loading, refresh } = useQuizzes();
  const { products } = useProducts();
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Quiz | null>(null);

  const filtered = quizzes.filter((q) =>
    q.title.toLowerCase().includes(search.toLowerCase()) ||
    (q.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const getProduct = (productId: string) => products.find((p) => p.id === productId);

  const handlePublish = async (quiz: Quiz) => {
    setPublishingId(quiz.id);
    try {
      await publishQuiz(quiz.id);
      await refresh();
      toast({ title: quiz.published ? 'Evaluación despublicada' : '🚀 Evaluación publicada exitosamente' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setPublishingId(null);
    }
  };

  const handleDelete = async (quiz: Quiz) => {
    setDeletingId(quiz.id);
    try {
      await deleteQuiz(quiz.id);
      await refresh();
      toast({ title: 'Evaluación eliminada' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Evaluaciones</h1>
          <p className="text-muted-foreground mt-1">Crea evaluaciones completas con misiones usando preguntas del banco</p>
        </div>
        <Link href="/admin/quizzes/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Nueva Evaluación
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar quizzes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileQuestion className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No hay evaluaciones</h2>
            <p className="text-muted-foreground mb-6">
              {search ? 'Sin resultados para tu búsqueda' : 'Crea tu primera evaluación para comenzar'}
            </p>
            <Link href="/admin/quizzes/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Crear Evaluación
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((quiz) => {
            const product = getProduct(quiz.productId);
            return (
              <Card key={quiz.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="flex items-center gap-4 p-4">
                  {/* Icon */}
                  <div
                    className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: product?.color || '#6366f1', opacity: 0.9 }}
                  >
                    <FileQuestion className="h-6 w-6 text-white" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base">{quiz.title}</h3>
                      <Badge variant={quiz.published ? 'default' : 'secondary'}>
                        {quiz.published ? 'Publicado' : 'Borrador'}
                      </Badge>
                      <Badge variant="outline">
                        {quiz.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{quiz.description}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      {product && (
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" /> {product.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" /> {quiz.totalQuestions} preguntas
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" /> {quiz.missions?.length || 0} misiones
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> ~{quiz.estimatedDuration} min
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePublish(quiz)}
                      disabled={publishingId === quiz.id}
                      className="gap-1"
                    >
                      {publishingId === quiz.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : quiz.published ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      {quiz.published ? 'Ocultar' : 'Publicar'}
                    </Button>
                    <Link href={`/admin/quizzes/${quiz.id}`}>
                      <Button variant="outline" size="icon">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(quiz)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta evaluación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{confirmDelete?.title}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive hover:bg-destructive/90"
              disabled={!!deletingId}
            >
              {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
