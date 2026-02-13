'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, TrendingUp, Users, Award, Clock, Target, Zap } from 'lucide-react';
import { useProducts, useQuizzes } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';

function StatCard({ title, value, description, icon: Icon, color }: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { products, loading: loadingProducts } = useProducts();
  const { quizzes, loading: loadingQuizzes } = useQuizzes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Métricas y estadísticas de la plataforma</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loadingProducts || loadingQuizzes ? (
          <>
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
          </>
        ) : (
          <>
            <StatCard
              title="Productos Activos"
              value={products.length}
              description="Productos disponibles en la plataforma"
              icon={Target}
              color="text-blue-500"
            />
            <StatCard
              title="Quizzes Publicados"
              value={quizzes.filter(q => q.published).length}
              description={`${quizzes.length} quizzes en total`}
              icon={Award}
              color="text-green-500"
            />
            <StatCard
              title="Preguntas Totales"
              value={quizzes.reduce((sum, q) => sum + (q.totalQuestions || 0), 0)}
              description="En todos los quizzes"
              icon={Zap}
              color="text-yellow-500"
            />
            <StatCard
              title="Tiempo Promedio"
              value={`${quizzes.length > 0 ? Math.round(quizzes.reduce((s, q) => s + q.estimatedDuration, 0) / quizzes.length) : 0} min`}
              description="Duración promedio por quiz"
              icon={Clock}
              color="text-purple-500"
            />
          </>
        )}
      </div>

      {/* Products breakdown */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Quizzes por Producto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingProducts || loadingQuizzes ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : products.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay productos aún</p>
            ) : (
              <div className="space-y-3">
                {products.map((product) => {
                  const productQuizzes = quizzes.filter(q => q.productId === product.id);
                  const maxCount = Math.max(...products.map(p => quizzes.filter(q => q.productId === p.id).length), 1);
                  const pct = (productQuizzes.length / maxCount) * 100;
                  return (
                    <div key={product.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: product.color }} />
                          <span className="font-medium">{product.name}</span>
                        </div>
                        <span className="text-muted-foreground">{productQuizzes.length} quizzes</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: product.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Resumen de Contenido
            </CardTitle>
            <CardDescription>Estado actual de los quizzes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['Publicados', 'Borradores', 'Desactivados'].map((label, i) => {
                const counts = [
                  quizzes.filter(q => q.published && q.active).length,
                  quizzes.filter(q => !q.published && q.active).length,
                  quizzes.filter(q => !q.active).length,
                ];
                const colors = ['bg-green-500', 'bg-yellow-500', 'bg-gray-400'];
                return (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${colors[i]}`} />
                      <span className="text-sm">{label}</span>
                    </div>
                    <span className="text-sm font-semibold">{loadingQuizzes ? '...' : counts[i]}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center">
              <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Analytics detallados de usuarios y completado estarán disponibles próximamente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
