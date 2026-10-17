'use client'

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Certificate } from '@/components/Certificate';
import type { CertificateSignerData } from '@/components/Certificate';
import {
  getAllJourneys,
  getCertificateConfig,
  getCertificateSigners,
  getJourneyByProduct,
  getProduct,
  getUserJourneyProgress,
  issueJourneyCertificate,
} from '@/lib/firestore-service';
import type { CertificateConfig, Journey } from '@/lib/types-scalable';
import { isJourneyStepUnlocked, journeySteps } from '@/lib/journey-progress';
import { useAuth } from '@/context/AuthContext';

interface CertificateData {
  fullName: string;
  title: string;
  done: number;
  total: number;
  issuedAt: Date;
}

/**
 * Certificado de un paso "certificate" de la Ruta. Todo sale de Firestore (el
 * nombre del perfil, el avance real y la fecha de emisión): la URL solo dice
 * qué ruta y qué paso. Solo se emite si el paso ya está disponible.
 */
function CertificateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeParams = useParams<{ quizType: string }>();
  const { user, profile, isTrainer } = useAuth();

  const productId = routeParams.quizType || searchParams.get('quizType') || '';
  const journeyId = searchParams.get('journeyId');
  const stepId = searchParams.get('stepId');

  const [data, setData] = useState<CertificateData | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [signers, setSigners] = useState<CertificateSignerData[]>([]);
  const [certConfig, setCertConfig] = useState<Partial<CertificateConfig>>({});

  useEffect(() => {
    if (!journeyId || !stepId) {
      router.push('/');
      return;
    }
    if (!user || !profile) return;
    let cancelled = false;

    (async () => {
      try {
        const byProduct = productId ? await getJourneyByProduct(productId).catch(() => null) : null;
        const journey: Journey | null = byProduct?.id === journeyId
          ? byProduct
          : (await getAllJourneys().catch(() => [] as Journey[])).find(j => j.id === journeyId) ?? null;
        const steps = journey ? journeySteps(journey) : [];
        const certStep = steps.find(s => s.id === stepId && s.type === 'certificate');
        if (!journey || !certStep) {
          if (!cancelled) setNotAvailable(true);
          return;
        }

        const progress = await getUserJourneyProgress(user.uid, journey.id);
        const completed = new Set(progress?.completedStepIds ?? []);
        // El staff puede ver el certificado para revisarlo, aunque no haya hecho la ruta.
        if (!isJourneyStepUnlocked(journey, certStep.id, completed) && !isTrainer) {
          if (!cancelled) setNotAvailable(true);
          return;
        }

        const [issuedAt, product, allSigners, config] = await Promise.all([
          issueJourneyCertificate(user.uid, journey.id, journey.productId, certStep.id, {
            userName: profile.nombre,
            userEmail: profile.email,
          }),
          getProduct(journey.productId).catch(() => null),
          getCertificateSigners().catch(() => []),
          getCertificateConfig().catch(() => null),
        ]);
        if (cancelled) return;

        completed.add(certStep.id);
        setData({
          fullName: profile.nombre || 'Promotor Aviva',
          title: product?.name || journey.name || 'tu Ruta Aviva',
          done: steps.filter(s => completed.has(s.id)).length,
          total: steps.length || 1,
          issuedAt,
        });

        if (config) {
          const { organizationId: _o, updatedAt: _u, ...configRest } = config;
          setCertConfig(configRest);
        }

        // Firmantes configurados en el paso; si no hay, los dos primeros activos.
        const signerIds: string[] = certStep.config?.signerIds ?? [];
        const chosen = signerIds.length > 0
          ? signerIds.map(id => allSigners.find(s => s.id === id)).filter((s): s is typeof allSigners[0] => !!s)
          : allSigners.slice(0, 2);
        setSigners(chosen.map(s => ({ name: s.name, position: s.position, signatureUrl: s.signatureUrl })));
      } catch (err) {
        console.error('Error al generar el certificado:', err);
        if (!cancelled) setNotAvailable(true);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, journeyId, stepId, user?.uid, profile?.uid]);

  if (notAvailable) {
    return (
      <Card className="rounded-lg max-w-md mx-auto mt-10 text-center">
        <CardHeader>
          <CardTitle>Certificado aún no disponible</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Completa las etapas anteriores de tu ruta para obtenerlo.</p>
          <Button asChild variant="outline"><Link href="/">Volver a mi ruta</Link></Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Certificate
      fullName={data.fullName}
      quizTitle={data.title}
      score={data.done}
      totalQuestions={data.total}
      date={data.issuedAt.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
      signers={signers}
      config={certConfig}
    />
  );
}

export default function CertificatePage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Generando certificado...</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Estamos preparando tu reconocimiento. ¡Un momento!</p>
          </CardContent>
        </Card>
      }>
        <CertificateContent />
      </Suspense>
    </ProtectedRoute>
  );
}
