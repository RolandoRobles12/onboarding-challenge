/**
 * Certificados ligados al perfil (user_certificates): id fijo por certificado
 * y enlace para abrirlo. Lo usan el navegador y el servidor.
 */

import type { UserCertificate } from './types-scalable';

export function journeyCertificateId(userId: string, journeyId: string, stepId: string): string {
  return `${userId}_journey_${journeyId}_${stepId}`;
}

export function courseCertificateId(userId: string, courseId: string): string {
  return `${userId}_course_${courseId}`;
}

/** Página donde se ve e imprime el certificado. */
export function certificateHref(cert: Pick<UserCertificate, 'kind' | 'productId' | 'journeyId' | 'stepId' | 'courseId'>): string {
  if (cert.kind === 'course') return `/courses/${cert.courseId}/certificate`;
  const params = new URLSearchParams({ journeyId: cert.journeyId ?? '', stepId: cert.stepId ?? '' });
  return `/${cert.productId}/certificate?${params.toString()}`;
}
