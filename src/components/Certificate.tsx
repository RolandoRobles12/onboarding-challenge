'use client'

import { useRef } from 'react';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download, Award, Home } from 'lucide-react';
import { AvivaLogo } from './AvivaLogo';
import Link from 'next/link';
import { quizzes } from '@/lib/questions';

interface CertificateProps {
    fullName: string;
    quizTitle: string;
    score: number;
    totalQuestions: number;
    date: string;
}

export function Certificate({ fullName, quizTitle, score, totalQuestions, date }: CertificateProps) {
    const certificateRef = useRef<HTMLDivElement>(null);

    const handleDownload = async () => {
        const element = certificateRef.current;
        if (!element) {
            return;
        }

        try {
            const dataUrl = await htmlToImage.toPng(element, { 
                quality: 1, 
                pixelRatio: 2,
                style: {
                    // Temporarily set a fixed size for consistent PDF output
                    width: `${element.offsetWidth}px`,
                    height: `${element.offsetHeight}px`,
                }
            });
            
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'px',
                // A4 aspect ratio in landscape
                format: [1123, 794] 
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Certificado_Aviva_${fullName.replace(/ /g, '_')}.pdf`);

        } catch (error) {
            console.error('oops, something went wrong!', error);
        }
    };

    const percentage = Math.round((score / totalQuestions) * 100);

    return (
        <div className="flex flex-col items-center justify-center space-y-6">
            <div ref={certificateRef} className="w-full max-w-4xl p-8 bg-card border-4 border-primary/30 shadow-2xl relative aspect-[1.414/1] overflow-hidden">
                <div className="absolute inset-0 bg-primary/5 opacity-50 z-0"></div>
                <div className="absolute top-8 left-8 right-8 bottom-8 border-2 border-primary/50 z-10"></div>
                
                <div className="relative z-20 flex flex-col items-center justify-center h-full text-center text-accent p-4">
                    <AvivaLogo className="h-12 md:h-16 w-auto mb-4" />
                    
                    <h1 className="text-xs md:text-sm font-semibold uppercase tracking-widest text-muted-foreground">Certificado de Finalización</h1>
                    <Award className="w-16 h-16 md:w-20 md:h-20 my-4 md:my-6 text-yellow-500" />

                    <p className="text-base md:text-lg">Se otorga a</p>
                    <h2 className="text-3xl md:text-5xl font-headline my-1 md:my-2 text-primary break-words">{fullName}</h2>

                    <p className="max-w-prose mt-3 md:mt-4 text-sm md:text-lg">
                        Por haber completado exitosamente el <strong className="font-semibold">Desafío Aviva</strong> en el módulo de <strong className="font-semibold">{quizTitle}</strong> con una puntuación de {percentage}%.
                    </p>

                    <div className="mt-auto pt-4 md:pt-8 w-full flex justify-between items-end text-xs md:text-sm">
                        <div className="text-left">
                            <p className="font-semibold border-t border-accent pt-2">Firma Autorizada</p>
                            <p>Equipo de Capacitación Aviva</p>
                        </div>
                        <div className="text-right">
                             <p className="font-semibold border-t border-accent pt-2">Fecha de Finalización</p>
                             <p>{date}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="w-full max-w-4xl flex flex-col sm:flex-row gap-4">
                <Button onClick={handleDownload} size="lg" className="w-full rounded-lg">
                    <Download className="mr-2" />
                    Descargar Certificado
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full rounded-lg">
                    <Link href="/">
                        <Home className="mr-2"/>
                        Volver al Inicio
                    </Link>
                </Button>
            </div>
        </div>
    );
}
