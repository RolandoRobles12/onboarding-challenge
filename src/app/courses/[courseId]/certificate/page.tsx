'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Timestamp } from 'firebase/firestore';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Certificate, type CertificateSignerData } from '@/components/Certificate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import {
  getCertificateConfig,
  getCertificateSigners,
  getCourse,
  getUserEnrollments,
  updateEnrollmentProgress,
} from '@/lib/firestore-service';
import { postEvent } from '@/lib/api-client';
import { toMillis } from '@/lib/course-access';
import type { CertificateConfig } from '@/lib/types-scalable';

/**
 * Certificado de un curso (si el curso lo emite). Nombre, curso y fecha salen
 * de Firestore; la fecha de emisión se fija la primera vez que se abre.
 */
export default function CourseCertificatePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { profile } = useAuth();
  const [data, setData] = useState<{ name: string; title: string; date: Date; lessons: number } | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [signers, setSigners] = useState<CertificateSignerData[]>([]);
  const [config, setConfig] = useState<Partial<CertificateConfig>>({});

  useEffect(() => {
    if (!profile || !courseId) return;
    let cancelled = false;
    (async () => {
      const [course, enrollments, allSigners, cfg] = await Promise.all([
        getCourse(courseId),
        getUserEnrollments(profile.uid).catch(() => []),
        getCertificateSigners().catch(() => []),
        getCertificateConfig().catch(() => null),
      ]);
      const enr = enrollments.find(e => e.courseId === courseId && e.status === 'completed');
      if (!course?.certificateTemplate || !enr) {
        if (!cancelled) setNotAvailable(true);
        return;
      }
      let issued = toMillis(enr.certificateIssuedAt) ?? null;
      if (issued === null) {
        issued = Date.now();
        await updateEnrollmentProgress(enr.id, { certificateIssuedAt: Timestamp.fromMillis(issued) }).catch(console.error);
        postEvent({ type: 'certificate_issued', courseId });
      }
      if (cancelled) return;
      setData({
        name: profile.nombre || 'Promotor Aviva',
        title: course.title,
        date: new Date(issued),
        lessons: course.modules.reduce((n, m) => n + m.lessons.length, 0),
      });
      setSigners(allSigners.slice(0, 2).map(s => ({ name: s.name, position: s.position, signatureUrl: s.signatureUrl })));
      if (cfg) {
        const { organizationId: _o, updatedAt: _u, ...rest } = cfg;
        setConfig(rest);
      }
    })();
    return () => { cancelled = true; };
  }, [profile, courseId]);

  return (
    <ProtectedRoute>
      {notAvailable ? (
        <Card className="rounded-lg max-w-md mx-auto mt-10 text-center">
          <CardHeader><CardTitle>Certificado no disponible</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Este curso no emite certificado o todavía no lo terminas.</p>
            <Button asChild variant="outline"><Link href={`/courses/${courseId}`}>Volver al curso</Link></Button>
          </CardContent>
        </Card>
      ) : data ? (
        <Certificate
          fullName={data.name}
          quizTitle={data.title}
          score={data.lessons}
          totalQuestions={data.lessons}
          date={data.date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
          signers={signers}
          config={config}
        />
      ) : null}
    </ProtectedRoute>
  );
}
