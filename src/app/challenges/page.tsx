'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import { LogOut, Trophy, ShieldCheck, Swords, Play, Medal, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BottomNav } from '@/components/BottomNav';
import { cn } from '@/lib/utils';
import { getQuizLeaderboard, getQuizzes } from '@/lib/firestore-service';
import { useProducts } from '@/hooks/use-firestore';
import type { QuizAttempt, Quiz } from '@/lib/types-scalable';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Row {
  rank: number;
  name: string;
  kiosk: string;
  percentage: number;
  score: number;
  maxScore: number;
  timeTaken: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRows(attempts: QuizAttempt[]): Row[] {
  return attempts.map((a, i) => ({
    rank: i + 1,
    name: a.trainerName || 'Participante',
    kiosk: a.assignedKiosko || '',
    percentage: a.percentage,
    score: a.score,
    maxScore: a.maxScore,
    timeTaken: a.timeTaken,
  }));
}

function fmtTime(s: number) {
  if (!s || s <= 0) return '—';
  return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;
}

// ─── Leaderboard table ────────────────────────────────────────────────────────

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
          <TableHead className="text-right">%</TableHead>
          <TableHead className="text-right hidden sm:table-cell">Puntaje</TableHead>
          <TableHead className="text-right hidden sm:table-cell">Tiempo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((r) => (
          <TableRow key={r.rank} className={cn(r.rank === 1 && 'bg-yellow-50')}>
            <TableCell className="text-center font-bold text-base">
              {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}
            </TableCell>
            <TableCell>
              <p className="font-medium text-sm leading-tight">{r.name}</p>
              {r.kiosk && <p className="text-xs text-muted-foreground">{r.kiosk}</p>}
            </TableCell>
            <TableCell className="text-right font-bold text-sm">
              {Math.round(r.percentage)}%
            </TableCell>
            <TableCell className="text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
              {r.score}/{r.maxScore}
            </TableCell>
            <TableCell className="text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
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

// ─── Per-product block (leaderboard + challenges) ─────────────────────────────

function ProductSection({ productId, productColor, productName, currentUserId }: {
  productId: string;
  productColor: string;
  productName: string;
  currentUserId: string;
}) {
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

        if (qs.length > 0) {
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

  return (
    <div className="space-y-4">
      {/* ── Practice challenges ─────────────────────────────── */}
      {quizzes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-1 mb-2">
            <Swords className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-bold">Practica tus desafíos</h3>
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">no afecta el ranking</Badge>
          </div>
          <div className="space-y-2">
            {quizzes.map(q => (
              <div
                key={q.id}
                className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3"
              >
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: productColor }}
                >
                  <Swords className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight truncate">{q.title}</p>
                  {q.description && (
                    <p className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">{q.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />{q.estimatedDuration} min
                    </span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{q.totalQuestions} preguntas</span>
                  </div>
                </div>
                <Link href={`/${productId}/quiz?quizId=${q.id}`}>
                  <Button size="sm" className="shrink-0 gap-1.5 rounded-lg h-8 px-3">
                    <Play className="h-3 w-3" /> Practicar
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Leaderboard ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 px-1 mb-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          <h3 className="text-sm font-bold">Salón de la Fama</h3>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">top 10</Badge>
        </div>

        {quizzes.length <= 1 ? (
          <BoardTable data={generalRows} />
        ) : (
          <Tabs defaultValue="general">
            <TabsList className="w-full mb-2 h-8">
              <TabsTrigger value="general" className="flex-1 text-xs">General</TabsTrigger>
              {quizzes.map(q => (
                <TabsTrigger key={q.id} value={q.id} className="flex-1 text-xs truncate max-w-[100px]">
                  {q.title}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="general"><BoardTable data={generalRows} /></TabsContent>
            {quizzes.map(q => (
              <TabsContent key={q.id} value={q.id}>
                <BoardTable data={perQuiz[q.id] ?? []} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChallengesPage() {
  const { user, profile, logout } = useAuth();
  const { products, loading: loadingProducts } = useProducts();
  const isAdmin = !!(profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol));

  // For sellers, only show their assigned product; admins see all
  const visibleProducts = isAdmin
    ? products
    : products.filter(p => p.id === profile?.producto);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">

          {/* Header */}
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

          {/* Content */}
          <main className="flex-grow">
            <div className="max-w-md mx-auto px-4 py-5 pb-24 space-y-4">

              <div className="flex items-center gap-2 mb-1">
                <Medal className="h-5 w-5 text-orange-500" />
                <h1 className="text-lg font-bold">Prácticas y Rankings</h1>
              </div>

              {loadingProducts ? (
                <BoardSkeleton />
              ) : visibleProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  No tienes un producto asignado.
                </p>
              ) : (
                visibleProducts.map(p => (
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
                        Practica cuando quieras · El ranking guarda tu mejor puntaje
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      <ProductSection
                        productId={p.id}
                        productColor={p.color}
                        productName={p.name}
                        currentUserId={user?.uid ?? ''}
                      />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </main>

          <BottomNav isAdmin={isAdmin} />
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
