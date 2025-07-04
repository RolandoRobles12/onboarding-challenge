import type { QuizData } from './types';

export const quizzes: QuizData = {
  ba: {
    title: 'Promotores BA',
    missions: [
      {
        id: 'm1_ba',
        title: 'Misión 1: El Origen de tu Compra',
        narrative: 'Tu viaje comienza aquí. Antes de aventurarte en el campo, debes entender los fundamentos de "Aviva Tu Compra". Responde correctamente para forjar tu camino.',
        questions: [
          {
            text: '¿Cuál es el propósito principal de "Aviva Tu Compra"?',
            options: [
              { text: 'Ofrecer préstamos para negocios', isCorrect: false },
              { text: 'Financiar la compra de productos específicos en tiendas afiliadas', isCorrect: true },
              { text: 'Dar tarjetas de crédito', isCorrect: false },
              { text: 'Inversiones a largo plazo', isCorrect: false },
            ],
          },
          {
            text: '¿Qué herramienta es esencial para registrar una nueva solicitud?',
            options: [
              { text: 'Correo electrónico', isCorrect: false },
              { text: 'Una libreta de notas', isCorrect: false },
              { text: 'La plataforma AOS (Aviva Operating System)', isCorrect: true },
              { text: 'WhatsApp', isCorrect: false },
            ],
          },
        ],
      },
      {
        id: 'm2_ba',
        title: 'Misión 2: El Arte del Seguimiento',
        narrative: 'Un verdadero héroe de Aviva no abandona a sus clientes. Esta misión pondrá a prueba tu conocimiento sobre el proceso de seguimiento y desembolso. ¡Adelante!',
        questions: [
          {
            text: '¿Cuál es el primer paso después de que una solicitud es aprobada?',
            options: [
              { text: 'Contactar al cliente para felicitarlo', isCorrect: false },
              { text: 'Esperar a que el cliente llame', isCorrect: false },
              { text: 'Notificar al cliente y coordinar la firma del contrato', isCorrect: true },
              { text: 'Archivar el caso', isCorrect: false },
            ],
          },
          {
            text: '¿A través de qué canal principal se comunica el estatus de la solicitud al cliente?',
            options: [
              { text: 'Mensajes de humo', isCorrect: false },
              { text: 'Slack', isCorrect: false },
              { text: 'Llamada telefónica y/o SMS', isCorrect: true },
              { text: 'Facebook', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },
  atn: {
    title: 'Promotores y Gerentes',
    missions: [
      {
        id: 'm1_atn',
        title: 'Misión 1: El Motor del Negocio',
        narrative: 'Como promotor o gerente, tu rol es clave para el crecimiento. Esta primera misión explora los fundamentos de "Aviva Tu Negocio". Demuestra tu valía.',
        questions: [
          {
            text: '¿Quién es el cliente objetivo principal para "Aviva Tu Negocio"?',
            options: [
              { text: 'Estudiantes universitarios', isCorrect: false },
              { text: 'Dueños de pequeños y medianos negocios', isCorrect: true },
              { text: 'Empleados de grandes corporaciones', isCorrect: false },
              { text: 'Jubilados', isCorrect: false },
            ],
          },
          {
            text: '¿Qué evalúa principalmente Aviva para aprobar un crédito de "Aviva Tu Negocio"?',
            options: [
              { text: 'El tipo de auto del solicitante', isCorrect: false },
              { text: 'La capacidad de pago y la salud financiera del negocio', isCorrect: true },
              { text: 'El número de seguidores en redes sociales', isCorrect: false },
              { text: 'La edad del dueño del negocio', isCorrect: false },
            ],
          },
        ],
      },
      {
        id: 'm2_atn',
        title: 'Misión 2: Liderando la Renovación',
        narrative: 'El éxito no es un destino, es un ciclo. La renovación de créditos es vital. ¿Sabes cómo guiar a tus clientes en este proceso? ¡Es hora de probarlo!',
        questions: [
          {
            text: '¿Qué beneficio clave ofrece la renovación de un crédito a un cliente con buen historial?',
            options: [
              { text: 'Un trofeo conmemorativo', isCorrect: false },
              { text: 'Posibilidad de acceder a un monto mayor y/o mejores condiciones', isCorrect: true },
              { text: 'Un nuevo producto gratis', isCorrect: false },
              { text: 'Un saludo del CEO', isCorrect: false },
            ],
          },
          {
            text: '¿Cuál es el requisito indispensable para que un cliente pueda renovar su crédito?',
            options: [
              { text: 'Haber pagado un mínimo de 10 cuotas', isCorrect: false },
              { text: 'Tener un excelente historial de pagos y haber liquidado un porcentaje significativo del crédito actual', isCorrect: true },
              { text: 'Ser amigo del gerente', isCorrect: false },
              { text: 'Tener un negocio con más de 10 años', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },
};
