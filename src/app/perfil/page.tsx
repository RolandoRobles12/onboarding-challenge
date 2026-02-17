'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getUserBadges } from '@/lib/firestore-service';
import type { UserBadge } from '@/lib/types-scalable';
import { BadgeDisplay } from '@/components/BadgeDisplay';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { ChevronLeft, Medal } from 'lucide-react';

export default function PerfilPage() {
  const { user, profile } = useAuth();
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserBadges(user.uid).then(b => {
      setBadges(b);
      setLoading(false);
    });
  }, [user]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-accent text-white px-4 py-3 flex items-center gap-3 shadow">
          <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/10">
            <Link href="/challenges">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <AvivaLogo className="h-7 w-auto brightness-0 invert" />
          <span className="font-semibold text-lg">Mi Perfil</span>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          {/* Profile card */}
          <Card>
            <CardContent className="py-6 flex items-center gap-4">
              <Avatar className="h-16 w-16 text-xl">
                <AvatarFallback className="bg-primary text-primary-foreground font-bold text-2xl">
                  {profile?.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold">{profile?.nombre ?? '—'}</h2>
                <p className="text-muted-foreground text-sm">{profile?.email}</p>
                {profile?.rol && (
                  <span className="inline-block mt-1 text-xs bg-muted rounded-full px-2.5 py-0.5 capitalize font-medium">
                    {profile.rol.replace('_', ' ')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Badges section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Medal className="h-5 w-5" />
                Mis Insignias
                {!loading && badges.length > 0 && (
                  <span className="ml-auto text-sm font-normal text-muted-foreground">
                    {badges.length} ganada{badges.length !== 1 ? 's' : ''}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex gap-6 flex-wrap">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
                      <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : badges.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Medal className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aún no tienes insignias</p>
                  <p className="text-sm mt-1">Completa los desafíos para ganar tus primeras insignias</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-6">
                  {badges.map(ub => (
                    <BadgeDisplay key={ub.id} userBadge={ub} size="md" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick links */}
          <div className="flex gap-3 flex-wrap">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/challenges">
                <ChevronLeft className="h-4 w-4" /> Volver a desafíos
              </Link>
            </Button>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
