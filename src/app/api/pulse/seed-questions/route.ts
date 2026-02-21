/**
 * POST /api/pulse/seed-questions
 * Agrega las preguntas base al banco de preguntas del Pulso de Conocimiento.
 * Idempotente: omite preguntas con el mismo texto si ya existen.
 */

import { NextResponse } from 'next/server';
import { createQuestion, getQuestions } from '@/lib/firestore-service';
import type { KnowledgeModule } from '@/lib/types-scalable';

function makeOptions(options: string[], correctText: string) {
  return options.map((text, i) => ({
    id: `opt_${String.fromCharCode(97 + i)}`,
    text,
    isCorrect: text.trim() === correctText.trim(),
    order: i,
  }));
}

const SEED_QUESTIONS: {
  text: string;
  options: string[];
  correct: string;
  module: KnowledgeModule;
  tags: string[];
}[] = [
  {
    text: '¿Qué significa AOS?',
    options: ['Aviva On System', 'Aviva Onboarding System', 'App Online Store', 'No sé'],
    correct: 'Aviva Onboarding System',
    module: 'solicitud_credito',
    tags: ['all'],
  },
  {
    text: '¿Con código de barras de paynet puedo pagar en Oxxo?',
    options: ['Solo en casos exepcionales', 'Solo para clientes de Aviva Contigo', 'No se puede', 'No sé'],
    correct: 'No se puede',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Todos los créditos de Aviva son individuales?',
    options: ['Depende del tipo de cliente', 'Manejamos algunos créditos grupales', 'Todos son individuales', 'No sé'],
    correct: 'Todos son individuales',
    module: 'banca_conversacional',
    tags: ['all'],
  },
  {
    text: '¿Todos los pagos son semanales? ¿Hay pagos quincenales?',
    options: [
      'Solo en Aviva tu Negocio hay pagos quincenales, conforme la evaluacion del cliente',
      'Aviva solo maneja pagos semanales y mensuales',
      'El cliente escoge si quiere pagar semanal, quincenal o mensual',
      'No sé',
    ],
    correct: 'Solo en Aviva tu Negocio hay pagos quincenales, conforme la evaluacion del cliente',
    module: 'banca_conversacional',
    tags: ['all'],
  },
  {
    text: 'Además del INE. ¿se puede utilizar otra identificación oficial?',
    options: [
      'No, únicamente con la INE vigente.',
      'Si, tambien se acepta pasaporte, pero tiene que ser Méxicano.',
      'Si, tambien se acepta pasaporte Méxicano y de E.U.',
      'No sé',
    ],
    correct: 'No, únicamente con la INE vigente.',
    module: 'solicitud_credito',
    tags: ['all'],
  },
  {
    text: '¿Al cliente se le notifica de forma automática cuando recibe su desembolso?',
    options: [
      'Hay notificaciones, pero solo si el desembolso tardó en salir',
      'Si, por llamada telefónica',
      'Si, por WhatsApp y en el App de Aviva',
      'No sé',
    ],
    correct: 'Si, por WhatsApp y en el App de Aviva',
    module: 'solicitud_credito',
    tags: ['aviva_contigo', 'aviva_tu_negocio'],
  },
  {
    text: '¿Hay un horario límite para realizar el pago durante el día de pago?',
    options: [
      'Tiene que pagar antes de las 6 pm, para el sistema registrarlo',
      'Lo puede pagar durante todo el día, hasta medianoche',
      'Por transferencia el límite es 8 pm, con Paynet se puede pagar hasta las 10 pm',
      'No sé',
    ],
    correct: 'Lo puede pagar durante todo el día, hasta medianoche',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuáles de los artículos que vende la tienda NO financiamos?',
    options: [
      'Alimentos, Medicamentos, Productos de belleza, Pago de servicios, Ropa, Juguetería, Videojuegos, Aceites para autos.',
      'No financiamos alimentos, todo el resto sí.',
      'Financiamos todos los productos de la tienda.',
      'No sé',
    ],
    correct: 'Alimentos, Medicamentos, Productos de belleza, Pago de servicios, Ropa, Juguetería, Videojuegos, Aceites para autos.',
    module: 'banca_conversacional',
    tags: ['aviva_tu_compra'],
  },
  {
    text: '¿Aviva es una financiera regulada?',
    options: [
      'Sí, Aviva es una SOFOM regulada ante la CONDUSEF',
      'No está regulada, pero sí es formal',
      'Está en proceso de obtener su licencia',
      'No sé',
    ],
    correct: 'Sí, Aviva es una SOFOM regulada ante la CONDUSEF',
    module: 'banca_conversacional',
    tags: ['all'],
  },
  {
    text: '¿Un cliente de Aviva tu Compra debe pagar el monto total desembolsado o solo el monto de la compra?',
    options: [
      'Siempre el total del monto desembolsado en Cashi.',
      'Solo la parte que realmente se gastó durante su compra.',
      'Eso depende del acuerdo que hace con los vendedores de Bodega Aurrera.',
      'No sé',
    ],
    correct: 'Siempre el total del monto desembolsado en Cashi.',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuál es el cargo por mora en caso de atrasarse en Aviva Contigo?',
    options: ['$50.00 MXN por pago vencido.', '$30.00 MXN por pago vencido.', '$50.00 MXN por día', 'No sé'],
    correct: '$50.00 MXN por pago vencido.',
    module: 'pagos_renovacion',
    tags: ['aviva_contigo'],
  },
  {
    text: '¿Cuál es el cargo por mora en caso de atrasarse en Aviva tu Negocio?',
    options: ['$60.00 MXN por pago vencido.', '$30.00 MXN por pago vencido.', '$60.00 MXN por día', 'No sé'],
    correct: '$60.00 MXN por pago vencido.',
    module: 'pagos_renovacion',
    tags: ['aviva_tu_negocio'],
  },
  {
    text: '¿Cuál es el cargo por mora en caso de atrasarse en Aviva tu Compra?',
    options: ['$50.00 MXN por pago vencido.', '$30.00 MXN por pago vencido.', '$50.00 MXN por día', 'No sé'],
    correct: '$50.00 MXN por pago vencido.',
    module: 'pagos_renovacion',
    tags: ['aviva_tu_compra'],
  },
  {
    text: '¿Cuál es el cargo por mora en caso de atrasarse en Aviva tu Casa?',
    options: ['$50.00 MXN por pago vencido.', '$30.00 MXN por pago vencido.', '$50.00 MXN por día', 'No sé'],
    correct: '$50.00 MXN por pago vencido.',
    module: 'pagos_renovacion',
    tags: ['aviva_tu_casa'],
  },
  {
    text: '¿A dónde se pueden solicitar las cartas finiquito?',
    options: [
      'Se puede solicitar al correo: ayuda@avivacredito.com',
      'Al chat de Aviva Crédito Producto',
      'Al chat de Aviva Pagos',
      'No sé',
    ],
    correct: 'Se puede solicitar al correo: ayuda@avivacredito.com',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Puedo solicitar el cambio de día de pago semanal?',
    options: [
      'Sí, se puede, pero debe presentar una razón válida. El cambio se realiza hasta la siguiente semana después de la solicitud.',
      'No es posible, dado que se eligió desde la videollamada.',
      'Sí, se realiza a través de la App de Aviva.',
      'No sé',
    ],
    correct: 'Sí, se puede, pero debe presentar una razón válida. El cambio se realiza hasta la siguiente semana después de la solicitud.',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Un cliente puede actualizar su número de teléfono?',
    options: [
      'Sí, lo debe de solicitar desde la App de Aviva.',
      'Lo debemos solicitar desde el canal de #collections, escribiendo nombre completo, CURP y el nuevo número.',
      'Se debe solicitar en el canal de videoagentes escribiendo nombre completo, CURP y el nuevo número.',
      'No sé',
    ],
    correct: 'Lo debemos solicitar desde el canal de #collections, escribiendo nombre completo, CURP y el nuevo número.',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Todos los créditos manejan la misma tasa de interés?',
    options: [
      'No, la tasa de interés varía en función al perfil del solicitante.',
      'Sí, es la misma tasa de interés para todos.',
      'Todas son iguales, a excepción de Nano.',
      'No sé',
    ],
    correct: 'No, la tasa de interés varía en función al perfil del solicitante.',
    module: 'banca_conversacional',
    tags: ['all'],
  },
  {
    text: '¿Cómo sabemos si un pago fue aplicado?',
    options: [
      'Recibirá un mensaje de confirmación del chat de Aviva Pagos y podrá ver el estatus en el App de Aviva Crédito.',
      'No es posible saberlo hasta validar con el equipo de Servicing.',
      'Recibirá un mensaje de confirmación al instante en que paga.',
      'No sé',
    ],
    correct: 'Recibirá un mensaje de confirmación del chat de Aviva Pagos y podrá ver el estatus en el App de Aviva Crédito.',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuál es la red para realizar pagos en efectivo?',
    options: ['Paynet', 'OpenPay', 'Aviva', 'No sé'],
    correct: 'Paynet',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuántos días de haber hecho la solicitud puedo volver a intentarlo?',
    options: ['90 días', '1 semana', '15 días', 'No sé'],
    correct: '90 días',
    module: 'solicitud_credito',
    tags: ['all'],
  },
  {
    text: '¿Podemos ajustar el monto y plazo después de la firma del contrato?',
    options: [
      'No se puede.',
      'Sí, sin embargo tendrá que firmar un contrato nuevo y sin haber desembolsado.',
      'Sí, solamente el cliente tiene que devolver el dinero que no utilice.',
      'No sé',
    ],
    correct: 'Sí, sin embargo tendrá que firmar un contrato nuevo y sin haber desembolsado.',
    module: 'solicitud_credito',
    tags: ['aviva_contigo', 'aviva_tu_negocio'],
  },
  {
    text: '¿Qué categorías de artículos financiamos en Aviva tu Compra?',
    options: [
      'Línea blanca, electrónica, electrodomésticos, casa y jardín.',
      'Línea blanca, electrónica, electrodomésticos, casa y jardín, juguetería y artículos de Xbox.',
      'Línea blanca, electrónica, electrodomésticos, casa y jardín, perecederos y farmacia.',
      'No sé',
    ],
    correct: 'Línea blanca, electrónica, electrodomésticos, casa y jardín.',
    module: 'politicas_procesos',
    tags: ['aviva_tu_compra'],
  },
  {
    text: '¿Cuáles de estos artículos sí financiamos?',
    options: [
      'Refrigeradores, lavadoras, secadoras, estufas, lavavajillas, hornos, licuadoras, aspiradoras, cafeteras, planchas, microondas, televisores, computadoras, tablets y teléfonos.',
      'Farmacia, maquillaje, televisiones, celulares, motos y computadoras.',
      'Carne, despensa, ropa, sartenes, refrigeradores, lavadoras, secadoras, estufas, lavavajillas y hornos.',
      'No sé',
    ],
    correct: 'Refrigeradores, lavadoras, secadoras, estufas, lavavajillas, hornos, licuadoras, aspiradoras, cafeteras, planchas, microondas, televisores, computadoras, tablets y teléfonos.',
    module: 'politicas_procesos',
    tags: ['aviva_tu_compra'],
  },
  {
    text: '¿Cuál es el número de Aviva Pagos?',
    options: ['5511411412', 'Está en la sección de contacto.', 'Viene en su sitio web.', 'No sé'],
    correct: '5511411412',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuál es el número de Aviva Crédito Productivo?',
    options: ['5644083183', 'Está en la sección de contacto.', 'Viene en su sitio web.', 'No sé'],
    correct: '5644083183',
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Qué pasa cuando el cliente tiene un límite de depósito y no pudo recibir su desembolso?',
    options: [
      'Se cancela la solicitud hasta que el cliente tenga una cuenta nueva.',
      'Se notifica al cliente para que pueda revisar el estatus de su cuenta o brindarnos una cuenta nueva.',
      'Se le da el dinero en efectivo.',
      'No sé',
    ],
    correct: 'Se notifica al cliente para que pueda revisar el estatus de su cuenta o brindarnos una cuenta nueva.',
    module: 'politicas_procesos',
    tags: ['aviva_contigo', 'aviva_tu_negocio'],
  },
  {
    text: '¿Qué hago si la llamada se cortó antes de la firma del contrato en Cashi / Aviva tu Negocio?',
    options: [
      'Solicitamos con la videoagente el contrato para que el cliente solamente firme.',
      'Volvemos a reenlazar y se hace la entrevista de nuevo.',
      'Se cancela el crédito por inconsistencias.',
      'No sé',
    ],
    correct: 'Solicitamos con la videoagente el contrato para que el cliente solamente firme.',
    module: 'politicas_procesos',
    tags: ['aviva_tu_compra', 'aviva_tu_negocio'],
  },
];

export async function POST() {
  try {
    // Fetch existing questions to avoid duplicates (no productId filter = all questions)
    const existing = await getQuestions(undefined, false);
    const existingTexts = new Set(existing.map(q => q.text.trim()));

    const results: { text: string; status: 'created' | 'skipped' }[] = [];

    for (const q of SEED_QUESTIONS) {
      if (existingTexts.has(q.text.trim())) {
        results.push({ text: q.text, status: 'skipped' });
        continue;
      }

      await createQuestion(
        {
          organizationId: 'aviva-credito',
          productId: 'pulse',
          text: q.text,
          options: makeOptions(q.options, q.correct),
          type: 'single_choice',
          module: q.module,
          tags: q.tags,
          active: true,
          isTricky: false,
        },
        'system'
      );

      results.push({ text: q.text, status: 'created' });
    }

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({ message: `${created} preguntas creadas, ${skipped} omitidas (ya existían)`, results });
  } catch (err: unknown) {
    console.error('[seed-questions] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
