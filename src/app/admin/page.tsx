'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useProducts, useQuizzes } from '@/hooks/use-firestore';
import { Package, FileQuestion, Users, TrendingUp, Activity, Award } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AdminDashboard() {
  const { products, loading: loadingProducts } = useProducts();
  const { quizzes, loading: loadingQuizzes } = useQuizzes();

  const stats = [
    {
      title: 'Productos',
      value: loadingProducts ? '...' : products.length,
      description: 'Productos activos en la plataforma',
      icon: Package,
      color: 'text-blue-500',
      href: '/admin/products',
    },
    {
      title: 'Quizzes',
      value: loadingQuizzes ? '...' : quizzes.length,
      description: 'Quizzes publicados',
      icon: FileQuestion,
      color: 'text-green-500',
      href: '/admin/quizzes',
    },
    {
      title: 'Usuarios Activos',
      value: '0',
      description: 'Usuarios registrados en el sistema',
      icon: Users,
      color: 'text-purple-500',
      href: '/admin/users',
    },
    {
      title: 'Tasa de Completado',
      value: '0%',
      description: 'Porcentaje de quizzes completados',
      icon: TrendingUp,
      color: 'text-orange-500',
      href: '/admin/analytics',
    },
  ];

  const quickActions = [
    {
      title: 'Crear Producto',
      description: 'Agrega un nuevo producto a la plataforma',
      href: '/admin/products',
      icon: Package,
    },
    {
      title: 'Crear Quiz',
      description: 'Diseña un nuevo quiz con el constructor visual',
      href: '/admin/quizzes/new',
      icon: FileQuestion,
    },
    {
      title: 'Agregar Preguntas',
      description: 'Añade preguntas al banco de preguntas',
      href: '/admin/questions',
      icon: Activity,
    },
    {
      title: 'Ver Analytics',
      description: 'Revisa métricas y reportes detallados',
      href: '/admin/analytics',
      icon: Award,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Panel de Administración</h1>
        <p className="text-muted-foreground mt-2">
          Bienvenido al panel de control de Desafío Aviva. Gestiona productos, quizzes y usuarios desde aquí.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} href={stat.href}>
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-bold mb-4">Acciones Rápidas</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.title} href={action.href}>
                <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <Icon className="h-8 w-8 text-primary mb-2" />
                    <CardTitle className="text-base">{action.title}</CardTitle>
                    <CardDescription>{action.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Products */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Productos Recientes</h2>
          <Link href="/admin/products">
            <Button variant="outline" size="sm">Ver todos</Button>
          </Link>
        </div>

        {loadingProducts ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : products.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No hay productos aún.</p>
              <Link href="/admin/products">
                <Button className="mt-4" variant="outline">Crear Primer Producto</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {products.slice(0, 3).map((product) => (
              <Link key={product.id} href={`/admin/products/${product.id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: product.color }}
                    >
                      {product.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{product.name}</h3>
                      <p className="text-sm text-muted-foreground">{product.description}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {product.targetAudience}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Quizzes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Quizzes Recientes</h2>
          <Link href="/admin/quizzes">
            <Button variant="outline" size="sm">Ver todos</Button>
          </Link>
        </div>

        {loadingQuizzes ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : quizzes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No hay quizzes aún.</p>
              <Link href="/admin/quizzes/new">
                <Button className="mt-4" variant="outline">Crear Primer Quiz</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {quizzes.slice(0, 3).map((quiz) => (
              <Link key={quiz.id} href={`/admin/quizzes/${quiz.id}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-4">
                    <FileQuestion className="h-10 w-10 text-primary" />
                    <div className="flex-1">
                      <h3 className="font-semibold">{quiz.title}</h3>
                      <p className="text-sm text-muted-foreground">{quiz.description}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {quiz.totalQuestions} preguntas
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
