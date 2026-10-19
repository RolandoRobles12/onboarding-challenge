'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Trophy } from 'lucide-react';
import { getAllBadges, getQuizzes } from '@/lib/firestore-service';
import { describeCriteria } from '@/components/admin/BadgeCriteriaFields';
import type { Badge, GamificationConfig, Quiz } from '@/lib/types-scalable';

function NumberField({ label, hint, value, onChange, min = 0, max = 1000 }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        type="number" min={min} max={max} className="h-9"
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || 0)))}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Gamificación, desafíos previos y "aprobar para avanzar" del editor de
 * desafíos (nuevo y edición). Todo lo aplica el servidor al jugar.
 */
export function QuizGamificationCard({
  quizId, gamification, onGamificationChange, requirePass, onRequirePassChange, prerequisites, onPrerequisitesChange, hasTimeLimit,
}: {
  quizId?: string;
  gamification: GamificationConfig;
  onGamificationChange: (g: GamificationConfig) => void;
  requirePass: boolean;
  onRequirePassChange: (v: boolean) => void;
  prerequisites: string[];
  onPrerequisitesChange: (ids: string[]) => void;
  hasTimeLimit: boolean;
}) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  useEffect(() => {
    getQuizzes(undefined, false).then(setQuizzes).catch(() => {});
    getAllBadges().then(setBadges).catch(() => {});
  }, []);

  const set = (patch: Partial<GamificationConfig>) => onGamificationChange({ ...gamification, ...patch });
  const myBadges = quizId
    ? badges.filter(b => b.active && (b.criteria?.type === 'quiz_passed' || b.criteria?.type === 'quiz_perfect')
        && (!('quizId' in b.criteria) || !b.criteria.quizId || b.criteria.quizId === quizId))
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Gamificación y requisitos</CardTitle>
        <CardDescription>Puntos de XP, vidas y lo que se necesita para abrir o completar este desafío.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NumberField label="XP por acierto" value={gamification.pointsPerCorrectAnswer} onChange={v => set({ pointsPerCorrectAnswer: v })} />
          <NumberField label="XP por pregunta clave" hint="Preguntas tipo trampa" value={gamification.pointsPerTrickyQuestion} onChange={v => set({ pointsPerTrickyQuestion: v })} />
          <NumberField label="XP que resta cada error" value={gamification.penaltyPerError} onChange={v => set({ penaltyPerError: v })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            ['enableLives', 'Misiones con límite de errores', 'Si se apaga, los errores no obligan a reiniciar la misión.'],
            ['enableBonusLives', 'Vidas extra por preguntas clave', 'Acertar una pregunta clave da una vida para la siguiente misión.'],
            ['timeBonus', 'Bonus de XP por rapidez', hasTimeLimit ? 'Hasta 50% extra según el tiempo que sobre.' : 'Requiere un tiempo límite.'],
          ] as [keyof GamificationConfig, string, string][]).map(([key, label, hint]) => (
            <div key={key} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
              <Switch
                checked={!!gamification[key]}
                disabled={key === 'timeBonus' && !hasTimeLimit}
                onCheckedChange={v => set({ [key]: v } as Partial<GamificationConfig>)}
              />
              <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{hint}</p></div>
            </div>
          ))}
          {gamification.enableBonusLives && (
            <NumberField label="Máximo de vidas extra" min={1} max={10} value={gamification.maxLives} onChange={v => set({ maxLives: v })} />
          )}
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
          <Switch checked={requirePass} onCheckedChange={onRequirePassChange} />
          <div>
            <p className="text-sm font-medium">Aprobar para avanzar en la ruta</p>
            <p className="text-xs text-muted-foreground">El paso de la ruta solo se completa al alcanzar la puntuación mínima. Úsalo junto con reintentos para no dejar a nadie atorado.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Desafíos previos requeridos</Label>
          <p className="text-[11px] text-muted-foreground">El embajador debe aprobarlos antes de poder abrir este.</p>
          <div className="flex flex-wrap gap-2">
            {quizzes.filter(q => q.id !== quizId).map(q => {
              const on = prerequisites.includes(q.id);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onPrerequisitesChange(on ? prerequisites.filter(id => id !== q.id) : [...prerequisites, q.id])}
                  className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'}`}
                >
                  {q.title}
                </button>
              );
            })}
            {quizzes.length <= 1 && <span className="text-xs text-muted-foreground">No hay otros desafíos.</span>}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Insignias:</span>{' '}
          {myBadges.length > 0
            ? myBadges.map(b => `${b.emoji} ${b.name} (${describeCriteria(b.criteria) ?? ''})`).join(' · ')
            : 'ninguna se gana con este desafío.'}{' '}
          <Link href="/admin/insignias" className="underline text-primary">Configurar en Insignias</Link>
        </div>
      </CardContent>
    </Card>
  );
}
