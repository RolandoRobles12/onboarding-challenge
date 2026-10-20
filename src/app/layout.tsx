import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from '@/context/AuthContext';
import { BrandingProvider } from '@/context/BrandingContext';
import { PwaProvider } from '@/components/PwaProvider';
import { connection } from 'next/server';
import { getServerBranding } from '@/lib/server/branding';
import { brandCssVars } from '@/lib/branding';

export const metadata: Metadata = {
  title: 'Aviva LMS',
  description: 'Plataforma de aprendizaje y desarrollo para el equipo comercial de Aviva.',
  applicationName: 'Aviva LMS',
  appleWebApp: {
    // Hace que iOS la abra sin barra de Safari cuando se agrega a inicio
    capable: true,
    title: 'Aviva LMS',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: {
    // Evita que iOS convierta números de crédito/folios en enlaces de teléfono
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#074739',
  width: 'device-width',
  initialScale: 1,
  // Se permite el zoom: bloquearlo es una barrera de accesibilidad y en tablet
  // hace falta para leer documentos y prototipos embebidos.
  maximumScale: 5,
  // Pinta el fondo bajo las áreas seguras (notch / barra de gestos) para que
  // la app se vea a pantalla completa de verdad, no con franjas.
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // La marca se lee en cada solicitud (con caché de 60 s) y viaja en el HTML:
  // logos y colores aparecen desde el primer pintado.
  await connection();
  const branding = await getServerBranding();
  const brandImages = [...new Set([branding?.logoUrl, branding?.iconUrl].filter((u): u is string => !!u))];

  return (
    <html lang="es-MX" suppressHydrationWarning style={branding ? brandCssVars(branding) as React.CSSProperties : undefined}>
      <head>
        {brandImages.map(url => <link key={url} rel="preload" as="image" href={url} fetchPriority="high" />)}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fustat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          <BrandingProvider initial={branding}>
            {children}
            <Toaster />
            <PwaProvider />
          </BrandingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
