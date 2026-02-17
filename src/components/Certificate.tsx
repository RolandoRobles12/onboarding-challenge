'use client'

import { useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Home } from 'lucide-react';
import { AvivaLogo } from './AvivaLogo';
import { JaguarMascot } from './JaguarMascot';
import Link from 'next/link';
import type { CertificateConfig } from '@/lib/types-scalable';
import { DEFAULT_CERTIFICATE_CONFIG } from '@/lib/types-scalable';

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
          background: `linear-gradient(135deg, ${cfg.bgColorStart} 0%, ${cfg.bgColorEnd} 100%)`,
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Decorative borders */}
        <div className="absolute inset-3 border border-white/30 pointer-events-none z-20" />
        <div className="absolute inset-5 border border-white/15 pointer-events-none z-20" />

        {/* Dot watermark */}
        <div
          className="absolute inset-0 opacity-[0.04] z-0"
          style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* ── Mascot (right side, behind content) ── */}
        {cfg.showMascot && (
          <div className="absolute right-6 bottom-0 z-10 pointer-events-none" style={{ height: '82%', aspectRatio: '200/260' }}>
            <JaguarMascot className="h-full w-auto opacity-90" />
          </div>
        )}

        {/* ── Main content ── */}
        <div className="relative z-30 h-full flex flex-col items-start justify-between py-8 px-12 text-white">

          {/* Top row: logo + subtitle */}
          <div className="flex flex-col gap-1">
            {cfg.showLogo && (
              <AvivaLogo className="h-9 w-auto brightness-0 invert" />
            )}
            <p className="text-[10px] md:text-xs tracking-[0.35em] uppercase font-light text-white/70 mt-1">
              {cfg.subtitle}
            </p>
            <h1 className="text-base md:text-xl font-bold tracking-widest uppercase text-white">
              {cfg.title}
            </h1>
          </div>

          {/* Center: recipient block */}
          <div className="flex flex-col gap-3 max-w-[60%]">
            <p className="text-xs md:text-sm text-white/80 font-light tracking-wide">
              {cfg.bodyPrefix}
            </p>

            {/* Name */}
            <div>
              <h2
                className="text-2xl md:text-4xl font-bold text-white leading-tight"
                style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.03em' }}
              >
                {fullName}
              </h2>
              <div className="h-0.5 bg-white/50 mt-2 w-full max-w-xs" />
            </div>

            <p className="text-xs md:text-sm text-white/85 leading-relaxed">
              {cfg.bodySuffix}{' '}
              <strong className="text-white font-semibold">{quizTitle}</strong>{' '}
              con una puntuación de{' '}
              <strong className="text-white font-semibold">{percentage}%</strong>
            </p>

            {/* Score pill */}
            <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 border border-white/25 self-start">
              <span className="text-yellow-300">★</span>
              <span className="text-sm font-semibold">{score} / {totalQuestions} correctas · {percentage}%</span>
            </div>
          </div>

          {/* Bottom: signers + date */}
          <div className="flex items-end justify-between w-full max-w-[62%] gap-6">
            {/* Signers */}
            <div className="flex items-end gap-8 flex-wrap">
              {displaySigners.map((signer, i) => (
                <div key={i} className="text-center min-w-[90px]">
                  <div className="border-t border-white/60 pt-2 mt-8">
                    <p className="text-xs font-semibold leading-tight">{signer.name}</p>
                    <p className="text-[10px] text-white/70 leading-tight mt-0.5">{signer.position}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Date */}
            <div className="text-right shrink-0">
              <div className="border-t border-white/60 pt-2 mt-8 inline-block min-w-[90px]">
                <p className="text-xs font-semibold">Fecha</p>
                <p className="text-[10px] text-white/70 mt-0.5">{date}</p>
              </div>
            </div>
          </div>
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
