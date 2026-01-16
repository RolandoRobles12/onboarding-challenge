/**
 * Script de Migración de Datos a Firestore
 *
 * Este script migra los datos existentes de BA y ATN al nuevo formato escalable en Firestore:
 * 1. Crea los productos (BA y ATN)
 * 2. Convierte y crea las preguntas en el nuevo formato
 * 3. Crea los quizzes con sus misiones
 *
 * Para ejecutar: npx tsx scripts/migrate-to-firestore.ts
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Configuración de Firebase (usar las mismas variables de entorno)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Inicializar Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

const ORG_ID = 'aviva-credito';
const USER_ID = 'migration-script'; // ID ficticio para el script

// Datos de productos
const products = [
  {
    id: 'ba-product',
    name: 'Aviva Tu Compra',
    shortName: 'BA',
    description: 'Crédito para compra de productos en tiendas asociadas. Incluye Línea Blanca, Electrónica, Electrodomésticos, Muebles y Motocicletas.',
    icon: 'shopping-cart',
    color: '#23cd7d',
    targetAudience: 'Promotores BA',
    tags: ['crédito', 'compra', 'tienda', 'productos'],
    active: true,
    order: 0,
  },
  {
    id: 'atn-product',
    name: 'Aviva Tu Negocio / Contigo',
    shortName: 'ATN',
    description: 'Crédito productivo para negocios y emprendedores. Incluye Aviva Tu Negocio y Aviva Contigo.',
    icon: 'briefcase',
    color: '#074750',
    targetAudience: 'Promotores ATN',
    tags: ['crédito', 'negocio', 'emprendimiento', 'productivo'],
    active: true,
    order: 1,
  },
];

// Datos originales de preguntas BA
const ba_questions_data = [
  { question: '¿Qué significa AOS?', options: ['Aviva On System', 'Aviva Onboarding System'], correct: 'Aviva On System' },
  { question: '¿Cuáles son las principales plataformas utilizadas en Aviva?', options: ['Slack, Hubspot, Confluence y Worky', 'Slack, Word, Canva y Hubspot', 'Facebook, WhatsApp, Canva y Slack', 'Word, Canva, Slack y Hubspot'], correct: 'Slack, Hubspot, Confluence y Worky' },
  { question: 'Plataforma de comunicación oficial de Aviva', options: ['Slack', 'Hubspot', 'Confluence', 'Worky'], correct: 'Slack' },
  { question: 'Sistema de Gestión y Administración de flujos de trabajo comercial; así como la revisión de métricas.', options: ['Slack', 'Hubspot', 'Confluence', 'Worky'], correct: 'Hubspot' },
  { question: 'Software de Recursos Humanos y Nómina, así como para la solicitud de días aviva, reembolsos y vacaciones.', options: ['Slack', 'Hubspot', 'Confluence', 'Worky'], correct: 'Worky' },
  { question: 'Espacio de trabajo para la administración y control de proyectos; así como para la visualización de contenido.', options: ['Slack', 'Hubspot', 'Confluence', 'Worky'], correct: 'Confluence' },
  { question: '¿Cuál es la contraseña para iniciar sesión en AOS? (usuario kiosco@avivacredito.com)', options: ['Aviva', 'Aviva2022', 'Avivate'], correct: 'Aviva2022' },
  { question: '¿Qué requisitos se requiere para solicitar un crédito?', options: ['INE original, WhatsApp y la App de Cashi', 'INE y comprobante de domicilio', 'Comprobante de domicilio y aval', 'INE y aval'], correct: 'INE original, WhatsApp y la App de Cashi' },
  { question: '¿En qué momento se debe descargar la App de Cashi?', options: ['Antes de realizar la solicitud', 'Una vez que sea aprobado'], correct: 'Antes de realizar la solicitud' },
  { question: '¿La App de Cashi puede ser de otra persona?', options: ['No, todos los datos deben ser del cliente', 'Sí, puede ser de cualquier familiar cercano'], correct: 'No, todos los datos deben ser del cliente' },
  // ... (resto de preguntas BA - abreviado por espacio, en producción incluir todas)
];

// Helper para convertir preguntas al nuevo formato
function convertQuestion(q: any, productId: string, category: string): any {
  // Determinar si es multiple choice analizando la respuesta correcta
  const correctAnswers = q.correct.includes(',')
    ? q.correct.split(',').map((a: string) => a.trim())
    : [q.correct];

  const isMultiple = correctAnswers.length > 1;

  const options = q.options.map((opt: string, index: number) => ({
    id: `opt-${index}`,
    text: opt,
    isCorrect: correctAnswers.includes(opt),
    order: index,
  }));

  return {
    organizationId: ORG_ID,
    productId: productId,
    text: q.question,
    type: isMultiple ? 'multiple_choice' : 'single_choice',
    difficulty: 'medium',
    options: options,
    tags: [category.toLowerCase().replace(/ /g, '-')],
    category: category,
    isTricky: false,
    active: true,
    timesUsed: 0,
    averageCorrectRate: 0,
    createdBy: USER_ID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

// Definir categorías y cuántas preguntas incluir de cada una
const BA_CATEGORIES = [
  { name: 'Plataformas Aviva', start: 0, count: 7 },
  { name: 'Requisitos y Solicitud', start: 7, count: 10 },
  { name: 'Productos y Categorías', start: 17, count: 4 },
  { name: 'Proceso y Documentación', start: 21, count: 8 },
  { name: 'Pagos y Cobros', start: 29, count: 14 },
];

async function migrateProducts() {
  console.log('🔄 Migrando productos...');

  for (const product of products) {
    const docRef = doc(db, 'products', product.id);
    await setDoc(docRef, {
      ...product,
      organizationId: ORG_ID,
      createdBy: USER_ID,
      createdAt: serverTimestamp(),
      updatedAt: Timestamp.now(),
    });
    console.log(`✅ Producto creado: ${product.name} (${product.id})`);
  }
}

async function migrateQuestions() {
  console.log('\n🔄 Migrando preguntas...');

  const questionIds: { [category: string]: string[] } = {};

  // Migrar preguntas BA
  console.log('\n📚 Migrando preguntas de BA...');
  for (const category of BA_CATEGORIES) {
    questionIds[category.name] = [];

    const categoryQuestions = ba_questions_data.slice(
      category.start,
      category.start + category.count
    );

    for (const q of categoryQuestions) {
      const questionData = convertQuestion(q, 'ba-product', category.name);
      const docRef = doc(collection(db, 'questions'));
      await setDoc(docRef, questionData);
      questionIds[category.name].push(docRef.id);
      console.log(`  ✓ Pregunta creada: ${q.question.substring(0, 50)}...`);
    }
  }

  console.log(`\n✅ Total de preguntas BA migradas: ${Object.values(questionIds).flat().length}`);

  return questionIds;
}

async function migrateQuizzes(questionIds: { [category: string]: string[] }) {
  console.log('\n🔄 Migrando quizzes...');

  // Quiz BA
  const baQuiz = {
    organizationId: ORG_ID,
    productId: 'ba-product',
    title: 'Certificación Promotores BA',
    description: 'Quiz de certificación para Promotores de Aviva Tu Compra. Demuestra tu conocimiento sobre el producto, requisitos, proceso y pagos.',
    difficulty: 'medium' as const,
    estimatedDuration: 30,
    missions: [
      {
        id: 'mission-1',
        title: 'Misión 1: Fundamentos y Plataformas',
        narrative: 'Bienvenido a tu primera misión. Demuestra que dominas las plataformas de Aviva y los requisitos básicos del producto.',
        order: 0,
        questionIds: [
          ...questionIds['Plataformas Aviva'],
          ...questionIds['Requisitos y Solicitud'].slice(0, 5),
        ],
        maxErrors: 2,
        bonusPoints: 100,
      },
      {
        id: 'mission-2',
        title: 'Misión 2: Proceso y Operación',
        narrative: 'Segunda misión: Es hora de demostrar tu conocimiento sobre el proceso completo, documentación y sistema de pagos.',
        order: 1,
        questionIds: [
          ...questionIds['Requisitos y Solicitud'].slice(5),
          ...questionIds['Productos y Categorías'],
          ...questionIds['Proceso y Documentación'],
          ...questionIds['Pagos y Cobros'],
        ],
        maxErrors: 2,
        bonusPoints: 100,
      },
    ],
    totalQuestions: 0, // Se calculará
    gamificationConfig: {
      enableLives: true,
      maxLives: 2,
      enableBonusLives: true,
      pointsPerCorrectAnswer: 10,
      pointsPerTrickyQuestion: 20,
      penaltyPerError: 5,
      timeBonus: true,
      enableBadges: true,
      badgeIds: [],
    },
    active: true,
    published: true,
    version: 1,
    tags: ['certificación', 'ba', 'promotores'],
    order: 0,
    createdBy: USER_ID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: serverTimestamp(),
  };

  // Calcular total de preguntas
  baQuiz.totalQuestions = baQuiz.missions.reduce(
    (sum, mission) => sum + mission.questionIds.length,
    0
  );

  const baQuizRef = doc(db, 'quizzes', 'ba-quiz');
  await setDoc(baQuizRef, baQuiz);
  console.log(`✅ Quiz creado: ${baQuiz.title} (${baQuiz.totalQuestions} preguntas)`);
}

async function migrateAchievements() {
  console.log('\n🔄 Creando achievements iniciales...');

  const achievements = [
    {
      id: 'first-mission',
      organizationId: ORG_ID,
      name: 'Primera Misión',
      description: 'Completa tu primera misión exitosamente',
      icon: 'flag',
      badgeType: 'first_mission' as const,
      color: '#23cd7d',
      criteria: {
        type: 'quizzes_completed' as const,
        threshold: 1,
      },
      xpReward: 50,
      order: 0,
      active: true,
      createdAt: serverTimestamp(),
    },
    {
      id: 'perfectionist',
      organizationId: ORG_ID,
      name: 'Perfeccionista',
      description: 'Completa un quiz con 100% de aciertos',
      icon: 'award',
      badgeType: 'perfectionist' as const,
      color: '#f59e0b',
      criteria: {
        type: 'score_threshold' as const,
        threshold: 100,
      },
      xpReward: 100,
      order: 1,
      active: true,
      createdAt: serverTimestamp(),
    },
    {
      id: 'speedster',
      organizationId: ORG_ID,
      name: 'Velocista',
      description: 'Completa un quiz en menos de 15 minutos',
      icon: 'zap',
      badgeType: 'speedster' as const,
      color: '#8b5cf6',
      criteria: {
        type: 'time_under' as const,
        threshold: 900, // 15 minutos en segundos
      },
      xpReward: 75,
      order: 2,
      active: true,
      createdAt: serverTimestamp(),
    },
    {
      id: 'no-errors',
      organizationId: ORG_ID,
      name: 'Sin Errores',
      description: 'Completa una misión sin cometer ningún error',
      icon: 'check-circle',
      badgeType: 'no_errors' as const,
      color: '#10b981',
      criteria: {
        type: 'no_errors' as const,
      },
      xpReward: 80,
      order: 3,
      active: true,
      createdAt: serverTimestamp(),
    },
  ];

  for (const achievement of achievements) {
    const docRef = doc(db, 'achievements', achievement.id);
    await setDoc(docRef, achievement);
    console.log(`  ✓ Achievement creado: ${achievement.name}`);
  }

  console.log(`✅ ${achievements.length} achievements creados`);
}

async function createOrganization() {
  console.log('🔄 Creando organización...');

  const org = {
    id: ORG_ID,
    name: 'Aviva Crédito',
    logo: '',
    primaryColor: '#23cd7d',
    accentColor: '#074750',
    domain: 'avivacredito.com',
    settings: {
      allowSelfRegistration: false,
      requireEmailVerification: false,
      enableAIFeedback: true,
      defaultLanguage: 'es',
      maxAttemptsPerQuiz: -1, // Ilimitado
      leaderboardVisibility: 'public' as const,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = doc(db, 'organizations', ORG_ID);
  await setDoc(docRef, org);
  console.log(`✅ Organización creada: ${org.name}`);
}

async function main() {
  console.log('🚀 Iniciando migración de datos a Firestore...\n');
  console.log('⚠️  IMPORTANTE: Este script creará datos en Firestore.');
  console.log('   Asegúrate de tener las credenciales de Firebase configuradas.\n');

  try {
    // 1. Crear organización
    await createOrganization();

    // 2. Migrar productos
    await migrateProducts();

    // 3. Migrar preguntas y obtener IDs
    const questionIds = await migrateQuestions();

    // 4. Migrar quizzes
    await migrateQuizzes(questionIds);

    // 5. Crear achievements
    await migrateAchievements();

    console.log('\n✅ ¡Migración completada exitosamente!');
    console.log('\n📊 Resumen:');
    console.log(`   - Organización: 1`);
    console.log(`   - Productos: ${products.length}`);
    console.log(`   - Preguntas: ${Object.values(questionIds).flat().length}`);
    console.log(`   - Quizzes: 1`);
    console.log(`   - Achievements: 4`);
    console.log('\n🎉 La plataforma está lista para usar!');

  } catch (error) {
    console.error('\n❌ Error durante la migración:', error);
    process.exit(1);
  }
}

// Ejecutar migración
main();
