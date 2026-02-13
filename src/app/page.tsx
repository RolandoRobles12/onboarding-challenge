'use client';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { Award, LogOut, Trophy, Rocket, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/leaderboard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAvatarComponent } from '@/lib/avatars';
import { Skeleton } from '@/components/ui/skeleton';
import { useProducts } from '@/hooks/use-firestore';
import { cn } from '@/lib/utils';

function LeaderboardTable({ data }: { data: LeaderboardEntry[] }) {
    if (data.length === 0) {
        return <p className="p-4 text-center text-muted-foreground">Aún no hay participantes. ¡Sé el primero!</p>;
    }
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[50px]">Pos.</TableHead>
                    <TableHead>Explorador</TableHead>
                    <TableHead className="text-right">Puntaje</TableHead>
                    <TableHead className="text-right">Tiempo</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((entry, index) => {
                    const Avatar = getAvatarComponent(entry.avatar);
                    const minutes = Math.floor(entry.time / 60);
                    const seconds = entry.time % 60;
                    return (
                        <TableRow key={entry.id} className={cn(index === 0 && 'bg-yellow-50')}>
                            <TableCell className="font-medium">
                                <div className="flex justify-center items-center">
                                    {index === 0 ? <Award className="h-5 w-5 text-yellow-500" /> : index + 1}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8 text-muted-foreground" />
                                    <div>
                                        <div className="font-medium">{entry.fullName}</div>
                                        <div className="text-xs text-muted-foreground">{entry.assignedKiosk}</div>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                                <span className="font-semibold">{entry.score}</span>
                                <span className="text-muted-foreground">/{entry.totalQuestions}</span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{`${minutes}m ${seconds.toString().padStart(2, '0')}s`}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

function LeaderboardSkeleton() {
    return (
        <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 p-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-2 flex-grow"><Skeleton className="h-4 w-3/4" /></div>
                    <Skeleton className="h-4 w-1/4" />
                </div>
            ))}
        </div>
    );
}

const FALLBACK_PRODUCTS = [
    { id: 'ba', name: 'Promotores BA', shortName: 'BA', description: 'Domina los secretos de Aviva Tu Compra y prepárate para el éxito.', color: '#E85D26', targetAudience: 'Para el producto Aviva Tu Compra' },
    { id: 'atn', name: 'Aviva Tu Negocio / Contigo', shortName: 'ATN', description: 'Conviértete en experto de Aviva Tu Negocio y Aviva Contigo.', color: '#1A56DB', targetAudience: 'Para Promotores y Gerentes' },
];

function ProductCard({ product }: { product: typeof FALLBACK_PRODUCTS[0] }) {
    return (
        <Card className="bg-card hover:shadow-xl transition-all duration-300 rounded-xl border-2 border-transparent hover:border-primary/30 group overflow-hidden">
            <div className="h-2 w-full" style={{ backgroundColor: product.color }} />
            <CardHeader>
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md" style={{ backgroundColor: product.color }}>
                        {product.shortName}
                    </div>
                    <CardTitle className="text-xl font-headline text-accent leading-tight">{product.name}</CardTitle>
                </div>
                {product.targetAudience && (
                    <CardDescription className="text-xs">{product.targetAudience}</CardDescription>
                )}
            </CardHeader>
            <CardContent>
                <p className="mb-6 text-card-foreground/80 text-sm leading-relaxed">{product.description}</p>
                <Button asChild size="lg" className="w-full rounded-lg text-white font-semibold shadow-md transition-transform group-hover:scale-[1.02]" style={{ backgroundColor: product.color }}>
                    <Link href={`/${product.id}`}>
                        Iniciar Misión <Rocket className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}

export default function Home() {
  const { user, profile, logout } = useAuth();
  const { products, loading: loadingProducts } = useProducts();
  const [leaderboardBA, setLeaderboardBA] = useState<LeaderboardEntry[]>([]);
  const [leaderboardATN, setLeaderboardATN] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboards() {
        try {
            const [baData, atnData] = await Promise.all([getLeaderboard('ba'), getLeaderboard('atn')]);
            setLeaderboardBA(baData);
            setLeaderboardATN(atnData);
        } catch (error) {
            console.error("Failed to fetch leaderboards", error);
        } finally {
            setLoading(false);
        }
    }
    fetchLeaderboards();
  }, []);

  const displayProducts = (!loadingProducts && products.length > 0)
    ? products.map(p => ({ id: p.id, name: p.name, shortName: p.shortName, description: p.description, color: p.color, targetAudience: p.targetAudience }))
    : FALLBACK_PRODUCTS;

  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);

  return (
    <ProtectedRoute>
      <div className="flex flex-col min-h-screen bg-background">
        <header className="bg-accent text-accent-foreground py-4 sm:py-6 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <div className="w-full relative flex justify-center items-center mb-3">
              <Link href="/" className="flex-grow flex justify-center">
                <AvivaLogo className="h-12 sm:h-16 w-auto" />
              </Link>
              <div className="absolute right-0 flex items-center gap-2">
                {isAdmin && (
                  <Link href="/admin">
                    <Button variant="outline" size="sm" className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 hidden sm:flex gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Admin
                    </Button>
                  </Link>
                )}
                {user && (
                  <Button variant="ghost" onClick={logout} className="text-accent-foreground hover:bg-accent/20">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Salir</span>
                  </Button>
                )}
              </div>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold font-headline">Desafío Aviva</h1>
            <p className="mt-2 text-base sm:text-lg text-accent-foreground/80">
              {user ? `Bienvenido de nuevo, ${user.displayName?.split(' ')[0] || 'Explorador'}` : 'Tu aventura de conocimiento ha comenzado.'}
            </p>
          </div>
        </header>

        <main className="flex-grow flex flex-col items-center p-4 md:p-8 space-y-8 md:space-y-12">
            {/* Products */}
            <div className="w-full max-w-lg md:max-w-4xl lg:max-w-5xl">
                <h2 className="text-xl font-bold mb-4 text-center text-foreground/80">Elige tu misión</h2>
                {loadingProducts ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Skeleton className="h-48" />
                        <Skeleton className="h-48" />
                    </div>
                ) : (
                    <div className={cn(
                        'grid gap-6',
                        displayProducts.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' :
                        displayProducts.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                        'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    )}>
                        {displayProducts.map((product) => <ProductCard key={product.id} product={product} />)}
                    </div>
                )}
            </div>

            {/* Leaderboard */}
            <div className="w-full max-w-lg md:max-w-4xl lg:max-w-5xl">
                <Card className="bg-card shadow-lg rounded-xl border-primary/20">
                    <CardHeader>
                        <CardTitle className="text-2xl font-headline text-accent flex items-center gap-2">
                            <Trophy className="text-yellow-500" /> Salón de la Fama
                        </CardTitle>
                        <CardDescription>Los 5 mejores exploradores por puntaje y tiempo. ¡Supera sus récords!</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="ba" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="ba">Promotores BA</TabsTrigger>
                                <TabsTrigger value="atn">Aviva Tu Negocio y Contigo</TabsTrigger>
                            </TabsList>
                            <TabsContent value="ba">{loading ? <LeaderboardSkeleton /> : <LeaderboardTable data={leaderboardBA} />}</TabsContent>
                            <TabsContent value="atn">{loading ? <LeaderboardSkeleton /> : <LeaderboardTable data={leaderboardATN} />}</TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>
        </main>

        <footer className="bg-accent text-accent-foreground/80 py-4 px-4 sm:px-8 mt-8 md:mt-12">
          <div className="max-w-7xl mx-auto text-center text-sm">
              <p>&copy; {new Date().getFullYear()} Aviva. Todos los derechos reservados.</p>
          </div>
        </footer>
      </div>
    </ProtectedRoute>
  );
}
