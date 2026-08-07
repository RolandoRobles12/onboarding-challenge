'use client'

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Certificate } from '@/components/Certificate';
import type { CertificateSignerData } from '@/components/Certificate';
import { getJourneyByProduct, getCertificateSigners, getCertificateConfig, markJourneyStepComplete } from '@/lib/firestore-service';
import type { CertificateConfig } from '@/lib/types-scalable';
import { useAuth } from '@/context/AuthContext';

function CertificateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, profile } = useAuth();

  const quizType = searchParams.get('quizType');
  const fullName = searchParams.get('fullName') || searchParams.get('nombre') || '';
  const quizTitle = searchParams.get('quizTitle') || 'Quiz';
  const scoreStr = searchParams.get('score');
  const totalQuestionsStr = searchParams.get('totalQuestions');
  // Presentes cuando se llega desde un paso "certificate" de la Ruta —
  // permiten marcar ese paso como completado al emitir el certificado.
  const journeyId = searchParams.get('journeyId');
  const stepId = searchParams.get('stepId');

  const [signers, setSigners] = useState<CertificateSignerData[]>([]);
  const [certConfig, setCertConfig] = useState<Partial<CertificateConfig>>({});

  useEffect(() => {
    if (!quizType || !fullName || !scoreStr || !totalQuestionsStr) {
      router.push('/');
      return;
    }

    if (journeyId && stepId && user) {
      markJourneyStepComplete(user.uid, journeyId, quizType, stepId, {
        userName: profile?.nombre,
        userEmail: profile?.email,
      }).catch(console.error);
    }

    // Load signers configured for this product's certificate step
    async function loadSigners() {
      try {
        const [journey, allSigners, config] = await Promise.all([
          getJourneyByProduct(quizType!),
          getCertificateSigners(),
          getCertificateConfig(),
        ]);

        // Apply certificate template config
        const { organizationId: _o, updatedAt: _u, ...configRest } = config;
        setCertConfig(configRest);

        if (journey) {
          const allSteps = journey.stages?.length
            ? journey.stages.flatMap(s => s.actions ?? [])
            : journey.steps ?? [];
          const certStep = allSteps.find(s => s.type === 'certificate');
          const signerIds: string[] = certStep?.config?.signerIds ?? [];

          if (signerIds.length > 0) {
            // Filter and order signers by the configured IDs
            const ordered = signerIds
              .map(id => allSigners.find(s => s.id === id))
              .filter((s): s is typeof allSigners[0] => s !== undefined)
              .map(s => ({ name: s.name, position: s.position, signatureUrl: s.signatureUrl }));
            setSigners(ordered);
            return;
          }
        }

        // Fallback: use first available active signers
        if (allSigners.length > 0) {
          setSigners(allSigners.slice(0, 2).map(s => ({ name: s.name, position: s.position, signatureUrl: s.signatureUrl })));
        }
      } catch {
        // Certificate renders with default fallback signer
      }
    }

    loadSigners();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizType, fullName, scoreStr, totalQuestionsStr, router, journeyId, stepId, user]);

  if (!quizType || !fullName || !scoreStr || !totalQuestionsStr) {
    return null;
  }

  const score = parseInt(scoreStr, 10);
  const totalQuestions = parseInt(totalQuestionsStr, 10);

  return (
    <Certificate
      fullName={fullName}
      quizTitle={quizTitle}
      score={score}
      totalQuestions={totalQuestions}
      date={new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
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
