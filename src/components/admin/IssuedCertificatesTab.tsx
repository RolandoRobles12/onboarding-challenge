'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getAllUserCertificates, setCertificateStatus } from '@/lib/firestore-service';
import { syncCertificates } from '@/lib/api-client';
import type { UserCertificate } from '@/lib/types-scalable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { Award, Ban, RotateCcw } from 'lucide-react';

const STATUS_LABEL: Record<UserCertificate['status'], string> = {
  active: 'Vigente',
  expired: 'Vencido',
  revoked: 'Revocado',
};

/** Certificados emitidos a los embajadores, con opción de revocarlos o restaurarlos. */
export function IssuedCertificatesTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [certs, setCerts] = useState<UserCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | UserCertificate['status']>('all');

  useEffect(() => {
    let cancelled = false;
    // Primero se registran los certificados ganados que aún no tengan registro.
    syncCertificates(true)
      .then(() => getAllUserCertificates())
      .then(all => { if (!cancelled) setCerts(all); })
      .catch(() => toast({ variant: 'destructive', title: 'No se pudieron cargar los certificados' }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return certs.filter(c =>
      (status === 'all' || c.status === status) &&
      (!q || [c.userName, c.userEmail, c.title].some(v => v?.toLowerCase().includes(q))));
  }, [certs, search, status]);

  async function changeStatus(cert: UserCertificate, next: 'active' | 'revoked') {
    if (!user) return;
    const ok = await confirm(next === 'revoked'
      ? {
          title: `¿Revocar el certificado de ${cert.userName || cert.userEmail}?`,
          description: `"${cert.title}" dejará de aparecer en su perfil y ya no podrá abrirlo.`,
          confirmLabel: 'Revocar',
        }
      : {
          title: `¿Restaurar el certificado de ${cert.userName || cert.userEmail}?`,
          description: `"${cert.title}" vuelve a aparecer en su perfil.`,
          confirmLabel: 'Restaurar',
          destructive: false,
        });
    if (!ok) return;
    try {
      await setCertificateStatus(cert.id, next, user.uid);
      setCerts(prev => prev.map(c => c.id === cert.id ? { ...c, status: next } : c));
      toast({ title: next === 'revoked' ? 'Certificado revocado' : 'Certificado restaurado' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo actualizar el certificado' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Buscar por persona o certificado…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1">
          {(['all', 'active', 'expired', 'revoked'] as const).map(s => (
            <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => setStatus(s)}>
              {s === 'all' ? 'Todos' : STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {certs.length === 0 ? 'Todavía no se ha emitido ningún certificado.' : 'Sin resultados.'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {rows.slice(0, 300).map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${c.kind === 'course' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                  <Award className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.userName || c.userEmail}
                    {c.userName && c.userEmail && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.userEmail}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.title} · {c.kind === 'course' ? 'Curso' : 'Ruta'}
                    {c.issuedAt?.toDate && ` · ${c.issuedAt.toDate().toLocaleDateString('es-MX')}`}
                  </p>
                </div>
                <Badge variant={c.status === 'active' ? 'secondary' : 'outline'} className="text-[10px] shrink-0">
                  {STATUS_LABEL[c.status]}
                </Badge>
                {c.status === 'revoked' ? (
                  <Button variant="ghost" size="sm" className="gap-1 shrink-0" onClick={() => changeStatus(c, 'active')}>
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="gap-1 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => changeStatus(c, 'revoked')}>
                    <Ban className="h-3.5 w-3.5" /> Revocar
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Un certificado vencido es de un curso con re-certificación: vuelve a estar vigente cuando el embajador lo renueva.
      </p>
      {dialog}
    </div>
  );
}
