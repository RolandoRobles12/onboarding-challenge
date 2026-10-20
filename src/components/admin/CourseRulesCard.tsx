'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCertificateSigners, getKioscos, getProducts } from '@/lib/firestore-service';
import type { Course, RecurrenceType } from '@/lib/types-lms';
import type { CertificateSigner, Kiosko, Product } from '@/lib/types-scalable';

/** Campos de audiencia, requisitos, plazos, certificado y re-certificación del curso. */
export interface CourseRulesForm {
  prerequisiteCourseIds: string[];
  targetRoles: string[];
  productIds: string[];
  branchIds: string[];
  durationDays: string;
  expiresAt: string;      // YYYY-MM-DD o ''
  certificate: boolean;
  certificateSignerIds: string[];
  recertEnabled: boolean;
  recurrenceType: RecurrenceType;
  notifyDaysBefore: string;
  autoReassign: boolean;
}

export const DEFAULT_COURSE_RULES: CourseRulesForm = {
  prerequisiteCourseIds: [], targetRoles: [], productIds: [], branchIds: [],
  durationDays: '', expiresAt: '', certificate: false, certificateSignerIds: [],
  recertEnabled: false, recurrenceType: 'annual', notifyDaysBefore: '14', autoReassign: false,
};

export function courseRulesFromCourse(course: Course): CourseRulesForm {
  const expires = (course.expiresAt as { toDate?: () => Date } | undefined)?.toDate?.();
  return {
    prerequisiteCourseIds: course.prerequisiteCourseIds ?? [],
    targetRoles: course.targetRoles ?? [],
    productIds: course.productIds ?? [],
    branchIds: course.branchIds ?? [],
    durationDays: course.durationDays ? String(course.durationDays) : '',
    expiresAt: expires ? expires.toISOString().slice(0, 10) : '',
    certificate: !!course.certificateTemplate,
    certificateSignerIds: course.certificateSignerIds ?? [],
    recertEnabled: !!course.recertification?.enabled,
    recurrenceType: course.recertification?.recurrenceType && course.recertification.recurrenceType !== 'none'
      ? course.recertification.recurrenceType : 'annual',
    notifyDaysBefore: String(course.recertification?.notifyDaysBefore ?? 14),
    autoReassign: !!course.recertification?.autoReassign,
  };
}

/** Lo que se guarda en el curso a partir del formulario. */
export function courseRulesToUpdate(form: CourseRulesForm): Partial<Course> {
  const days = parseInt(form.durationDays, 10);
  const [y, m, d] = form.expiresAt ? form.expiresAt.split('-').map(Number) : [];
  return {
    prerequisiteCourseIds: form.prerequisiteCourseIds,
    targetRoles: form.targetRoles,
    productIds: form.productIds,
    branchIds: form.branchIds,
    // null (no undefined) para que al vaciar el campo se borre el valor guardado.
    durationDays: (days > 0 ? days : null) as unknown as number,
    // Cierra al final del día elegido.
    expiresAt: (form.expiresAt ? new Date(y, m - 1, d, 23, 59, 59) : null) as unknown as Course['expiresAt'],
    certificateTemplate: (form.certificate ? 'default' : null) as unknown as string,
    certificateSignerIds: form.certificateSignerIds,
    recertification: {
      enabled: form.recertEnabled,
      recurrenceType: form.recertEnabled ? form.recurrenceType : 'none',
      notifyDaysBefore: Math.max(1, parseInt(form.notifyDaysBefore, 10) || 14),
      autoReassign: form.autoReassign,
    },
  };
}

const ROLES: [string, string][] = [['seller', 'Embajadores'], ['trainer', 'Capacitadores'], ['admin', 'Admins']];
const RECURRENCE: [RecurrenceType, string][] = [['monthly', 'Cada mes'], ['quarterly', 'Cada 3 meses'], ['biannual', 'Cada 6 meses'], ['annual', 'Cada año']];

function Chips({ options, value, onChange, empty }: {
  options: [string, string][]; value: string[]; onChange: (v: string[]) => void; empty: string;
}) {
  if (options.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([id, label]) => {
        const on = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(on ? value.filter(v => v !== id) : [...value, id])}
            className={`text-xs px-2 py-0.5 rounded-full border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function CourseRulesCard({ courseId, allCourses, form, onChange }: {
  courseId: string;
  allCourses: Course[];
  form: CourseRulesForm;
  onChange: (f: CourseRulesForm) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [kioscos, setKioscos] = useState<Kiosko[]>([]);
  const [signers, setSigners] = useState<CertificateSigner[]>([]);
  useEffect(() => {
    getProducts().then(setProducts).catch(() => {});
    getKioscos(true).then(setKioscos).catch(() => {});
    getCertificateSigners().then(setSigners).catch(() => {});
  }, []);
  const set = (patch: Partial<CourseRulesForm>) => onChange({ ...form, ...patch });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Requisitos y vigencia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Para quién es <span className="font-normal text-muted-foreground">(vacío = todos)</span></Label>
          <Chips options={ROLES} value={form.targetRoles} onChange={v => set({ targetRoles: v })} empty="" />
          <Chips options={products.map(p => [p.id, p.name])} value={form.productIds} onChange={v => set({ productIds: v })} empty="Sin productos." />
          {kioscos.length > 0 && (
            <Chips options={kioscos.map(k => [k.name, k.name])} value={form.branchIds} onChange={v => set({ branchIds: v })} empty="" />
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Cursos previos requeridos</Label>
          <Chips
            options={allCourses.filter(c => c.id !== courseId).map(c => [c.id, c.title])}
            value={form.prerequisiteCourseIds}
            onChange={v => set({ prerequisiteCourseIds: v })}
            empty="No hay otros cursos."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Plazo para terminarlo (días)</Label>
            <Input type="number" min={0} value={form.durationDays} placeholder="Sin plazo" onChange={e => set({ durationDays: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cierra inscripciones el</Label>
            <Input type="date" value={form.expiresAt} onChange={e => set({ expiresAt: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Emite certificado</p>
            <p className="text-xs text-muted-foreground">Al completar el curso, el embajador obtiene su certificado.</p>
          </div>
          <Switch checked={form.certificate} onCheckedChange={v => set({ certificate: v })} />
        </div>
        {form.certificate && (
          <div className="space-y-1.5 pl-1">
            <Label className="text-xs">Firmantes <span className="font-normal text-muted-foreground">(máximo 2; sin elegir = los dos primeros activos)</span></Label>
            <Chips
              options={signers.map(s => [s.id, s.position ? `${s.name} · ${s.position}` : s.name])}
              value={form.certificateSignerIds}
              onChange={v => set({ certificateSignerIds: v.slice(-2) })}
              empty="No hay firmantes. Agrégalos en Certificados."
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Re-certificación</p>
              <p className="text-xs text-muted-foreground">El curso completado vence y hay que renovarlo.</p>
            </div>
            <Switch checked={form.recertEnabled} onCheckedChange={v => set({ recertEnabled: v })} />
          </div>
          {form.recertEnabled && (
            <div className="space-y-2 pl-1">
              <Select value={form.recurrenceType} onValueChange={v => set({ recurrenceType: v as RecurrenceType })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{RECURRENCE.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} className="h-8 w-20" value={form.notifyDaysBefore} onChange={e => set({ notifyDaysBefore: e.target.value })} />
                <span className="text-xs text-muted-foreground">días antes, avisar por Slack/push</span>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={form.autoReassign} onCheckedChange={v => set({ autoReassign: v })} />
                Al vencer, volver a asignarlo desde cero
              </label>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
