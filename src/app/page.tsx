'use client';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { Award, LogOut, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getLeaderboard, type LeaderboardEntry } from '@/lib/leaderboard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAvatarComponent } from '@/lib/avatars';
import { Skeleton } from '@/components/ui/skeleton';

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
                        <TableRow key={entry.id}>
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
                            <TableCell className="text-right">{entry.score}/{entry.totalQuestions}</TableCell>
                            <TableCell className="text-right">{`${minutes}m ${seconds.toString().padStart(2, '0')}s`}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    )
}

function LeaderboardSkeleton() {
    return (
        <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 p-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-2 flex-grow">
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                    <Skeleton className="h-4 w-1/4" />
                </div>
            ))}
        </div>
    )
}

export default function Home() {
  const { user, logout } = useAuth();
  const [leaderboardBA, setLeaderboardBA] = useState<LeaderboardEntry[]>([]);
  const [leaderboardATN, setLeaderboardATN] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboards() {
        try {
            const [baData, atnData] = await Promise.all([
                getLeaderboard('ba'),
                getLeaderboard('atn')
            ]);
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
  
  return (
    <ProtectedRoute>
      <div className="flex flex-col min-h-screen bg-background">
        <header className="bg-accent text-accent-foreground py-4 sm:py-6 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <div className="w-full relative flex justify-center items-center mb-3">
              <Link href="/" className="flex-grow flex justify-center">
                <AvivaLogo className="h-12 sm:h-16 w-auto" />
              </Link>
              <div className="absolute right-0">
                  {user && (
                      <Button variant="ghost" onClick={logout} className="text-accent-foreground hover:bg-accent/20">
                          <LogOut className="mr-2 h-4 w-4" />
                          Salir
                      </Button>
                  )}
              </div>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold font-headline">Desafío Aviva</h1>
            <p className="mt-2 text-base sm:text-lg text-accent-foreground/80">
              { user ? `Bienvenido de nuevo, ${user.displayName?.split(' ')[0]}` : 'Tu aventura de conocimiento ha comenzado.'}
            </p>
          </div>
        </header>

        <main className="flex-grow flex flex-col items-center p-4 md:p-8 space-y-8 md:space-y-12">
            <div className="w-full max-w-lg md:max-w-4xl lg:max-w-5xl">
                <Card className="bg-card shadow-lg rounded-lg border-primary/20">
                    <CardHeader>
                        <CardTitle className="text-2xl font-headline text-accent flex items-center gap-2">
                            <Trophy className="text-yellow-500" />
                            Salón de la Fama
                        </CardTitle>
                        <CardDescription>Los 5 mejores exploradores por puntaje y tiempo. ¡Supera sus récords!</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="ba" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="ba">Promotores BA</TabsTrigger>
                                <TabsTrigger value="atn">Aviva Tu Negocio y Contigo</TabsTrigger>
                            </TabsList>
                            <TabsContent value="ba">
                                {loading ? <LeaderboardSkeleton /> : <LeaderboardTable data={leaderboardBA} />}
                            </TabsContent>
                            <TabsContent value="atn">
                                {loading ? <LeaderboardSkeleton /> : <LeaderboardTable data={leaderboardATN} />}
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>

            <div className="w-full max-w-lg md:max-w-4xl lg:max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <Card className="bg-card hover:shadow-xl transition-shadow duration-300 rounded-lg border border-primary/20">
                    <CardHeader>
                        <CardTitle className="text-2xl font-headline text-accent">Promotores BA</CardTitle>
                        <CardDescription>Para el producto Aviva Tu Compra.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="mb-6 text-card-foreground/80">
                        Comienza tu misión para dominar los secretos de Aviva Tu Compra y prepárate para el éxito.
                        </p>
                        <Button asChild size="lg" className="w-full rounded-lg text-primary-foreground bg-primary hover:bg-primary/90">
                        <Link href="/ba">
                            Iniciar Misión BA <span role="img" aria-label="cohete" className="ml-2">🚀</span>
                        </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card className="bg-card hover:shadow-xl transition-shadow duration-300 rounded-lg border border-primary/20">
                    <CardHeader>
                        <CardTitle className="text-2xl font-headline text-accent">Aviva Tu Negocio y Aviva Contigo</CardTitle>
                        <CardDescription>Para Promotores y Gerentes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="mb-6 text-card-foreground/80">
                        Embárcate en esta aventura para convertirte en un experto de Aviva Tu Negocio y Aviva Contigo.
                        </p>
                        <Button asChild size="lg" className="w-full rounded-lg text-primary-foreground bg-primary hover:bg-primary/90">
                        <Link href="/atn">
                            Iniciar Misión Aviva Contigo o Aviva Tu Negocio <span role="img" aria-label="cohete" className="ml-2">🚀</span>
                        </Link>
                        </Button>
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
  )
}
