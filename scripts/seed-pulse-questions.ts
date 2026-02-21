/**
 * Script para importar preguntas del Pulso de Conocimiento a Firestore.
 *
 * Para ejecutar:
 *   npx tsx scripts/seed-pulse-questions.ts
 *
 * Requiere las variables de entorno NEXT_PUBLIC_FIREBASE_* definidas en .env.local
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

const ORG_ID = 'aviva-credito';
const CREATED_BY = 'seed-script';

// ── Helpers ─────────────────────────────────────────────────────────────────

type KnowledgeModule =
  | 'banca_conversacional'
  | 'pagos_renovacion'
  | 'solicitud_credito'
  | 'herramientas'
  | 'politicas_procesos'
  | 'incentivos';

interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

interface QuestionSeed {
  text: string;
  options: { text: string; isCorrect: boolean }[];
  module: KnowledgeModule;
  tags: string[];
}

function buildOptions(opts: { text: string; isCorrect: boolean }[]): QuestionOption[] {
  return opts.map((o, i) => ({
    id: `opt_${i}`,
    text: o.text,
    isCorrect: o.isCorrect,
    order: i,
  }));
}

// ── Preguntas ────────────────────────────────────────────────────────────────

const questions: QuestionSeed[] = [
  // ── Solicitud de Crédito ──────────────────────────────────────────────────
  {
    text: '¿Qué significa AOS?',
    options: [
      { text: 'Aviva On System', isCorrect: false },
      { text: 'Aviva Onboarding System', isCorrect: true },
      { text: 'App Online Store', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'solicitud_credito',
    tags: ['all'],
  },
  {
    text: 'Además del INE, ¿se puede utilizar otra identificación oficial?',
    options: [
      { text: 'No, únicamente con la INE vigente.', isCorrect: true },
      { text: 'Sí, también se acepta pasaporte, pero tiene que ser Mexicano.', isCorrect: false },
      { text: 'Sí, también se acepta pasaporte Mexicano y de E.U.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'solicitud_credito',
    tags: ['all'],
  },
  {
    text: '¿Al cliente se le notifica de forma automática cuando recibe su desembolso?',
    options: [
      { text: 'Hay notificaciones, pero solo si el desembolso tardó en salir.', isCorrect: false },
      { text: 'Sí, por llamada telefónica.', isCorrect: false },
      { text: 'Sí, por WhatsApp y en el App de Aviva.', isCorrect: true },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'solicitud_credito',
    tags: ['aviva_contigo', 'aviva_tu_negocio'],
  },
  {
    text: '¿Cuántos días de haber hecho la solicitud puedo volver a intentarlo?',
    options: [
      { text: '90 días', isCorrect: true },
      { text: '1 semana', isCorrect: false },
      { text: '15 días', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'solicitud_credito',
    tags: ['all'],
  },
  {
    text: '¿Podemos ajustar el monto y plazo después de la firma del contrato?',
    options: [
      { text: 'No se puede.', isCorrect: false },
      { text: 'Sí, sin embargo tendrá que firmar un contrato nuevo y sin haber desembolsado.', isCorrect: true },
      { text: 'Sí, solamente el cliente tiene que devolver el dinero que no utilice.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'solicitud_credito',
    tags: ['aviva_contigo', 'aviva_tu_negocio'],
  },
  {
    text: '¿Qué pasa cuando el cliente tiene un límite de depósito y no pudo recibir su desembolso?',
    options: [
      { text: 'Se cancela la solicitud hasta que el cliente tenga una cuenta nueva.', isCorrect: false },
      { text: 'Se notifica al cliente para que pueda revisar el estatus de su cuenta o brindarnos una cuenta nueva.', isCorrect: true },
      { text: 'Se le da el dinero en efectivo.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'solicitud_credito',
    tags: ['aviva_contigo', 'aviva_tu_negocio'],
  },

  // ── Pagos, Renovación & App ───────────────────────────────────────────────
  {
    text: '¿Con código de barras de Paynet puedo pagar en Oxxo?',
    options: [
      { text: 'Solo en casos excepcionales.', isCorrect: false },
      { text: 'Solo para clientes de Aviva Contigo.', isCorrect: false },
      { text: 'No se puede.', isCorrect: true },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Hay un horario límite para realizar el pago durante el día de pago?',
    options: [
      { text: 'Tiene que pagar antes de las 6 pm para que el sistema lo registre.', isCorrect: false },
      { text: 'Lo puede pagar durante todo el día, hasta medianoche.', isCorrect: true },
      { text: 'Por transferencia el límite es 8 pm; con Paynet se puede pagar hasta las 10 pm.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Un cliente de Aviva tu Compra debe pagar el monto total desembolsado o solo el monto de la compra?',
    options: [
      { text: 'Siempre el total del monto desembolsado en Cashi.', isCorrect: true },
      { text: 'Solo la parte que realmente se gastó durante su compra.', isCorrect: false },
      { text: 'Eso depende del acuerdo que hace con los vendedores de Bodega Aurrera.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuál es el cargo por mora en caso de atrasarse en Aviva Contigo?',
    options: [
      { text: '$50.00 MXN por pago vencido.', isCorrect: true },
      { text: '$30.00 MXN por pago vencido.', isCorrect: false },
      { text: '$50.00 MXN por día.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['aviva_contigo'],
  },
  {
    text: '¿Cuál es el cargo por mora en caso de atrasarse en Aviva tu Negocio?',
    options: [
      { text: '$60.00 MXN por pago vencido.', isCorrect: true },
      { text: '$30.00 MXN por pago vencido.', isCorrect: false },
      { text: '$60.00 MXN por día.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['aviva_tu_negocio'],
  },
  {
    text: '¿Cuál es el cargo por mora en caso de atrasarse en Aviva tu Compra?',
    options: [
      { text: '$50.00 MXN por pago vencido.', isCorrect: true },
      { text: '$30.00 MXN por pago vencido.', isCorrect: false },
      { text: '$50.00 MXN por día.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['aviva_tu_compra'],
  },
  {
    text: '¿Cuál es el cargo por mora en caso de atrasarse en Aviva tu Casa?',
    options: [
      { text: '$50.00 MXN por pago vencido.', isCorrect: true },
      { text: '$30.00 MXN por pago vencido.', isCorrect: false },
      { text: '$50.00 MXN por día.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['aviva_tu_casa'],
  },
  {
    text: '¿A dónde se pueden solicitar las cartas finiquito?',
    options: [
      { text: 'Se puede solicitar al correo: ayuda@avivacredito.com', isCorrect: true },
      { text: 'Al chat de Aviva Crédito Producto.', isCorrect: false },
      { text: 'Al chat de Aviva Pagos.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Puedo solicitar el cambio de día de pago semanal?',
    options: [
      { text: 'Sí, se puede, pero debe presentar una razón válida. El cambio se realiza hasta la siguiente semana después de la solicitud.', isCorrect: true },
      { text: 'No es posible, dado que se eligió desde la videollamada.', isCorrect: false },
      { text: 'Sí, se realiza a través de la App de Aviva.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Un cliente puede actualizar su número de teléfono?',
    options: [
      { text: 'Sí, lo debe de solicitar desde la App de Aviva.', isCorrect: false },
      { text: 'Lo debemos solicitar desde el canal de #collections, escribiendo nombre completo, CURP y el nuevo número.', isCorrect: true },
      { text: 'Se debe solicitar en el canal de videoagentes escribiendo nombre completo, CURP y el nuevo número.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cómo sabemos si un pago fue aplicado?',
    options: [
      { text: 'Recibirá un mensaje de confirmación del chat de Aviva Pagos y podrá ver el estatus en el App de Aviva Crédito.', isCorrect: true },
      { text: 'No es posible saberlo hasta validar con el equipo de Servicing.', isCorrect: false },
      { text: 'Recibirá un mensaje de confirmación al instante en que paga.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuál es la red para realizar pagos en efectivo?',
    options: [
      { text: 'Paynet', isCorrect: true },
      { text: 'OpenPay', isCorrect: false },
      { text: 'Aviva', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuál es el número de Aviva Pagos?',
    options: [
      { text: '5511411412', isCorrect: true },
      { text: 'Está en la sección de contacto.', isCorrect: false },
      { text: 'Viene en su sitio web.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },
  {
    text: '¿Cuál es el número de Aviva Crédito Productivo?',
    options: [
      { text: '5644083183', isCorrect: true },
      { text: 'Está en la sección de contacto.', isCorrect: false },
      { text: 'Viene en su sitio web.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'pagos_renovacion',
    tags: ['all'],
  },

  // ── Oferta & Banca Conversacional ─────────────────────────────────────────
  {
    text: '¿Todos los créditos de Aviva son individuales?',
    options: [
      { text: 'Depende del tipo de cliente.', isCorrect: false },
      { text: 'Manejamos algunos créditos grupales.', isCorrect: false },
      { text: 'Todos son individuales.', isCorrect: true },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'banca_conversacional',
    tags: ['all'],
  },
  {
    text: '¿Todos los pagos son semanales? ¿Hay pagos quincenales?',
    options: [
      { text: 'Solo en Aviva tu Negocio hay pagos quincenales, conforme la evaluación del cliente.', isCorrect: true },
      { text: 'Aviva solo maneja pagos semanales y mensuales.', isCorrect: false },
      { text: 'El cliente escoge si quiere pagar semanal, quincenal o mensual.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'banca_conversacional',
    tags: ['all'],
  },
  {
    text: '¿Cuáles de los artículos que vende la tienda NO financiamos?',
    options: [
      { text: 'Alimentos, Medicamentos, Productos de belleza, Pago de servicios, Ropa, Juguetería, Videojuegos, Aceites para autos.', isCorrect: true },
      { text: 'No financiamos alimentos; todo el resto sí.', isCorrect: false },
      { text: 'Financiamos todos los productos de la tienda.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'banca_conversacional',
    tags: ['aviva_tu_compra'],
  },
  {
    text: '¿Aviva es una financiera regulada?',
    options: [
      { text: 'Sí, Aviva es una SOFOM regulada ante la CONDUSEF.', isCorrect: true },
      { text: 'No está regulada, pero sí es formal.', isCorrect: false },
      { text: 'Está en proceso de obtener su licencia.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'banca_conversacional',
    tags: ['all'],
  },
  {
    text: '¿Todos los créditos manejan la misma tasa de interés?',
    options: [
      { text: 'No, la tasa de interés varía en función al perfil del solicitante.', isCorrect: true },
      { text: 'Sí, es la misma tasa de interés para todos.', isCorrect: false },
      { text: 'Todas son iguales, a excepción de Nano.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'banca_conversacional',
    tags: ['all'],
  },

  // ── Políticas & Procesos ──────────────────────────────────────────────────
  {
    text: '¿Qué categorías de artículos financiamos en Aviva tu Compra?',
    options: [
      { text: 'Línea blanca, electrónica, electrodomésticos, casa y jardín.', isCorrect: true },
      { text: 'Línea blanca, electrónica, electrodomésticos, casa y jardín, juguetería y artículos de Xbox.', isCorrect: false },
      { text: 'Línea blanca, electrónica, electrodomésticos, casa y jardín, perecederos y farmacia.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'politicas_procesos',
    tags: ['aviva_tu_compra'],
  },
  {
    text: '¿Cuáles de estos artículos sí financiamos?',
    options: [
      { text: 'Refrigeradores, lavadoras, secadoras, estufas, lavavajillas, hornos, licuadoras, aspiradoras, cafeteras, planchas, microondas, televisores, computadoras, tablets y teléfonos.', isCorrect: true },
      { text: 'Farmacia, maquillaje, televisiones, celulares, motos y computadoras.', isCorrect: false },
      { text: 'Carne, despensa, ropa, sartenes, refrigeradores, lavadoras, secadoras, estufas, lavavajillas y hornos.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'politicas_procesos',
    tags: ['aviva_tu_compra'],
  },
  {
    text: '¿Qué hago si la llamada se cortó antes de la firma del contrato en Cashi / Aviva tu Negocio?',
    options: [
      { text: 'Solicitamos con la videoagente el contrato para que el cliente solamente firme.', isCorrect: true },
      { text: 'Volvemos a reenlazar y se hace la entrevista de nuevo.', isCorrect: false },
      { text: 'Se cancela el crédito por inconsistencias.', isCorrect: false },
      { text: 'No sé', isCorrect: false },
    ],
    module: 'politicas_procesos',
    tags: ['aviva_tu_compra', 'aviva_tu_negocio'],
  },
];

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Iniciando importación de ${questions.length} preguntas...`);

  // Firestore writeBatch soporta hasta 500 operaciones por batch
  const BATCH_SIZE = 400;
  let saved = 0;

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const chunk = questions.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const q of chunk) {
      const ref = doc(collection(db, 'questions'));
      batch.set(ref, {
        organizationId: ORG_ID,
        productId: 'pulse',
        text: q.text,
        options: buildOptions(q.options),
        type: 'single_choice',
        module: q.module,
        tags: q.tags,
        category: '',
        active: true,
        isTricky: false,
        timesUsed: 0,
        averageCorrectRate: 0,
        createdBy: CREATED_BY,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    saved += chunk.length;
    console.log(`  ✓ ${saved}/${questions.length} preguntas guardadas`);
  }

  console.log('\n¡Importación completada!');
  console.log(`Total preguntas importadas: ${saved}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Error durante la importación:', err);
  process.exit(1);
});
