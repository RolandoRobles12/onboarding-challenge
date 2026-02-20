'use client';

import Link from 'next/link';
import { useQuestions } from '@/hooks/use-firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Upload, ArrowRight, BookOpen, AlertCircle } from 'lucide-react';
import type { KnowledgeModule } from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS } from '@/lib/types-scalable';
import { cn } from '@/lib/utils';

// ── Module metadata ────────────────────────────────────────────────────────

type ModuleConfig = {
  description: string;
  color: string;
  dotColor: string;
  emoji: string;
};

const MODULE_CONFIG: Record<KnowledgeModule, ModuleConfig> = {
  banca_conversacional: {
    description: 'Productos y técnicas de venta conversacional bancaria.',
    color: 'bg-blue-500/10 border-blue-200 text-blue-700',
    dotColor: 'bg-blue-500',
    emoji: '💬',
  },
  pagos_renovacion: {
    description: 'Procesos de pago, renovación y cobranza de créditos.',
    color: 'bg-green-500/10 border-green-200 text-green-700',
    dotColor: 'bg-green-500',
    emoji: '💳',
  },
  solicitud_credito: {
    description: 'Documentación, requisitos y flujo de solicitud de crédito.',
    color: 'bg-purple-500/10 border-purple-200 text-purple-700',
    dotColor: 'bg-purple-500',
    emoji: '📋',
  },
  herramientas: {
    description: 'Plataformas digitales, CRM y herramientas de trabajo.',
    color: 'bg-orange-500/10 border-orange-200 text-orange-700',
    dotColor: 'bg-orange-500',
    emoji: '🛠️',
  },
  politicas_procesos: {
    description: 'Políticas internas, reglamentos y procedimientos.',
    color: 'bg-red-500/10 border-red-200 text-red-700',
    dotColor: 'bg-red-500',
    emoji: '📜',
  },
  incentivos: {
    description: 'Comisiones, bonos, concursos y esquema de incentivos.',
    color: 'bg-yellow-500/10 border-yellow-200 text-yellow-700',
    dotColor: 'bg-yellow-500',
    emoji: '🏆',
  },
};

const MODULE_KEYS = Object.keys(KNOWLEDGE_MODULE_LABELS) as KnowledgeModule[];

// ── Component ──────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const { questions, loading } = useQuestions();

  // Compute stats per module
  const moduleStats = MODULE_KEYS.map(mod => {
    const qs = questions.filter(q => q.module === mod);
    const avgCorrect = qs.length > 0 && qs.some(q => q.averageCorrectRate > 0)
      ? Math.round(qs.filter(q => q.averageCorrectRate > 0).reduce((s, q) => s + q.averageCorrectRate, 0) / qs.filter(q => q.averageCorrectRate > 0).length)
      : null;
    return { mod, count: qs.length, avgCorrect };
  });

  const totalWithModule = questions.filter(q => q.module).length;
  const emptyModules = moduleStats.filter(s => s.count === 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-primary" /> Categorías del Pulso
          </h1>
          <p className="text-muted-foreground mt-1">
            Los 6 módulos temáticos del cuestionario diario. Cada categoría agrupa preguntas
            que el sistema mezcla automáticamente en el Pulso de Conocimiento.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/import">
            <Upload className="h-4 w-4 mr-2" /> Importar preguntas
          </Link>
        </Button>
      </div>

      {/* Summary strip */}
      {loading ? (
        <div className="flex gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-full" />)}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="px-3 py-1 rounded-full bg-muted font-medium">
            {questions.length} preguntas en total
          </span>
          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
            {totalWithModule} asignadas a módulo
          </span>
          {emptyModules > 0 && (
            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 font-medium flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              {emptyModules} {emptyModules === 1 ? 'categoría vacía' : 'categorías vacías'}
            </span>
          )}
        </div>
      )}

      {/* Module grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODULE_KEYS.map(mod => {
          const config = MODULE_CONFIG[mod];
          const stats = moduleStats.find(s => s.mod === mod)!;
          const isEmpty = stats.count === 0;

          return (
            <Card
              key={mod}
              className={cn(
                'border-2 transition-shadow hover:shadow-md',
                isEmpty ? 'border-dashed border-muted-foreground/30' : 'border-transparent'
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{config.emoji}</span>
                    <CardTitle className="text-base leading-tight">
                      {KNOWLEDGE_MODULE_LABELS[mod]}
                    </CardTitle>
                  </div>
                  {isEmpty ? (
                    <Badge variant="outline" className="shrink-0 text-amber-600 border-amber-300 bg-amber-50">
                      Vacía
                    </Badge>
                  ) : (
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold border', config.color)}>
                      {stats.count} preguntas
                    </span>
                  )}
                </div>
                <CardDescription className="text-xs mt-1">{config.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Stats row */}
                {loading ? (
                  <Skeleton className="h-10" />
                ) : (
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-center">
                      <p className="text-2xl font-bold">{stats.count}</p>
                      <p className="text-[10px] text-muted-foreground">preguntas</p>
                    </div>
                    <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-center">
                      <p className={cn('text-2xl font-bold', stats.avgCorrect === null ? 'text-muted-foreground' : stats.avgCorrect >= 70 ? 'text-green-600' : 'text-orange-500')}>
                        {stats.avgCorrect !== null ? `${stats.avgCorrect}%` : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">% aciertos</p>
                    </div>
                  </div>
                )}

                {/* Progress bar (fill relative to the most populated module) */}
                {!loading && !isEmpty && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', config.dotColor)}
                        style={{ width: `${Math.min(100, Math.round((stats.count / Math.max(...moduleStats.map(s => s.count), 1)) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  {!isEmpty && (
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href={`/admin/questions?module=${mod}`}>
                        <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                        Ver preguntas
                      </Link>
                    </Button>
                  )}
                  <Button
                    asChild
                    size="sm"
                    variant={isEmpty ? 'default' : 'ghost'}
                    className={cn(isEmpty ? 'flex-1' : '')}
                  >
                    <Link href={`/admin/import?module=${mod}`}>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {isEmpty ? 'Importar preguntas' : 'Importar'}
                    </Link>
                  </Button>
                  {isEmpty && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/questions?new=1&module=${mod}`}>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info box */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">¿Cómo funciona el Pulso?</p>
              <p>Cada día el sistema mezcla 7 preguntas automáticamente, distribuyéndolas entre todos los módulos disponibles. Cuantas más preguntas tenga cada categoría, más variado será el cuestionario diario y menos repetición verá el equipo.</p>
              <p className="mt-1">Se priorizan las preguntas con menor porcentaje de aciertos para reforzar los temas más difíciles.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
