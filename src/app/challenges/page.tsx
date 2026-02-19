'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import { LogOut, Trophy, Award, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import { cn } from '@/lib/utils';
import { getQuizLeaderboard, getQuizzes } from '@/lib/firestore-service';
import { useProducts } from '@/hooks/use-firestore';
import type { QuizAttempt, Quiz } from '@/lib/types-scalable';

interface Row {
  rank: number;
  name: string;
  kiosk: string;
  score: number;
  maxScore: number;
  percentage: number;
  timeTaken: number;
}

function toRows(attempts: QuizAttempt[]): Row[] {
  return attempts.map((a, i) => ({
    rank: i + 1,
    name: a.trainerName || 'Participante',
    kiosk: a.assignedKiosko || '',
    score: a.score,
    maxScore: a.maxScore,
    percentage: a.percentage,
    timeTaken: a.timeTaken,
  }));
}

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;
}

function BoardTable({ data }: { data: Row[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aún no hay resultados. ¡Sé el primero!
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8 text-center">#</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead className="text-right">Puntaje</TableHead>
          <TableHead className="text-right">Tiempo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r) => (
          <TableRow key={r.rank} className={cn(r.rank === 1 && 'bg-yellow-50')}>
            <TableCell className="text-center font-bold">
              {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}
            </TableCell>
            <TableCell>
              <p className="font-medium text-sm leading-tight">{r.name}</p>
              {r.kiosk && <p className="text-xs text-muted-foreground">{r.kiosk}</p>}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              <span className="font-semibold">{r.score}</span>
              <span className="text-muted-foreground text-xs">/{r.maxScore}</span>
            </TableCell>
            <TableCell className="text-right font-mono text-xs text-muted-foreground">
              {fmtTime(r.timeTaken)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

function ProductBoard({ productId }: { productId: string }) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [generalRows, setGeneralRows] = useState<Row[]>([]);
  const [perQuiz, setPerQuiz] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [qs, gen] = await Promise.all([
          getQuizzes(productId, true).catch(() => [] as Quiz[]),
          getQuizLeaderboard(productId).then(toRows).catch(() => [] as Row[]),
        ]);
        setQuizzes(qs);
        setGeneralRows(gen);

        if (qs.length > 1) {
          const results = await Promise.all(
            qs.map(q => getQuizLeaderboard(productId, q.id).then(toRows).catch(() => [] as Row[]))
          );
          const map: Record<string, Row[]> = {};
          qs.forEach((q, i) => { map[q.id] = results[i]; });
          setPerQuiz(map);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [productId]);

  if (loading) return <BoardSkeleton />;

  if (quizzes.length <= 1) {
    return <BoardTable data={generalRows} />;
  }

  return (
    <Tabs defaultValue="general">
      <TabsList className="w-full mb-2">
        <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
        {quizzes.map(q => (
          <TabsTrigger key={q.id} value={q.id} className="flex-1 text-xs truncate">{q.title}</TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="general"><BoardTable data={generalRows} /></TabsContent>
      {quizzes.map(q => (
        <TabsContent key={q.id} value={q.id}><BoardTable data={perQuiz[q.id] ?? []} /></TabsContent>
      ))}
    </Tabs>
  );
}

export default function ChallengesPage() {
  const { user, profile, logout } = useAuth();
  const { products, loading: loadingProducts } = useProducts();
  const isAdmin = !!(profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol));

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">

          {/* Header — same as home */}
          <header className="bg-accent text-accent-foreground border-b sticky top-0 z-20">
            <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/"><AvivaLogo className="h-8 w-auto" /></Link>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Link href="/admin/quizzes">
                    <Button variant="outline" size="sm" className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Admin
                    </Button>
                  </Link>
                )}
                {user && (
                  <Button variant="ghost" size="sm" onClick={logout} className="text-accent-foreground hover:bg-white/10 gap-1">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Salir</span>
                  </Button>
                )}
              </div>
            </div>
          </header>

          {/* Content — same max-w-md as home */}
          <main className="flex-grow">
            <div className="max-w-md mx-auto px-4 py-5 pb-24 space-y-4">

              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <h1 className="text-lg font-bold">Salón de la Fama</h1>
              </div>

              {loadingProducts ? (
                <BoardSkeleton />
              ) : products.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No hay productos configurados.
                </p>
              ) : (
                products.map(p => (
                  <Card key={p.id} className="rounded-2xl border-primary/10 shadow-sm overflow-hidden">
                    <div className="h-1.5 w-full" style={{ backgroundColor: p.color }} />
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name.charAt(0)}
                        </div>
                        <CardTitle className="text-base leading-tight">{p.name}</CardTitle>
                      </div>
                      <CardDescription className="text-xs mt-1">
                        Top 10 · Por puntaje y tiempo
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-2 pb-3">
                      <ProductBoard productId={p.id} />
                    </CardContent>
                  </Card>
                ))
              )}

              {/* Quick action to start a challenge */}
              {!loadingProducts && products.length > 0 && (
                <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">¿Listo para competir?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Completa tu desafío y aparece aquí</p>
                  </div>
                  <Link href="/">
                    <Button size="sm" className="shrink-0">Ir a mi ruta</Button>
                  </Link>
                </div>
              )}
            </div>
          </main>

          <BottomNav isAdmin={isAdmin} />
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
