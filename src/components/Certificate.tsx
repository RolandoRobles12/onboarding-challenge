'use client'

import React, { useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Home } from 'lucide-react';
import { AvivaLogo } from './AvivaLogo';
import { JaguarMascot } from './JaguarMascot';
import Link from 'next/link';
import type { CertificateConfig } from '@/lib/types-scalable';
import { DEFAULT_CERTIFICATE_CONFIG } from '@/lib/types-scalable';

/** Devuelve true si el color hex es claro (necesita texto oscuro) */
function isLightColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

export interface CertificateSignerData {
  name: string;
  position: string;
}

interface CertificateProps {
  fullName: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  date: string;
  signers?: CertificateSignerData[];
  config?: Partial<CertificateConfig>;
}

export function Certificate({
  fullName,
  quizTitle,
  score,
  totalQuestions,
  date,
  signers = [],
  config,
}: CertificateProps) {
  const certificateRef = useRef<HTMLDivElement>(null);
  const percentage = Math.round((score / totalQuestions) * 100);

  // Merge with defaults so every field is always defined
  const cfg = { ...DEFAULT_CERTIFICATE_CONFIG, ...config };

  // Colores adaptativos: si el fondo es claro, usar texto oscuro
  const lightBg = isLightColor(cfg.bgColorStart);
  const textPrimary   = lightBg ? '#111827' : '#ffffff';
  const textSecondary = lightBg ? '#374151' : 'rgba(255,255,255,0.75)';
  const borderColor   = lightBg ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.30)';
  const scoreBg       = lightBg ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)';
  const scoreBorder   = lightBg ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)';

  const handleDownload = async () => {
    const element = certificateRef.current;
    if (!element) return;
    try {
      const dataUrl = await htmlToImage.toPng(element, {
        quality: 1,
        pixelRatio: 2,
        style: { width: `${element.offsetWidth}px`, height: `${element.offsetHeight}px` },
      });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1123, 794] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save(`Certificado_Aviva_${fullName.replace(/ /g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const displaySigners: CertificateSignerData[] = signers.length > 0
    ? signers.slice(0, 3)
    : [{ name: 'Equipo de Capacitación', position: 'Aviva Crédito' }];

  return (
    <div className="flex flex-col items-center justify-center space-y-6 w-full">

      {/* ── Certificate visual ── */}
      <div
        ref={certificateRef}
        className="w-full max-w-4xl relative overflow-hidden"
        style={{
          aspectRatio: '1.414 / 1',
          background: cfg.bgColorStart,
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Decorative borders */}
        <div className="absolute inset-3 pointer-events-none z-20" style={{ border: `1px solid ${borderColor}` }} />
        <div className="absolute inset-5 pointer-events-none z-20" style={{ border: `1px solid ${borderColor.replace('0.30', '0.15').replace('0.15', '0.07')}` }} />

        {/* Dot watermark */}
        <div
          className="absolute inset-0 z-0"
          style={{
            opacity: lightBg ? 0.06 : 0.04,
            backgroundImage: `radial-gradient(circle, ${lightBg ? '#000' : '#fff'} 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />

        {/* ── Two-column layout: texto | mascota ── */}
        <div className="relative z-10 h-full flex flex-row">

          {/* ── Columna izquierda: todo el contenido ── */}
          <div className="flex flex-col justify-between h-full py-8 px-10"
            style={{ width: (cfg.mascotUrl || cfg.showMascot) ? '65%' : '100%' }}>

            {/* Top: logo + subtitle + title */}
            <div className="flex flex-col gap-1">
              {(cfg.logoUrl || cfg.showLogo) && (
                cfg.logoUrl
                  ? <img src={cfg.logoUrl} alt="Logo" className="h-9 w-auto object-contain" style={{ maxWidth: '180px' }} />
                  : <AvivaLogo className={`h-9 w-auto ${lightBg ? '' : 'brightness-0 invert'}`} />
              )}
              <p className="text-[10px] md:text-xs tracking-[0.35em] uppercase font-light mt-1" style={{ color: textSecondary }}>
                {cfg.subtitle}
              </p>
              <h1 className="text-base md:text-xl font-bold tracking-widest uppercase" style={{ color: textPrimary }}>
                {cfg.title}
              </h1>
            </div>

            {/* Center: recipient block */}
            <div className="flex flex-col gap-3">
              <p className="text-xs md:text-sm font-light tracking-wide" style={{ color: textSecondary }}>
                {cfg.bodyPrefix}
              </p>

              {/* Name */}
              <div>
                <h2
                  className="text-2xl md:text-4xl font-bold leading-tight"
                  style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.03em', color: textPrimary }}
                >
                  {fullName}
                </h2>
                <div className="h-0.5 mt-2 w-full max-w-xs" style={{ background: lightBg ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)' }} />
              </div>

              <p className="text-xs md:text-sm leading-relaxed" style={{ color: textSecondary }}>
                {cfg.bodySuffix}{' '}
                <strong style={{ color: textPrimary, fontWeight: 600 }}>{quizTitle}</strong>{' '}
                con una puntuación de{' '}
                <strong style={{ color: textPrimary, fontWeight: 600 }}>{percentage}%</strong>
              </p>

              {/* Score pill */}
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 self-start"
                style={{ background: scoreBg, border: `1px solid ${scoreBorder}` }}
              >
                <span style={{ color: '#f59e0b' }}>★</span>
                <span className="text-sm font-semibold" style={{ color: textPrimary }}>
                  {score} / {totalQuestions} correctas · {percentage}%
                </span>
              </div>
            </div>

            {/* Bottom: signers + date */}
            <div className="flex items-end gap-6 flex-wrap">
              {displaySigners.map((signer, i) => (
                <div key={i} className="text-center min-w-[90px]">
                  <div className="pt-2 mt-6" style={{ borderTop: `1px solid ${lightBg ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)'}` }}>
                    <p className="text-xs font-semibold leading-tight" style={{ color: textPrimary }}>{signer.name}</p>
                    <p className="text-[10px] leading-tight mt-0.5" style={{ color: textSecondary }}>{signer.position}</p>
                  </div>
                </div>
              ))}
              <div className="ml-auto text-right shrink-0">
                <div className="pt-2 mt-6 inline-block min-w-[90px]" style={{ borderTop: `1px solid ${lightBg ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)'}` }}>
                  <p className="text-xs font-semibold" style={{ color: textPrimary }}>Fecha</p>
                  <p className="text-[10px] mt-0.5" style={{ color: textSecondary }}>{date}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Columna derecha: mascota ── */}
          {(cfg.mascotUrl || cfg.showMascot) && (
            <div className="flex items-end justify-center pb-0 pointer-events-none" style={{ width: '35%' }}>
              {cfg.mascotUrl
                ? <img
                    src={cfg.mascotUrl}
                    alt="Mascota"
                    className="w-full h-auto object-contain"
                    style={{ maxHeight: '90%', opacity: 0.95 }}
                  />
                : <JaguarMascot className="w-full h-auto opacity-90" style={{ maxHeight: '90%' } as React.CSSProperties} />
              }
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row gap-3">
        <Button onClick={handleDownload} size="lg" className="w-full rounded-lg gap-2">
          <Download className="h-4 w-4" />
          Descargar Certificado (PDF)
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full rounded-lg gap-2">
          <Link href="/">
            <Home className="h-4 w-4" />
            Volver al Inicio
          </Link>
        </Button>
      </div>
    </div>
  );
}
