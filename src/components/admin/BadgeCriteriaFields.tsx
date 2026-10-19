'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllJourneys, getAllSimModules, getCourses, getQuizzes } from '@/lib/firestore-service';
import type { BadgeCriteria, Journey, Quiz } from '@/lib/types-scalable';
import type { Course } from '@/lib/types-lms';
import type { SimModule } from '@/lib/types-simulation';

const ANY = '__any__';

export const CRITERIA_LABELS: Record<BadgeCriteria['type'], string> = {
  manual: 'Solo la entrega un admin',
  quiz_passed: 'Al aprobar un desafío',
  quiz_perfect: 'Al sacar 100% en un desafío',
  course_completed: 'Al terminar un curso',
  journey_completed: 'Al obtener el certificado de una ruta',
  pulse_streak: 'Por racha del Pulso',
  simulation_passed: 'Al aprobar una simulación',
};

/** Resumen corto del criterio para la tarjeta de la insignia. */
export function describeCriteria(c: BadgeCriteria | undefined, names: Record<string, string> = {}): string | null {
  if (!c || c.type === 'manual') return null;
  switch (c.type) {
    case 'quiz_passed': return `Al aprobar «${names[c.quizId] ?? 'un desafío'}»`;
    case 'quiz_perfect': return c.quizId ? `100% en «${names[c.quizId] ?? 'un desafío'}»` : '100% en cualquier desafío';
    case 'course_completed': return `Al terminar «${names[c.courseId] ?? 'un curso'}»`;
    case 'journey_completed': return c.journeyId ? `Certificado de «${names[c.journeyId] ?? 'una ruta'}»` : 'Certificado de cualquier ruta';
    case 'pulse_streak': return `Racha de ${c.days} pulsos seguidos`;
    case 'simulation_passed': return `Al aprobar «${names[c.simModuleId] ?? 'una simulación'}»`;
  }
}

/** Faltante del criterio, o null si está completo. */
export function criteriaError(c: BadgeCriteria): string | null {
  if (c.type === 'quiz_passed' && !c.quizId) return 'Elige el desafío.';
  if (c.type === 'course_completed' && !c.courseId) return 'Elige el curso.';
  if (c.type === 'simulation_passed' && !c.simModuleId) return 'Elige la simulación.';
  if (c.type === 'pulse_streak' && !(c.days > 0)) return 'Indica los días de racha.';
  return null;
}

/** Catálogo para elegir desafíos, cursos, rutas y simulaciones (y nombrarlos en las tarjetas). */
export function useCriteriaCatalog() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [sims, setSims] = useState<SimModule[]>([]);
  useEffect(() => {
    getQuizzes(undefined, false).then(setQuizzes).catch(() => {});
    getCourses().then(setCourses).catch(() => {});
    getAllJourneys().then(setJourneys).catch(() => {});
    getAllSimModules().then(setSims).catch(() => {});
  }, []);
  const names: Record<string, string> = Object.fromEntries([
    ...quizzes.map(q => [q.id, q.title]),
    ...courses.map(c => [c.id, c.title]),
    ...journeys.map(j => [j.id, j.name]),
    ...sims.map(s => [s.id, s.title]),
  ]);
  return { quizzes, courses, journeys, sims, names };
}

/** Cómo se gana la insignia (Admin → Insignias). */
export function BadgeCriteriaFields({ value, onChange, catalog }: {
  value: BadgeCriteria;
  onChange: (c: BadgeCriteria) => void;
  catalog: ReturnType<typeof useCriteriaCatalog>;
}) {
  const setType = (type: BadgeCriteria['type']) => {
    switch (type) {
      case 'quiz_passed': return onChange({ type, quizId: '' });
      case 'quiz_perfect': return onChange({ type });
      case 'course_completed': return onChange({ type, courseId: '' });
      case 'journey_completed': return onChange({ type });
      case 'pulse_streak': return onChange({ type, days: 5 });
      case 'simulation_passed': return onChange({ type, simModuleId: '' });
      default: return onChange({ type: 'manual' });
    }
  };

  return (
    <div className="space-y-2">
      <Label>¿Cómo se gana?</Label>
      <Select value={value.type} onValueChange={v => setType(v as BadgeCriteria['type'])}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(CRITERIA_LABELS) as BadgeCriteria['type'][]).map(t => (
            <SelectItem key={t} value={t}>{CRITERIA_LABELS[t]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(value.type === 'quiz_passed' || value.type === 'quiz_perfect') && (
        <Select
          value={value.quizId || (value.type === 'quiz_perfect' ? ANY : '')}
          onValueChange={v => onChange({ ...value, quizId: v === ANY ? undefined : v } as BadgeCriteria)}
        >
          <SelectTrigger><SelectValue placeholder="Elige el desafío..." /></SelectTrigger>
          <SelectContent>
            {value.type === 'quiz_perfect' && <SelectItem value={ANY}>Cualquier desafío</SelectItem>}
            {catalog.quizzes.map(q => <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {value.type === 'course_completed' && (
        <Select value={value.courseId} onValueChange={v => onChange({ ...value, courseId: v })}>
          <SelectTrigger><SelectValue placeholder="Elige el curso..." /></SelectTrigger>
          <SelectContent>
            {catalog.courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {value.type === 'journey_completed' && (
        <Select value={value.journeyId || ANY} onValueChange={v => onChange({ ...value, journeyId: v === ANY ? undefined : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Cualquier ruta</SelectItem>
            {catalog.journeys.map(j => <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {value.type === 'simulation_passed' && (
        <Select value={value.simModuleId} onValueChange={v => onChange({ ...value, simModuleId: v })}>
          <SelectTrigger><SelectValue placeholder="Elige la simulación..." /></SelectTrigger>
          <SelectContent>
            {catalog.sims.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {value.type === 'pulse_streak' && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={2}
            max={365}
            className="w-24"
            value={value.days}
            onChange={e => onChange({ ...value, days: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          />
          <span className="text-sm text-muted-foreground">pulsos completados seguidos</span>
        </div>
      )}

      {value.type !== 'manual' && (
        <p className="text-xs text-muted-foreground">Se entrega sola en cuanto el embajador lo logra (y le llega un aviso).</p>
      )}
    </div>
  );
}
