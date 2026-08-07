import type { MetadataRoute } from 'next';

/**
 * Manifest de la PWA — permite instalar la app del vendedor en la tablet o el
 * celular y abrirla en su propia ventana, sin barra de direcciones.
 *
 * `start_url: '/'` apunta a la ruta del vendedor a propósito: es la pantalla
 * con la que se trabaja a diario. El panel de admin sigue accesible dentro de
 * la app instalada (para capacitadores y admins), simplemente no es el punto
 * de entrada.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aviva LMS — Jaguar Aviva',
    short_name: 'Aviva LMS',
    description:
      'Tu ruta de aprendizaje Aviva: cursos, desafíos, pulso diario de conocimiento y certificados.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#074739',
    theme_color: '#074739',
    lang: 'es-MX',
    dir: 'ltr',
    categories: ['education', 'business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Pulso de Conocimiento',
        short_name: 'Pulso',
        description: 'Responde las preguntas de hoy',
        url: '/pulse',
      },
      {
        name: 'Mis Desafíos',
        short_name: 'Desafíos',
        description: 'Practica y compite en el ranking',
        url: '/challenges',
      },
      {
        name: 'Videos',
        short_name: 'Videos',
        description: 'Cápsulas de aprendizaje',
        url: '/videos',
      },
    ],
  };
}
