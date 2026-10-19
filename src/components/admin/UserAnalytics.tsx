'use client';

import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Users } from 'lucide-react';
import {
  getAllEnrollments,
  getAllJourneyProgress,
  getAllJourneys,
  getAllQuizAttempts,
  getAllUserBadges,
  getAllUsers,
  getPulseAttemptsByDateRange,
  getProducts,
} from '@/lib/firestore-service';
import { journeySteps } from '@/lib/journey-progress';
import { addDaysStr, pulseDateStr } from '@/lib/pulse-utils';
import type { Product, UserProfile } from '@/lib/types-scalable';

/** Días hacia atrás que se consideran para el Pulso. */
const PULSE_DAYS = 30;

interface Row {
  user: UserProfile;
  product: string;
  routePct: number | null;
  quizzes: number;
  quizAvg: number | null;
  pulses: number;
  pulseAvg: number | null;
  courses: number;
  badges: number;
  lastActivity: number | null;
}

const ms = (t: unknown): number | null =>
  t && typeof (t as { toMillis?: () => number }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;

const avg = (values: number[]) => values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

/** Analytics por usuario: avance de ruta, desafíos, pulso, cursos e insignias. */
export function UserAnalytics() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('seller');
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const today = pulseDateStr();
    Promise.all([
      getAllUsers(),
      getAllQuizAttempts().catch(() => []),
      getPulseAttemptsByDateRange(addDaysStr(today, -PULSE_DAYS), today),
      getAllEnrollments().catch(() => []),
      getAllJourneyProgress().catch(() => []),
      getAllJourneys().catch(() => []),
      getAllUserBadges().catch(() => []),
      getProducts().catch(() => []),
    ]).then(([users, attempts, pulses, enrollments, progress, journeys, badges, prods]) => {
      setProducts(prods);
      const productName = new Map(prods.map(p => [p.id, p.name]));
      const journeyByProduct = new Map(journeys.filter(j => j.active !== false).map(j => [j.productId, j]));
      setRows(users.map(user => {
        const mine = <T extends { userId?: string }>(list: T[]) => list.filter(x => x.userId === user.uid);
        const myAttempts = mine(attempts);
        const myPulses = mine(pulses).filter(p => p.status === 'completed');
        const journey = user.producto ? journeyByProduct.get(user.producto) : undefined;
        const steps = journey ? journeySteps(journey) : [];
        const done = new Set(progress.find(p => p.userId === user.uid && p.journeyId === journey?.id)?.completedStepIds ?? []);
        const activity = [
          ...myAttempts.map(a => ms(a.completedAt)),
          ...myPulses.map(p => ms(p.completedAt)),
          ...mine(enrollments).map(e => ms(e.updatedAt)),
          ...mine(progress).map(p => ms(p.updatedAt)),
        ].filter((v): v is number => v !== null);
        return {
          user,
          product: user.producto ? productName.get(user.producto) ?? '—' : '—',
          routePct: steps.length > 0 ? Math.round((steps.filter(s => done.has(s.id)).length / steps.length) * 100) : null,
          quizzes: myAttempts.length,
          quizAvg: avg(myAttempts.map(a => a.percentage)),
          pulses: myPulses.length,
          pulseAvg: avg(myPulses.map(p => p.percentage)),
          courses: mine(enrollments).filter(e => e.status === 'completed').length,
          badges: mine(badges).length,
          lastActivity: activity.length > 0 ? Math.max(...activity) : null,
        };
      }));
    }).catch(() => setRows([]));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter(r => r.user.active !== false)
      .filter(r => role === 'all' || r.user.rol === role)
      .filter(r => !q || r.user.nombre?.toLowerCase().includes(q) || r.user.email?.toLowerCase().includes(q) || r.product.toLowerCase().includes(q))
      .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
  }, [rows, search, role]);

  const exportCsv = () => {
    const csv = Papa.unparse(visible.map(r => ({
      nombre: r.user.nombre, email: r.user.email, rol: r.user.rol, producto: r.product, kiosko: r.user.assignedKiosko ?? '',
      avance_ruta: r.routePct ?? '', desafios: r.quizzes, promedio_desafios: r.quizAvg ?? '',
      pulsos_30d: r.pulses, promedio_pulso: r.pulseAvg ?? '', cursos_completados: r.courses, insignias: r.badges,
      ultima_actividad: r.lastActivity ? new Date(r.lastActivity).toISOString().slice(0, 10) : '',
    })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `usuarios-${pulseDateStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const daysAgo = (t: number | null) => {
    if (!t) return 'Sin actividad';
    const d = Math.floor((Date.now() - t) / 86_400_000);
    return d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Analytics por usuario</CardTitle>
            <CardDescription>Avance de ruta, desafíos, Pulso (últimos {PULSE_DAYS} días), cursos e insignias de cada persona.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!rows || visible.length === 0}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap pt-2">
          <Input placeholder="Buscar por nombre, correo o producto" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9" />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="seller">Embajadores</SelectItem>
              <SelectItem value="trainer">Capacitadores</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          {products.length > 0 && <span className="text-xs text-muted-foreground self-center">{visible.length} persona{visible.length !== 1 ? 's' : ''}</span>}
        </div>
      </CardHeader>
      <CardContent>
        {!rows ? (
          <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No hay personas con ese filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">Persona</th>
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium text-right">Ruta</th>
                  <th className="py-2 pr-3 font-medium text-right">Desafíos</th>
                  <th className="py-2 pr-3 font-medium text-right">Pulso</th>
                  <th className="py-2 pr-3 font-medium text-right">Cursos</th>
                  <th className="py-2 pr-3 font-medium text-right">Insignias</th>
                  <th className="py-2 font-medium">Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.user.uid} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <p className="font-medium truncate max-w-[200px]">{r.user.nombre || r.user.email}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.user.email}</p>
                    </td>
                    <td className="py-2 pr-3 text-xs">{r.product}</td>
                    <td className="py-2 pr-3 text-right">{r.routePct === null ? '—' : `${r.routePct}%`}</td>
                    <td className="py-2 pr-3 text-right">{r.quizzes}{r.quizAvg !== null && <span className="text-xs text-muted-foreground"> · {r.quizAvg}%</span>}</td>
                    <td className="py-2 pr-3 text-right">{r.pulses}{r.pulseAvg !== null && <span className="text-xs text-muted-foreground"> · {r.pulseAvg}%</span>}</td>
                    <td className="py-2 pr-3 text-right">{r.courses}</td>
                    <td className="py-2 pr-3 text-right">{r.badges}</td>
                    <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">{daysAgo(r.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
