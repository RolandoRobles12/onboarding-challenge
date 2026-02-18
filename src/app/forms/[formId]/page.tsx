'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import {
  getJourneyForm,
  saveFormResponse,
  markJourneyStepComplete,
} from '@/lib/firestore-service';
import type { JourneyForm, FormField, FormAnswer } from '@/lib/types-scalable';
import { ChevronLeft, AlertCircle, Send, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Field renderers ──────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | string[] | number | undefined;
  onChange: (v: string | string[] | number) => void;
}) {
  if (field.type === 'section_header') {
    return (
      <div className="pt-4 pb-1 border-b">
        <h3 className="font-semibold text-base">{field.label}</h3>
        {field.description && <p className="text-sm text-muted-foreground mt-0.5">{field.description}</p>}
      </div>
    );
  }

  const strVal = typeof value === 'string' ? value : '';
  const numVal = typeof value === 'number' ? value : 0;
  const arrVal = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </label>

      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}

      {field.type === 'text' && (
        <input
          type="text"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder={field.placeholder}
          value={strVal}
          onChange={e => onChange(e.target.value)}
        />
      )}

      {field.type === 'textarea' && (
        <textarea
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[100px] resize-y"
          placeholder={field.placeholder}
          value={strVal}
          onChange={e => onChange(e.target.value)}
        />
      )}

      {field.type === 'number' && (
        <input
          type="number"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder={field.placeholder}
          value={strVal}
          onChange={e => onChange(e.target.value)}
        />
      )}

      {field.type === 'date' && (
        <input
          type="date"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          value={strVal}
          onChange={e => onChange(e.target.value)}
        />
      )}

      {field.type === 'single_choice' && field.options && (
        <div className="space-y-2">
          {field.options.map(opt => (
            <label key={opt.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="radio"
                name={field.id}
                value={opt.id}
                checked={strVal === opt.id}
                onChange={() => onChange(opt.id)}
                className="accent-primary h-4 w-4"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {field.type === 'multiple_choice' && field.options && (
        <div className="space-y-2">
          {field.options.map(opt => (
            <label key={opt.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                value={opt.id}
                checked={arrVal.includes(opt.id)}
                onChange={() => {
                  const next = arrVal.includes(opt.id)
                    ? arrVal.filter(v => v !== opt.id)
                    : [...arrVal, opt.id];
                  onChange(next);
                }}
                className="accent-primary h-4 w-4"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {field.type === 'rating_stars' && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="focus:outline-none"
            >
              <Star
                className={cn(
                  'h-7 w-7 transition-colors',
                  numVal >= n ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40',
                )}
              />
            </button>
          ))}
        </div>
      )}

      {field.type === 'rating_nps' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={cn(
                  'h-9 w-9 rounded-lg text-sm font-semibold border transition-all',
                  numVal === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground px-1">
            <span>{field.minLabel ?? 'Nada probable'}</span>
            <span>{field.maxLabel ?? 'Muy probable'}</span>
          </div>
        </div>
      )}

      {field.type === 'rating_scale' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {Array.from(
              { length: (field.maxValue ?? 10) - (field.minValue ?? 1) + 1 },
              (_, i) => (field.minValue ?? 1) + i,
            ).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={cn(
                  'h-9 w-9 rounded-lg text-sm font-semibold border transition-all',
                  numVal === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {(field.minLabel || field.maxLabel) && (
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              <span>{field.minLabel}</span>
              <span>{field.maxLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Form content (uses searchParams — must be inside Suspense) ───────────────

function FormContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile } = useAuth();

  const formId = params?.formId as string;
  const stepId = searchParams.get('stepId') ?? '';
  const journeyId = searchParams.get('journeyId') ?? '';
  const productId = searchParams.get('productId') ?? '';

  const [form, setForm] = useState<JourneyForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!formId) return;
    getJourneyForm(formId)
      .then(data => {
        if (!data) setNotFound(true);
        else setForm(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [formId]);

  const setAnswer = (fieldId: string, value: string | string[] | number) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[fieldId]; return n; });
  };

  const validate = () => {
    if (!form) return false;
    const newErrors: Record<string, string> = {};
    form.fields.forEach(field => {
      if (field.type === 'section_header' || !field.required) return;
      const val = answers[field.id];
      const empty =
        val === undefined ||
        val === '' ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === 'number' && (field.type === 'rating_stars' || field.type === 'rating_nps' || field.type === 'rating_scale') && val === 0);
      if (empty) newErrors[field.id] = 'Este campo es obligatorio';
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !form || !profile) return;
    setSubmitting(true);
    try {
      const formAnswers: FormAnswer[] = form.fields
        .filter(f => f.type !== 'section_header')
        .map(f => ({ fieldId: f.id, value: answers[f.id] ?? '' }));

      await saveFormResponse({
        formId: form.id,
        journeyId: journeyId || undefined,
        stepId: stepId || undefined,
        respondentId: profile.uid,
        organizationId: 'aviva-credito',
        answers: formAnswers,
      });

      // Mark journey step complete if context was provided
      if (stepId && journeyId && productId) {
        await markJourneyStepComplete(profile.uid, journeyId, productId, stepId);
      }

      setSubmitted(true);
      // Return to main page after a brief moment
      setTimeout(() => router.push('/'), 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
      <Skeleton className="h-7 w-2/3 rounded-xl" />
      <Skeleton className="h-4 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );

  if (notFound) return (
    <div className="flex flex-col items-center justify-center gap-4 text-center py-20 px-4">
      <AlertCircle className="h-12 w-12 text-muted-foreground" />
      <p className="font-semibold text-lg">Formulario no encontrado</p>
      <Button asChild variant="outline">
        <Link href="/"><ChevronLeft className="mr-2 h-4 w-4" />Volver al inicio</Link>
      </Button>
    </div>
  );

  if (submitted) return (
    <div className="flex flex-col items-center justify-center gap-4 text-center py-20 px-4">
      <div className="text-5xl">✅</div>
      <h2 className="text-xl font-bold">¡Formulario enviado!</h2>
      <p className="text-muted-foreground text-sm">Regresando a tu ruta…</p>
    </div>
  );

  if (!form) return null;

  const dataFields = form.fields.filter(f => f.type !== 'section_header');
  const filledRequired = dataFields.filter(f => f.required).every(f => {
    const val = answers[f.id];
    if (val === undefined || val === '') return false;
    if (Array.isArray(val)) return val.length > 0;
    return true;
  });

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{form.title}</h1>
        {form.description && (
          <p className="text-muted-foreground text-sm mt-1">{form.description}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {[...form.fields]
          .sort((a, b) => a.order - b.order)
          .map(field => (
            <div key={field.id}>
              <FieldRenderer
                field={field}
                value={answers[field.id]}
                onChange={val => setAnswer(field.id, val)}
              />
              {errors[field.id] && (
                <p className="text-xs text-destructive mt-1">{errors[field.id]}</p>
              )}
            </div>
          ))}

        <Button
          type="submit"
          disabled={submitting}
          className="w-full gap-2"
        >
          <Send className="h-4 w-4" />
          {submitting ? 'Enviando…' : 'Enviar formulario'}
        </Button>

        {!filledRequired && (
          <p className="text-xs text-center text-muted-foreground">
            Completa los campos obligatorios (<span className="text-destructive">*</span>) para enviar.
          </p>
        )}
      </form>
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function FormPage() {
  const { user, profile, logout } = useAuth();
  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">
          <header className="bg-accent text-accent-foreground border-b sticky top-0 z-20">
            <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link href="/" aria-label="Inicio">
                  <AvivaLogo className="h-7 w-auto" />
                </Link>
                <span className="text-accent-foreground/40 text-sm">/</span>
                <span className="text-accent-foreground/70 text-sm">Formulario</span>
              </div>
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-accent-foreground hover:bg-white/10 gap-1">
                  <ChevronLeft className="h-4 w-4" /> Volver
                </Button>
              </Link>
            </div>
          </header>

          <main className="flex-grow">
            <Suspense fallback={
              <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
                <Skeleton className="h-7 w-2/3 rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            }>
              <FormContent />
            </Suspense>
          </main>
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
