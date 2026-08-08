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
    // background_color pinta el splash mientras arranca: se iguala al fondo del
    // logo (#026149, Verde Musgo) para que el ícono no se vea recortado sobre
    // otro tono. theme_color es la barra de estado, y ahí sí va el Verde Pino
    // porque es el color del encabezado de la app.
    background_color: '#026149',
    theme_color: '#074739',
    lang: 'es-MX',
    dir: 'ltr',
    categories: ['education', 'business', 'productivity'],
    // El logo de marca ya trae fondo sólido de borde a borde y el símbolo ocupa
    // el 61% central, así que cumple la zona segura de Android (80% central) sin
    // necesitar una variante recortada aparte: sirve como 'any' y 'maskable'.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
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
