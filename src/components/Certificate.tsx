'use client'

import { useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Home } from 'lucide-react';
import { AvivaLogo } from './AvivaLogo';
import Link from 'next/link';

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
}

export function Certificate({ fullName, quizTitle, score, totalQuestions, date, signers = [] }: CertificateProps) {
  const certificateRef = useRef<HTMLDivElement>(null);
  const percentage = Math.round((score / totalQuestions) * 100);

  const handleDownload = async () => {
    const element = certificateRef.current;
    if (!element) return;
    try {
      const dataUrl = await htmlToImage.toPng(element, {
        quality: 1,
        pixelRatio: 2,
        style: {
          width: `${element.offsetWidth}px`,
          height: `${element.offsetHeight}px`,
        },
      });
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1123, 794] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save(`Certificado_Aviva_${fullName.replace(/ /g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  // Fallback signers if none configured
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
          background: 'linear-gradient(135deg, #0a6b3e 0%, #0d8a50 40%, #1aaa64 100%)',
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* Decorative corner ornaments */}
        <div className="absolute inset-3 border border-white/30 pointer-events-none" />
        <div className="absolute inset-5 border border-white/15 pointer-events-none" />

        {/* Background watermark pattern */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-between py-8 px-12 text-white text-center">

          {/* Top: Logo + title */}
          <div className="flex flex-col items-center gap-2">
            <AvivaLogo className="h-10 w-auto brightness-0 invert" />
            <div className="mt-1">
              <p className="text-[10px] md:text-xs tracking-[0.3em] uppercase font-light text-white/70">
                Desafío Aviva
              </p>
              <h1 className="text-lg md:text-2xl font-bold tracking-widest uppercase mt-0.5">
                Certificado de Participación
              </h1>
            </div>
          </div>

          {/* Middle: recipient */}
          <div className="flex flex-col items-center gap-2 flex-1 justify-center">
            <p className="text-xs md:text-sm text-white/80 font-light tracking-wide">
              Este certificado se otorga a
            </p>

            {/* Name with decorative lines */}
            <div className="flex items-center gap-4 w-full max-w-lg my-1">
              <div className="flex-1 h-px bg-white/40" />
              <h2
                className="text-2xl md:text-4xl font-bold px-4 text-white"
                style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.05em' }}
              >
                {fullName}
              </h2>
              <div className="flex-1 h-px bg-white/40" />
            </div>

            <p className="text-xs md:text-sm text-white/80 font-light max-w-sm leading-relaxed mt-1">
              Por haber completado exitosamente el módulo de{' '}
              <strong className="text-white font-semibold">{quizTitle}</strong>{' '}
              con una puntuación de{' '}
              <strong className="text-white font-semibold">{percentage}%</strong>
            </p>

            {/* Score badge */}
            <div className="mt-2 flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 border border-white/25">
              <span className="text-yellow-300 text-base">★</span>
              <span className="text-sm font-semibold">
                {score} / {totalQuestions} correctas · {percentage}%
              </span>
            </div>
          </div>

          {/* Bottom: signatures + date */}
          <div className="w-full flex items-end justify-between gap-4">
            {/* Signers */}
            <div className="flex items-end gap-8 flex-wrap">
              {displaySigners.map((signer, i) => (
                <div key={i} className="text-center min-w-[100px]">
                  <div className="border-t border-white/60 pt-2 mt-6">
                    <p className="text-xs font-semibold leading-tight">{signer.name}</p>
                    <p className="text-[10px] text-white/70 leading-tight mt-0.5">{signer.position}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Date */}
            <div className="text-right shrink-0">
              <div className="border-t border-white/60 pt-2 mt-6 inline-block min-w-[100px]">
                <p className="text-xs font-semibold">Fecha de finalización</p>
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
