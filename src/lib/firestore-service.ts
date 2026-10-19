/**
 * Servicio de Firestore - CRUD Operations
 * Funciones para interactuar con todas las colecciones de la base de datos
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  writeBatch,
  increment,
  arrayUnion,
  onSnapshot,
  runTransaction,
  QueryConstraint,
  DocumentData,
  WithFieldValue,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  Product,
  Quiz,
  Question,
  QuestionOption,
  UserProfile,
  Kiosko,
  QuizAttempt,
  QuizQuestionResult,
  LeaderboardEntry,
  Achievement,
  WhitelistEntry,
  QuizAnalytics,
  Organization,
  Journey,
  UserJourneyProgress,
  OnboardingField,
  CertificateSigner,
  CertificateConfig,
  Badge,
  UserBadge,
  JourneyForm,
  FormResponse,
  Video,
  VideoFolder,
  VideoView,
  VideoReaction,
  VideoComment,
  DailyPulse,
  PulseAttempt,
  PulseAnswer,
  PulseBacklogItem,
  PulseCronStatus,
  SlackNotificationConfig,
  PulseConfig,
  KnowledgeModule,
  SEGMENTATION_FIELD_KEYS,
  OrgTokenConfig,
  PulseCategory,
} from './types-scalable';
import { DEFAULT_CERTIFICATE_CONFIG, DEFAULT_PULSE_CATEGORIES } from './types-scalable';
import { withOptionIds } from './question-options';
import { resolveNotificationConfig, type NotificationConfig, type NotificationLogEntry } from './notifications';
import { addDaysStr, buildAutoPool, DEFAULT_PULSE_CONFIG, lastUsedByQuestion, pulseDateStr, RECENT_USE_WINDOW_DAYS } from './pulse-utils';
import type {
  Course,
  CourseEnrollment,
  LessonProgress,
} from './types-lms';
import type {
  SimModule,
  SimAttempt,
} from './types-simulation';

// ============================================================================
// CONSTANTES
// ============================================================================

const COLLECTIONS = {
  // --- Módulo: Desafíos (Challenge Module) ---
  ORGANIZATIONS: 'organizations',
  PRODUCTS: 'products',
  QUIZZES: 'quizzes',
  QUESTIONS: 'questions',
  USERS: 'users',
  ATTEMPTS: 'attempts',
  ATTEMPT_DETAILS: 'attempt_details',
  LEADERBOARDS: 'leaderboards',
  ACHIEVEMENTS: 'achievements',
  WHITELIST: 'whitelist',
  ANALYTICS: 'analytics',
  JOURNEYS: 'journeys',
  JOURNEY_PROGRESS: 'journey_progress',
  ONBOARDING_FIELDS: 'onboarding_fields',
  CERTIFICATE_SIGNERS: 'certificate_signers',
  CERTIFICATE_CONFIG: 'certificate_config',
  BADGES: 'badges',
  USER_BADGES: 'user_badges',
  // --- Módulo: Cursos (Course Module) ---
  COURSES: 'courses',
  ENROLLMENTS: 'enrollments',
  LESSON_PROGRESS: 'lesson_progress',
  // --- Módulo: Rutas de Aprendizaje (Learning Paths Module) ---
  LEARNING_PATHS: 'learning_paths',
  // --- Módulo: Formularios de Ruta ---
  JOURNEY_FORMS: 'journey_forms',
  FORM_RESPONSES: 'form_responses',
  // --- Configuración global ---
  CONFIG: 'config',
  // --- Video Feed ---
  VIDEOS: 'videos',
  VIDEO_FOLDERS: 'video_folders',
  VIDEO_VIEWS: 'video_views',
  VIDEO_REACTIONS: 'video_reactions',
  VIDEO_COMMENTS: 'video_comments',
  // --- Knowledge Pulse ---
  DAILY_PULSES: 'daily_pulses',
  PULSE_ATTEMPTS: 'pulse_attempts',
  PULSE_BACKLOGS: 'pulse_backlogs',
  SLACK_CONFIG: 'slack_config',
  PULSE_CONFIG: 'pulse_config',
  PULSE_CRON_STATUS: 'pulse_cron_status',
  // --- Tokens de Organización ---
  ORG_TOKENS: 'org_tokens',
  // --- Pulse Categories ---
  PULSE_CATEGORIES: 'pulseCategories',
  ROLE_PERMISSIONS: 'role_permissions',
  KIOSCOS: 'kioscos',
  // --- Avisos a embajadores (Slack y push) ---
  NOTIFICATION_CONFIG: 'notification_config',
  NOTIFICATION_LOG: 'notification_log',
  // --- Prototipo: Simulaciones por nodos (hotspots sobre capturas) ---
  SIM_MODULES: 'sim_modules',
  SIM_ATTEMPTS: 'sim_attempts',
} as const;

// Organization ID por defecto (puedes obtenerlo del contexto en producción)
const DEFAULT_ORG_ID = 'aviva-credito';

// ============================================================================
// HELPERS
// ============================================================================

function ensureFirestore() {
  if (!db) {
    throw new Error('Firestore is not initialized. Please check your Firebase configuration.');
  }
  return db;
}

function getCollectionRef(collectionName: string) {
  const firestore = ensureFirestore();
  return collection(firestore, collectionName);
}

function getDocRef(collectionName: string, docId: string) {
  const firestore = ensureFirestore();
  return doc(firestore, collectionName, docId);
}

/**
 * Elimina recursivamente los valores `undefined` de un objeto antes de enviarlo
 * a Firestore. Firestore rechaza documentos que contengan campos con valor undefined.
 * Solo procesa objetos planos y arrays; respeta instancias de clases (Timestamp, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUndefined<T>(data: T): T {
  if (Array.isArray(data)) {
    return data.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (
    data !== null &&
    typeof data === 'object' &&
    Object.getPrototypeOf(data) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    ) as T;
  }
  return data;
}

/** Firestore limita cada batch a 500 escrituras. */
const BATCH_LIMIT = 450;

/** Opción tal como la arma el panel: el id se asigna al guardar si falta. */
type QuestionOptionInput = Omit<QuestionOption, 'id'> & { id?: string };

/** Datos para crear una pregunta (las estadísticas y el autor los pone el servicio). */
export type NewQuestion = Omit<Question, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'timesCorrect' | 'averageCorrectRate' | 'createdBy' | 'options'> & {
  options: QuestionOptionInput[];
};

/** Pregunta leída de Firestore, con ids en todas sus opciones (ver withOptionIds). */
function toQuestion(id: string, data: DocumentData): Question {
  return { id, ...data, options: withOptionIds(data.options) } as Question;
}

// ============================================================================
// ORGANIZACIONES
// ============================================================================

// ============================================================================
// PRODUCTOS
// ============================================================================

export async function getProducts(orgId: string = DEFAULT_ORG_ID): Promise<Product[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.PRODUCTS),
      where('organizationId', '==', orgId),
      where('active', '==', true),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  } catch (error) {
    console.error('Error getting products:', error);
    throw error;
  }
}

export async function getProduct(productId: string): Promise<Product | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.PRODUCTS, productId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Product : null;
  } catch (error) {
    console.error('Error getting product:', error);
    throw error;
  }
}

export async function createProduct(
  product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.PRODUCTS));
    await setDoc(docRef, {
      ...stripUndefined(product),
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
}

export async function updateProduct(productId: string, updates: Partial<Product>): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.PRODUCTS, productId);
    await updateDoc(docRef, {
      ...stripUndefined(updates),
      updatedAt: serverTimestamp(),
    } as DocumentData);
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  try {
    // Soft delete - marcar como inactivo
    await updateProduct(productId, { active: false });
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
}

// ============================================================================
// QUIZZES
// ============================================================================

export async function getQuizzes(
  productId?: string,
  activeOnly: boolean = true,
  orgId: string = DEFAULT_ORG_ID
): Promise<Quiz[]> {
  try {
    const constraints: QueryConstraint[] = [
      where('organizationId', '==', orgId),
      orderBy('order', 'asc')
    ];

    if (productId) {
      constraints.push(where('productId', '==', productId));
    }

    if (activeOnly) {
      constraints.push(where('active', '==', true));
      constraints.push(where('published', '==', true));
    }

    const q = query(getCollectionRef(COLLECTIONS.QUIZZES), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz));
  } catch (error) {
    console.error('Error getting quizzes:', error);
    throw error;
  }
}

export async function getQuiz(quizId: string): Promise<Quiz | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.QUIZZES, quizId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Quiz : null;
  } catch (error) {
    console.error('Error getting quiz:', error);
    throw error;
  }
}

export async function createQuiz(
  quiz: Omit<Quiz, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt'>,
  userId: string
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.QUIZZES));
    await setDoc(docRef, {
      ...stripUndefined(quiz),
      version: 1,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating quiz:', error);
    throw error;
  }
}

export async function updateQuiz(quizId: string, updates: Partial<Quiz>): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.QUIZZES, quizId);
    await updateDoc(docRef, {
      ...stripUndefined(updates),
      version: increment(1),
      updatedAt: serverTimestamp(),
    } as DocumentData);
  } catch (error) {
    console.error('Error updating quiz:', error);
    throw error;
  }
}

export async function publishQuiz(quizId: string): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.QUIZZES, quizId);
    await updateDoc(docRef, {
      published: true,
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error publishing quiz:', error);
    throw error;
  }
}

export async function unpublishQuiz(quizId: string): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.QUIZZES, quizId);
    await updateDoc(docRef, {
      published: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error unpublishing quiz:', error);
    throw error;
  }
}

export async function deleteQuiz(quizId: string): Promise<void> {
  try {
    await updateQuiz(quizId, { active: false });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    throw error;
  }
}

// ============================================================================
// PREGUNTAS
// ============================================================================

export async function getQuestions(
  productId?: string,
  activeOnly: boolean = true,
  orgId: string = DEFAULT_ORG_ID
): Promise<Question[]> {
  try {
    const constraints: QueryConstraint[] = [where('organizationId', '==', orgId)];

    if (productId) {
      constraints.push(where('productId', '==', productId));
    }

    if (activeOnly) {
      constraints.push(where('active', '==', true));
    }

    const q = query(getCollectionRef(COLLECTIONS.QUESTIONS), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => toQuestion(doc.id, doc.data()));
  } catch (error) {
    console.error('Error getting questions:', error);
    throw error;
  }
}

export async function getQuestion(questionId: string): Promise<Question | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.QUESTIONS, questionId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? toQuestion(docSnap.id, docSnap.data()) : null;
  } catch (error) {
    console.error('Error getting question:', error);
    throw error;
  }
}

export async function createQuestion(
  question: NewQuestion,
  userId: string
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.QUESTIONS));
    await setDoc(docRef, {
      ...stripUndefined(question),
      options: withOptionIds(stripUndefined(question.options)),
      timesUsed: 0,
      timesCorrect: 0,
      averageCorrectRate: 0,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating question:', error);
    throw error;
  }
}

export async function updateQuestion(
  questionId: string,
  updates: Partial<Omit<Question, 'options'>> & { options?: QuestionOptionInput[] }
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.QUESTIONS, questionId);
    await updateDoc(docRef, {
      ...stripUndefined(updates),
      ...(updates.options ? { options: withOptionIds(stripUndefined(updates.options)) } : {}),
      updatedAt: serverTimestamp(),
    } as DocumentData);
  } catch (error) {
    console.error('Error updating question:', error);
    throw error;
  }
}

export async function deleteQuestion(questionId: string): Promise<void> {
  try {
    await updateQuestion(questionId, { active: false });
  } catch (error) {
    console.error('Error deleting question:', error);
    throw error;
  }
}

// ============================================================================
// USUARIOS
// ============================================================================

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.USERS, userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { uid: docSnap.id, ...docSnap.data() } as UserProfile : null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
}

export async function updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.USERS, userId);
    await updateDoc(docRef, {
      ...stripUndefined(updates),
      updatedAt: serverTimestamp(),
    } as DocumentData);
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

// ============================================================================
// QUIZ ATTEMPTS
// ============================================================================

export async function getQuizAttempt(attemptId: string): Promise<QuizAttempt | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.ATTEMPTS, attemptId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as QuizAttempt : null;
  } catch (error) {
    console.error('Error getting quiz attempt:', error);
    throw error;
  }
}

/** Detalle por pregunta de un intento (solo lo leen el embajador y el staff). */
export async function getAttemptDetails(attemptId: string): Promise<{ questionResults: QuizQuestionResult[]; showFeedback?: string } | null> {
  const snap = await getDoc(getDocRef(COLLECTIONS.ATTEMPT_DETAILS, attemptId));
  return snap.exists() ? (snap.data() as { questionResults: QuizQuestionResult[]; showFeedback?: string }) : null;
}

/**
 * Intentos completados de un usuario (más recientes primero). Filtra por un
 * solo campo y ordena en memoria para no depender de un índice compuesto: el
 * límite de intentos de un quiz se calcula con esta consulta.
 */
export async function getUserAttempts(userId: string, quizId?: string): Promise<QuizAttempt[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.ATTEMPTS), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as QuizAttempt))
      .filter(a => a.status === 'completed' && (!quizId || a.quizId === quizId))
      .sort((a, b) => (b.completedAt?.toMillis?.() ?? 0) - (a.completedAt?.toMillis?.() ?? 0));
  } catch (error) {
    console.error('Error getting user attempts:', error);
    throw error;
  }
}

/** Returns top-10 leaderboard entries from Firestore attempts for a product (optionally filtered by quizId). */
export async function getQuizLeaderboard(
  productId: string,
  quizId?: string
): Promise<QuizAttempt[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.ATTEMPTS),
      where('productId', '==', productId)
    );
    const snapshot = await getDocs(q);
    let docs = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as QuizAttempt & { practice?: boolean }))
      // Lo jugado en Práctica no entra al ranking.
      .filter(d => d.status === 'completed' && !d.practice);
    if (quizId) docs = docs.filter(d => d.quizId === quizId);

    // Keep only the best attempt per user (highest %, then fastest time)
    const bestByUser = new Map<string, QuizAttempt>();
    for (const attempt of docs) {
      const key = attempt.userId;
      const prev = bestByUser.get(key);
      if (!prev) { bestByUser.set(key, attempt); continue; }
      const better = attempt.percentage > prev.percentage ||
        (attempt.percentage === prev.percentage && attempt.timeTaken < prev.timeTaken);
      if (better) bestByUser.set(key, attempt);
    }

    return Array.from(bestByUser.values())
      .sort((a, b) =>
        b.percentage !== a.percentage ? b.percentage - a.percentage : a.timeTaken - b.timeTaken
      )
      .slice(0, 10);
  } catch (error) {
    console.error('Error getting quiz leaderboard:', error);
    return [];
  }
}

/** Returns all completed QuizAttempts for the org, optionally filtered by productId. */
export async function getAllQuizAttempts(
  productId?: string,
  orgId: string = DEFAULT_ORG_ID
): Promise<QuizAttempt[]> {
  try {
    const constraints: QueryConstraint[] = [
      where('organizationId', '==', orgId),
      where('status', '==', 'completed'),
    ];
    if (productId) constraints.push(where('productId', '==', productId));
    const q = query(getCollectionRef(COLLECTIONS.ATTEMPTS), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizAttempt));
  } catch (error) {
    console.error('Error getting all quiz attempts:', error);
    throw error;
  }
}

// ============================================================================
// LEADERBOARD
// ============================================================================

// ============================================================================
// ACHIEVEMENTS
// ============================================================================

// ============================================================================
// WHITELIST
// ============================================================================

export async function addToWhitelist(
  entry: Omit<WhitelistEntry, 'id' | 'addedAt' | 'used'>
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.WHITELIST));
    await setDoc(docRef, {
      ...entry,
      used: false,
      addedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding to whitelist:', error);
    throw error;
  }
}

// ============================================================================
// USERS - ADMIN QUERIES
// ============================================================================

export async function getAllUsers(orgId: string = DEFAULT_ORG_ID): Promise<UserProfile[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.USERS),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

export async function getWhitelistEntries(orgId: string = DEFAULT_ORG_ID): Promise<WhitelistEntry[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.WHITELIST),
      where('organizationId', '==', orgId),
      orderBy('addedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhitelistEntry));
  } catch (error) {
    console.error('Error getting whitelist entries:', error);
    // Return empty array if index doesn't exist yet
    return [];
  }
}

export async function deleteWhitelistEntry(entryId: string): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.WHITELIST, entryId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting whitelist entry:', error);
    throw error;
  }
}

// ============================================================================
// REAL-TIME LISTENERS
// ============================================================================

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export async function batchCreateQuestions(
  questions: NewQuestion[],
  userId: string
): Promise<string[]> {
  try {
    const firestore = ensureFirestore();
    const ids: string[] = [];

    for (let i = 0; i < questions.length; i += BATCH_LIMIT) {
      const batch = writeBatch(firestore);
      for (const question of questions.slice(i, i + BATCH_LIMIT)) {
        const docRef = doc(getCollectionRef(COLLECTIONS.QUESTIONS));
        batch.set(docRef, {
          ...stripUndefined(question),
          options: withOptionIds(stripUndefined(question.options)),
          timesUsed: 0,
          timesCorrect: 0,
          averageCorrectRate: 0,
          createdBy: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ids.push(docRef.id);
      }
      await batch.commit();
    }
    return ids;
  } catch (error) {
    console.error('Error batch creating questions:', error);
    throw error;
  }
}

// ============================================================================
// JOURNEYS (RUTA DEL VENDEDOR POR PRODUCTO)
// ============================================================================

export async function getJourneyByProduct(productId: string, orgId: string = DEFAULT_ORG_ID): Promise<Journey | null> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.JOURNEYS),
      where('organizationId', '==', orgId),
      where('productId', '==', productId),
      where('active', '==', true),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Journey;
  } catch (error) {
    console.error('Error getting journey:', error);
    return null;
  }
}

export async function getAllJourneys(orgId: string = DEFAULT_ORG_ID): Promise<Journey[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.JOURNEYS),
      where('organizationId', '==', orgId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Journey));
  } catch (error) {
    console.error('Error getting journeys:', error);
    return [];
  }
}

/**
 * Rutas que un vendedor puede explorar libremente para conocer otros productos.
 * Excluye borradores e inactivas. Si `explorable` no está definido, la ruta se
 * considera explorable (comportamiento por defecto para rutas ya existentes).
 *
 * Devuelve **una sola ruta por producto**: en la base hay productos con varias
 * rutas acumuladas y al vendedor sólo le corresponde una. Se conserva la más
 * recientemente actualizada.
 */
export async function getExplorableJourneys(orgId: string = DEFAULT_ORG_ID): Promise<Journey[]> {
  const journeys = await getAllJourneys(orgId);
  const visible = journeys.filter(j => j.active && j.status !== 'draft' && j.explorable !== false);

  const millis = (j: Journey) => {
    const ts = j.updatedAt ?? j.createdAt;
    return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
  };

  const newestByProduct = new Map<string, Journey>();
  for (const journey of visible) {
    const current = newestByProduct.get(journey.productId);
    if (!current || millis(journey) > millis(current)) {
      newestByProduct.set(journey.productId, journey);
    }
  }
  return [...newestByProduct.values()];
}

export async function saveJourney(
  journey: Omit<Journey, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
  userId: string,
  existingId?: string
): Promise<string> {
  try {
    if (existingId) {
      const docRef = getDocRef(COLLECTIONS.JOURNEYS, existingId);
      await updateDoc(docRef, { ...stripUndefined(journey), updatedAt: serverTimestamp() } as DocumentData);
      return existingId;
    }
    const docRef = doc(getCollectionRef(COLLECTIONS.JOURNEYS));
    await setDoc(docRef, {
      ...stripUndefined(journey),
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving journey:', error);
    throw error;
  }
}

export async function deleteJourney(journeyId: string): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.JOURNEYS, journeyId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting journey:', error);
    throw error;
  }
}

// ============================================================================
// PROGRESO DE JOURNEY DEL USUARIO
// ============================================================================

export async function getUserJourneyProgress(
  userId: string,
  journeyId: string
): Promise<UserJourneyProgress | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.JOURNEY_PROGRESS, `${userId}_${journeyId}`);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as UserJourneyProgress;
  } catch (error) {
    console.error('Error getting journey progress:', error);
    return null;
  }
}

export async function getUserAllJourneyProgress(userId: string): Promise<UserJourneyProgress[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.JOURNEY_PROGRESS),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as UserJourneyProgress));
  } catch (error) {
    console.error('Error getting user journey progress:', error);
    return [];
  }
}

export async function resetUserJourneyProgress(userId: string, journeyId: string): Promise<void> {
  try {
    await deleteDoc(getDocRef(COLLECTIONS.JOURNEY_PROGRESS, `${userId}_${journeyId}`));
  } catch (error) {
    console.error('Error resetting journey progress:', error);
    throw error;
  }
}

export async function getJourneyProgressByJourney(journeyId: string): Promise<UserJourneyProgress[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.JOURNEY_PROGRESS),
      where('journeyId', '==', journeyId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as UserJourneyProgress));
  } catch (error) {
    console.error('Error getting journey progress by journey:', error);
    return [];
  }
}

/**
 * Marca un paso de la ruta como completado. Es una transacción con
 * `arrayUnion`: varias marcas en paralelo (p. ej. el paso del quiz y el de
 * resultados al terminar un desafío) no se pisan entre sí.
 */
export async function markJourneyStepComplete(
  userId: string,
  journeyId: string,
  productId: string,
  stepId: string,
  userMeta?: { userName?: string; userEmail?: string }
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.JOURNEY_PROGRESS, `${userId}_${journeyId}`);
    const meta = {
      ...(userMeta?.userName ? { userName: userMeta.userName } : {}),
      ...(userMeta?.userEmail ? { userEmail: userMeta.userEmail } : {}),
    };
    await runTransaction(ensureFirestore(), async tx => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) {
        tx.set(docRef, {
          userId,
          ...meta,
          journeyId,
          productId,
          completedStepIds: [stepId],
          startedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (!((snap.data().completedStepIds as string[] | undefined) ?? []).includes(stepId)) {
        tx.update(docRef, {
          userId,
          ...meta,
          completedStepIds: arrayUnion(stepId),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    console.error('Error marking step complete:', error);
    throw error;
  }
}

/**
 * Emite el certificado de un paso de la ruta: lo marca como completado y
 * guarda la fecha de emisión la primera vez. Devuelve esa fecha, para que el
 * certificado muestre siempre el mismo día aunque se abra después.
 */
export async function issueJourneyCertificate(
  userId: string,
  journeyId: string,
  productId: string,
  stepId: string,
  userMeta?: { userName?: string; userEmail?: string }
): Promise<Date> {
  const docRef = getDocRef(COLLECTIONS.JOURNEY_PROGRESS, `${userId}_${journeyId}`);
  const meta = {
    ...(userMeta?.userName ? { userName: userMeta.userName } : {}),
    ...(userMeta?.userEmail ? { userEmail: userMeta.userEmail } : {}),
  };
  return runTransaction(ensureFirestore(), async tx => {
    const snap = await tx.get(docRef);
    const issued = snap.exists()
      ? (snap.data().certificateIssuedAt as Record<string, Timestamp> | undefined)?.[stepId]
      : undefined;
    if (issued) return issued.toDate();
    const now = Timestamp.now();
    if (!snap.exists()) {
      tx.set(docRef, {
        userId,
        ...meta,
        journeyId,
        productId,
        completedStepIds: [stepId],
        certificateIssuedAt: { [stepId]: now },
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.update(docRef, {
        userId,
        ...meta,
        completedStepIds: arrayUnion(stepId),
        [`certificateIssuedAt.${stepId}`]: now,
        updatedAt: serverTimestamp(),
      });
    }
    return now.toDate();
  });
}

// ============================================================================
// CAMPOS DE INGRESO DINÁMICOS (ONBOARDING POST-LOGIN)
// ============================================================================

export async function getOnboardingFields(orgId: string = DEFAULT_ORG_ID): Promise<OnboardingField[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.ONBOARDING_FIELDS),
      where('organizationId', '==', orgId),
      where('active', '==', true),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OnboardingField));
  } catch (error) {
    console.error('Error getting onboarding fields:', error);
    return [];
  }
}

export async function getAllOnboardingFields(orgId: string = DEFAULT_ORG_ID): Promise<OnboardingField[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.ONBOARDING_FIELDS),
      where('organizationId', '==', orgId),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OnboardingField));
  } catch (error) {
    console.error('Error getting all onboarding fields:', error);
    return [];
  }
}

export async function createOnboardingField(
  field: Omit<OnboardingField, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
  userId: string
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.ONBOARDING_FIELDS));
    await setDoc(docRef, {
      ...stripUndefined(field),
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating onboarding field:', error);
    throw error;
  }
}

export async function updateOnboardingField(fieldId: string, updates: Partial<OnboardingField>): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.ONBOARDING_FIELDS, fieldId);
    await updateDoc(docRef, { ...stripUndefined(updates), updatedAt: serverTimestamp() } as DocumentData);
  } catch (error) {
    console.error('Error updating onboarding field:', error);
    throw error;
  }
}

export async function deleteOnboardingField(fieldId: string): Promise<void> {
  try {
    // Soft delete
    await updateOnboardingField(fieldId, { active: false });
  } catch (error) {
    console.error('Error deleting onboarding field:', error);
    throw error;
  }
}

export async function saveSellerOnboardingData(
  userId: string,
  data: Record<string, string>
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.USERS, userId);

    // Try to extract the real name from whichever field key looks like a name
    const nameKey = Object.keys(data).find(k => /nombre|name|nombres/i.test(k) && data[k].trim().length > 1);
    const updates: DocumentData = {
      onboardingData: data,
      onboardingCompleted: true,
      updatedAt: serverTimestamp(),
    };
    if (nameKey) updates['nombre'] = data[nameKey].trim();

    await updateDoc(docRef, updates);
  } catch (error) {
    console.error('Error saving seller onboarding data:', error);
    throw error;
  }
}


// ============================================================================
// LMS - INSCRIPCIONES (Enrollments)
// ============================================================================

/**
 * Inscribe al usuario en un curso. El id es `<uid>_<courseId>`: abrir el curso
 * dos veces (o en dos pestañas) no crea inscripciones duplicadas. Devuelve la
 * inscripción existente si ya estaba inscrito.
 */
export async function enrollUserInCourse(
  enrollmentData: Omit<CourseEnrollment, 'id' | 'updatedAt'>
): Promise<string> {
  try {
    const docRef = getDocRef(COLLECTIONS.ENROLLMENTS, `${enrollmentData.userId}_${enrollmentData.courseId}`);
    await runTransaction(ensureFirestore(), async tx => {
      const snap = await tx.get(docRef);
      if (snap.exists()) return;
      tx.set(docRef, {
        ...enrollmentData,
        status: 'enrolled',
        completedLessonIds: [],
        completedModuleIds: [],
        updatedAt: serverTimestamp(),
      });
    });
    return docRef.id;
  } catch (error) {
    console.error('Error enrolling user in course:', error);
    throw error;
  }
}

/**
 * Inscripciones del usuario, una por curso. Si hay duplicadas (las creadas
 * antes de usar un id fijo), se queda con la más avanzada.
 */
export async function getUserEnrollments(userId: string): Promise<CourseEnrollment[]> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.ENROLLMENTS);
    const q = query(colRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const rank = (e: CourseEnrollment) =>
      (e.status === 'completed' ? 3 : e.status === 'in_progress' ? 2 : e.status === 'enrolled' ? 1 : 0) * 10_000
      + (e.completedLessonIds?.length ?? 0);
    const byCourse = new Map<string, CourseEnrollment>();
    for (const d of snapshot.docs) {
      const e = { id: d.id, ...d.data() } as CourseEnrollment;
      const prev = byCourse.get(e.courseId);
      if (!prev || rank(e) > rank(prev)) byCourse.set(e.courseId, e);
    }
    return Array.from(byCourse.values())
      .sort((a, b) => (b.enrolledAt?.toMillis?.() ?? 0) - (a.enrolledAt?.toMillis?.() ?? 0));
  } catch (error) {
    console.error('Error fetching user enrollments:', error);
    throw error;
  }
}

export async function updateEnrollmentProgress(
  enrollmentId: string,
  updates: Partial<Pick<CourseEnrollment, 'completedLessonIds' | 'completedModuleIds' | 'status' | 'overallScore' | 'completedAt' | 'lastAccessedAt' | 'certificateIssuedAt'>>
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.ENROLLMENTS, enrollmentId);
    await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() } as DocumentData);
  } catch (error) {
    console.error('Error updating enrollment progress:', error);
    throw error;
  }
}

/** Obtiene todas las inscripciones de un curso específico (vista admin) */
export async function getCourseEnrollments(
  courseId: string,
  orgId: string = DEFAULT_ORG_ID
): Promise<CourseEnrollment[]> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.ENROLLMENTS);
    const q = query(
      colRef,
      where('courseId', '==', courseId),
      where('organizationId', '==', orgId),
      orderBy('enrolledAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CourseEnrollment));
  } catch (error) {
    console.error('Error fetching course enrollments:', error);
    return [];
  }
}

/**
 * Inscribe manualmente un usuario en un curso (desde el panel de admin).
 * Devuelve `created: false` si ya estaba inscrito.
 */
export async function adminEnrollUserInCourse(
  userId: string,
  courseId: string,
  assignedBy: string,
  orgId: string = DEFAULT_ORG_ID
): Promise<{ id: string; created: boolean }> {
  try {
    const existing = await getUserEnrollments(userId);
    const current = existing.find(e => e.courseId === courseId);
    if (current) return { id: current.id, created: false };
    const docRef = getDocRef(COLLECTIONS.ENROLLMENTS, `${userId}_${courseId}`);
    await setDoc(docRef, {
      userId,
      courseId,
      organizationId: orgId,
      status: 'enrolled',
      completedLessonIds: [],
      completedModuleIds: [],
      assignedBy,
      assignedAt: serverTimestamp(),
      enrolledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, created: true };
  } catch (error) {
    console.error('Error enrolling user:', error);
    throw error;
  }
}


// ============================================================================
// LMS - PROGRESO DE LECCIONES (Lesson Progress)
// ============================================================================

export async function upsertLessonProgress(
  progressData: Omit<LessonProgress, 'id' | 'updatedAt'>
): Promise<void> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.LESSON_PROGRESS);
    // Use composite key as document ID for idempotency
    const docId = `${progressData.userId}_${progressData.lessonId}`;
    const docRef = doc(colRef, docId);
    await setDoc(
      docRef,
      { ...progressData, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (error) {
    console.error('Error upserting lesson progress:', error);
    throw error;
  }
}

/** Progreso de una lección (id `<uid>_<lessonId>`). */
export async function getLessonProgress(userId: string, lessonId: string): Promise<LessonProgress | null> {
  const snap = await getDoc(getDocRef(COLLECTIONS.LESSON_PROGRESS, `${userId}_${lessonId}`));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as LessonProgress) : null;
}

export async function getLessonProgressForCourse(
  userId: string,
  courseId: string
): Promise<LessonProgress[]> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.LESSON_PROGRESS);
    const q = query(
      colRef,
      where('userId', '==', userId),
      where('courseId', '==', courseId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as LessonProgress));
  } catch (error) {
    console.error('Error fetching lesson progress:', error);
    throw error;
  }
}

// ============================================================================
// FIRMANTES DE CERTIFICADO
// ============================================================================

export async function getCertificateSigners(orgId: string = DEFAULT_ORG_ID): Promise<CertificateSigner[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.CERTIFICATE_SIGNERS),
      where('organizationId', '==', orgId),
      where('active', '==', true),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CertificateSigner));
  } catch (error) {
    console.error('Error getting certificate signers:', error);
    return [];
  }
}

export async function getAllCertificateSigners(orgId: string = DEFAULT_ORG_ID): Promise<CertificateSigner[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.CERTIFICATE_SIGNERS),
      where('organizationId', '==', orgId),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CertificateSigner));
  } catch (error) {
    console.error('Error getting all certificate signers:', error);
    return [];
  }
}

export async function createCertificateSigner(
  signer: Omit<CertificateSigner, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.CERTIFICATE_SIGNERS));
    await setDoc(docRef, {
      ...signer,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating certificate signer:', error);
    throw error;
  }
}

export async function updateCertificateSigner(signerId: string, updates: Partial<CertificateSigner>): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.CERTIFICATE_SIGNERS, signerId);
    await updateDoc(docRef, { ...stripUndefined(updates), updatedAt: serverTimestamp() } as DocumentData);
  } catch (error) {
    console.error('Error updating certificate signer:', error);
    throw error;
  }
}

export async function deleteCertificateSigner(signerId: string): Promise<void> {
  try {
    await updateCertificateSigner(signerId, { active: false });
  } catch (error) {
    console.error('Error deleting certificate signer:', error);
    throw error;
  }
}

// ============================================================================
// CONFIGURACIÓN DE PLANTILLA DE CERTIFICADO
// ============================================================================

export async function getCertificateConfig(orgId: string = DEFAULT_ORG_ID): Promise<CertificateConfig> {
  try {
    const docRef = getDocRef(COLLECTIONS.CERTIFICATE_CONFIG, orgId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { organizationId: orgId, ...docSnap.data() } as CertificateConfig;
    }
    // Return defaults if not configured yet
    return {
      organizationId: orgId,
      ...DEFAULT_CERTIFICATE_CONFIG,
      updatedAt: Timestamp.now(),
    };
  } catch (error) {
    console.error('Error getting certificate config:', error);
    return {
      organizationId: orgId,
      ...DEFAULT_CERTIFICATE_CONFIG,
      updatedAt: Timestamp.now(),
    };
  }
}

export async function saveCertificateConfig(
  config: Omit<CertificateConfig, 'organizationId' | 'updatedAt'>,
  orgId: string = DEFAULT_ORG_ID
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.CERTIFICATE_CONFIG, orgId);
    await setDoc(docRef, {
      ...config,
      organizationId: orgId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('Error saving certificate config:', error);
    throw error;
  }
}

// ============================================================================
// INSIGNIAS (BADGES)
// ============================================================================

export async function getAllBadges(orgId: string = DEFAULT_ORG_ID): Promise<Badge[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.BADGES),
      where('organizationId', '==', orgId),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Badge);
  } catch (error) {
    console.error('Error getting badges:', error);
    return [];
  }
}

export async function createBadge(
  badge: Omit<Badge, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.BADGES));
    await setDoc(docRef, stripUndefined({
      ...badge,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return docRef.id;
  } catch (error) {
    console.error('Error creating badge:', error);
    throw error;
  }
}

export async function updateBadge(
  badgeId: string,
  updates: Partial<Omit<Badge, 'id' | 'createdAt'>>
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.BADGES, badgeId);
    await updateDoc(docRef, stripUndefined({ ...updates, updatedAt: serverTimestamp() }) as DocumentData);
  } catch (error) {
    console.error('Error updating badge:', error);
    throw error;
  }
}

export async function deleteBadge(badgeId: string): Promise<void> {
  try {
    await updateBadge(badgeId, { active: false });
  } catch (error) {
    console.error('Error deleting badge:', error);
    throw error;
  }
}

/** Otorga una insignia a un usuario (evita duplicados del mismo badge para el mismo user) */
export async function awardBadge(
  userId: string,
  badge: Badge,
  options: { awardedBy: string; reason?: string; journeyStepId?: string }
): Promise<string> {
  try {
    // Check for duplicate
    const existing = query(
      getCollectionRef(COLLECTIONS.USER_BADGES),
      where('userId', '==', userId),
      where('badgeId', '==', badge.id)
    );
    const snap = await getDocs(existing);
    if (!snap.empty) return snap.docs[0].id; // already awarded

    const docRef = doc(getCollectionRef(COLLECTIONS.USER_BADGES));
    await setDoc(docRef, {
      userId,
      badgeId: badge.id,
      badgeName: badge.name,
      badgeEmoji: badge.emoji,
      badgeColor: badge.color,
      badgeDescription: badge.description,
      earnedAt: serverTimestamp(),
      awardedBy: options.awardedBy,
      reason: options.reason ?? null,
      journeyStepId: options.journeyStepId ?? null,
    });
    return docRef.id;
  } catch (error) {
    console.error('Error awarding badge:', error);
    throw error;
  }
}

export async function getUserBadges(userId: string): Promise<UserBadge[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.USER_BADGES),
      where('userId', '==', userId),
      orderBy('earnedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as UserBadge);
  } catch (error) {
    console.error('Error getting user badges:', error);
    return [];
  }
}

/** Revoca una insignia otorgada a un usuario */
export async function revokeBadge(userBadgeId: string): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.USER_BADGES, userBadgeId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error revoking badge:', error);
    throw error;
  }
}

// ============================================================================
// CURSOS (Course Authoring Module)
// ============================================================================

/** Devuelve todos los cursos de una organización */
export async function getCourses(orgId: string = DEFAULT_ORG_ID): Promise<Course[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.COURSES),
      where('organizationId', '==', orgId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Course);
  } catch (error) {
    console.error('Error getting courses:', error);
    return [];
  }
}

/** Devuelve un curso por ID */
export async function getCourse(courseId: string): Promise<Course | null> {
  try {
    const snap = await getDoc(getDocRef(COLLECTIONS.COURSES, courseId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Course;
  } catch (error) {
    console.error('Error getting course:', error);
    return null;
  }
}

/** Crea un nuevo curso (status: draft) */
export async function createCourse(
  data: Omit<Course, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt'>,
  authorId: string
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.COURSES));
    await setDoc(docRef, stripUndefined({
      ...data,
      authorId,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return docRef.id;
  } catch (error) {
    console.error('Error creating course:', error);
    throw error;
  }
}

/** Actualiza campos de un curso existente */
export async function updateCourse(
  courseId: string,
  updates: Partial<Omit<Course, 'id' | 'createdAt'>>
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.COURSES, courseId);
    await updateDoc(docRef, stripUndefined({
      ...updates,
      updatedAt: serverTimestamp(),
    }) as WithFieldValue<DocumentData>);
  } catch (error) {
    console.error('Error updating course:', error);
    throw error;
  }
}

/** Elimina un curso y su progreso asociado */
export async function deleteCourse(courseId: string): Promise<void> {
  try {
    await deleteDoc(getDocRef(COLLECTIONS.COURSES, courseId));
  } catch (error) {
    console.error('Error deleting course:', error);
    throw error;
  }
}

/** Publica un curso (draft → published) */
export async function publishCourse(courseId: string): Promise<void> {
  try {
    await updateDoc(getDocRef(COLLECTIONS.COURSES, courseId), {
      status: 'published',
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error publishing course:', error);
    throw error;
  }
}

/** Archiva un curso (published → archived) */
export async function archiveCourse(courseId: string): Promise<void> {
  try {
    await updateDoc(getDocRef(COLLECTIONS.COURSES, courseId), {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error archiving course:', error);
    throw error;
  }
}

// ============================================================================
// FORMULARIOS DE RUTA (Journey Forms)
// ============================================================================

/** Devuelve todos los formularios activos de una organización */
export async function getJourneyForms(orgId: string = DEFAULT_ORG_ID): Promise<JourneyForm[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.JOURNEY_FORMS),
      where('organizationId', '==', orgId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as JourneyForm);
  } catch (error) {
    console.error('Error getting journey forms:', error);
    return [];
  }
}

/** Devuelve un formulario por ID */
export async function getJourneyForm(formId: string): Promise<JourneyForm | null> {
  try {
    const snap = await getDoc(getDocRef(COLLECTIONS.JOURNEY_FORMS, formId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as JourneyForm;
  } catch (error) {
    console.error('Error getting journey form:', error);
    return null;
  }
}

/** Crea un nuevo formulario */
export async function createJourneyForm(
  data: Omit<JourneyForm, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
  createdBy: string
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.JOURNEY_FORMS));
    await setDoc(docRef, stripUndefined({
      ...data,
      createdBy,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return docRef.id;
  } catch (error) {
    console.error('Error creating journey form:', error);
    throw error;
  }
}

/** Actualiza campos de un formulario existente */
export async function updateJourneyForm(
  formId: string,
  updates: Partial<Omit<JourneyForm, 'id' | 'createdAt'>>
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.JOURNEY_FORMS, formId);
    await updateDoc(docRef, stripUndefined({
      ...updates,
      updatedAt: serverTimestamp(),
    }) as WithFieldValue<DocumentData>);
  } catch (error) {
    console.error('Error updating journey form:', error);
    throw error;
  }
}

/** Elimina (desactiva) un formulario */
export async function deleteJourneyForm(formId: string): Promise<void> {
  try {
    await updateJourneyForm(formId, { active: false });
  } catch (error) {
    console.error('Error deleting journey form:', error);
    throw error;
  }
}

/** Guarda la respuesta de un usuario a un formulario */
export async function saveFormResponse(
  data: Omit<FormResponse, 'id' | 'submittedAt'>
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.FORM_RESPONSES));
    await setDoc(docRef, stripUndefined({
      ...data,
      submittedAt: serverTimestamp(),
    }));
    return docRef.id;
  } catch (error) {
    console.error('Error saving form response:', error);
    throw error;
  }
}

/** Devuelve respuestas de un formulario, opcionalmente filtradas por usuario */
export async function getFormResponses(
  formId: string,
  respondentId?: string
): Promise<FormResponse[]> {
  try {
    const constraints: QueryConstraint[] = [where('formId', '==', formId)];
    if (respondentId) constraints.push(where('respondentId', '==', respondentId));
    const q = query(
      getCollectionRef(COLLECTIONS.FORM_RESPONSES),
      ...constraints,
      orderBy('submittedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as FormResponse);
  } catch (error) {
    console.error('Error getting form responses:', error);
    return [];
  }
}

// ============================================================================
// CONFIGURACIÓN DE NIVELES XP
// ============================================================================

export interface LevelConfig {
  level: number;
  title: string;
  emoji: string;
  minXP: number;
}

const LEVELS_DOC_ID = 'levels';

/** Devuelve la configuración de niveles desde Firestore. Si no existe, retorna los defaults. */
export async function getLevelsConfig(): Promise<LevelConfig[]> {
  try {
    const docRef = getDocRef(COLLECTIONS.CONFIG, LEVELS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.levels) && data.levels.length > 0) {
        return data.levels as LevelConfig[];
      }
    }
  } catch (error) {
    console.error('Error getting levels config:', error);
  }
  // Default levels
  return [
    { level: 1, title: 'Explorador',    emoji: '🌱', minXP: 0 },
    { level: 2, title: 'Aprendiz',      emoji: '📚', minXP: 250 },
    { level: 3, title: 'Promotor',      emoji: '⚡', minXP: 600 },
    { level: 4, title: 'Asesor Senior', emoji: '🎯', minXP: 1200 },
    { level: 5, title: 'Maestro Aviva', emoji: '🏆', minXP: 2400 },
  ];
}

/** Guarda la configuración de niveles en Firestore. */
export async function saveLevelsConfig(levels: LevelConfig[]): Promise<void> {
  const docRef = getDocRef(COLLECTIONS.CONFIG, LEVELS_DOC_ID);
  await setDoc(docRef, { levels, updatedAt: serverTimestamp() });
}

/** Dado un total de XP y la lista de niveles, devuelve el nivel actual y el progreso hacia el siguiente. */
export function getLevelFromConfig(xp: number, levels: LevelConfig[]) {
  const sorted = [...levels].sort((a, b) => b.minXP - a.minXP);
  const current = sorted.find(l => xp >= l.minXP) ?? sorted[sorted.length - 1];
  const sortedAsc = [...levels].sort((a, b) => a.minXP - b.minXP);
  const currentIdx = sortedAsc.findIndex(l => l.level === current.level);
  const next = sortedAsc[currentIdx + 1];
  const pctToNext = next
    ? Math.min(100, Math.round(((xp - current.minXP) / (next.minXP - current.minXP)) * 100))
    : 100;
  const xpToNext = next ? Math.max(0, next.minXP - xp) : 0;
  return { ...current, xp, pctToNext, xpToNext, nextLevel: next ?? null };
}

// ============================================================================
// CONFIGURACIÓN DE MARCA (LOGOS)
// ============================================================================

export interface BrandingConfig {
  /** Logo completo (ícono + wordmark), usado en pantallas grandes como login. */
  logoUrl: string | null;
  /** Símbolo/ícono únicamente, usado en espacios reducidos como el header. */
  iconUrl: string | null;
  /** Color primario de marca (hex, ej. "#16B877"). null = usar el default de la plataforma. */
  primaryColor?: string | null;
  /** Color de acento de marca (hex). null = usar el default de la plataforma. */
  accentColor?: string | null;
  updatedAt?: unknown;
}

const BRANDING_DOC_ID = 'branding';

const DEFAULT_BRANDING: BrandingConfig = { logoUrl: null, iconUrl: null, primaryColor: null, accentColor: null };

/** Devuelve la configuración de marca (logos) desde Firestore. Si no existe, retorna los defaults. */
export async function getBrandingConfig(): Promise<BrandingConfig> {
  try {
    const docRef = getDocRef(COLLECTIONS.CONFIG, BRANDING_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        logoUrl: typeof data.logoUrl === 'string' ? data.logoUrl : null,
        iconUrl: typeof data.iconUrl === 'string' ? data.iconUrl : null,
        primaryColor: typeof data.primaryColor === 'string' ? data.primaryColor : null,
        accentColor: typeof data.accentColor === 'string' ? data.accentColor : null,
      };
    }
  } catch (error) {
    console.error('Error getting branding config:', error);
  }
  return DEFAULT_BRANDING;
}

/** Guarda la configuración de marca (logos) en Firestore. */
export async function saveBrandingConfig(config: Partial<BrandingConfig>): Promise<void> {
  const docRef = getDocRef(COLLECTIONS.CONFIG, BRANDING_DOC_ID);
  await setDoc(docRef, { ...config, updatedAt: serverTimestamp() }, { merge: true });
}

// ============================================================================
// VIDEO FEED
// ============================================================================

/** Devuelve los videos activos, filtrados opcionalmente por producto. */
export async function getVideos(productId?: string): Promise<Video[]> {
  try {
    const constraints: QueryConstraint[] = [where('active', '==', true), orderBy('order', 'asc')];
    if (productId) {
      // Show videos for this product OR videos with no productId filter
      // We fetch all active and filter client-side (Firestore doesn't support OR on different fields)
    }
    const q = query(getCollectionRef(COLLECTIONS.VIDEOS), ...constraints);
    const snap = await getDocs(q);
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Video);
    // Filter: show videos with no productId filter, or matching the user's product
    return productId ? all.filter(v => !v.productId || v.productId === productId) : all;
  } catch (error) {
    console.error('Error getting videos:', error);
    return [];
  }
}

/** Devuelve TODOS los videos (admin), activos e inactivos. */
export async function getAllVideos(): Promise<Video[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.VIDEOS), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Video);
  } catch (error) {
    console.error('Error getting all videos:', error);
    return [];
  }
}

/** Crea un nuevo video. */
export async function createVideo(data: Omit<Video, 'id'>): Promise<string> {
  const docRef = doc(getCollectionRef(COLLECTIONS.VIDEOS));
  await setDoc(docRef, stripUndefined({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  return docRef.id;
}

/** Actualiza un video existente. */
export async function updateVideo(videoId: string, updates: Partial<Omit<Video, 'id'>>): Promise<void> {
  const docRef = getDocRef(COLLECTIONS.VIDEOS, videoId);
  await updateDoc(docRef, stripUndefined({ ...updates, updatedAt: serverTimestamp() }) as WithFieldValue<DocumentData>);
}

/** Elimina un video. */
export async function deleteVideo(videoId: string): Promise<void> {
  await deleteDoc(getDocRef(COLLECTIONS.VIDEOS, videoId));
}

// ============================================================================
// VIDEO FOLDERS
// ============================================================================

/** Devuelve todas las carpetas de videos (activas e inactivas). */
export async function getVideoFolders(): Promise<VideoFolder[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.VIDEO_FOLDERS), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as VideoFolder);
  } catch (error) {
    console.error('Error getting video folders:', error);
    return [];
  }
}

/** Crea una nueva carpeta de videos. */
export async function createVideoFolder(data: Omit<VideoFolder, 'id'>): Promise<string> {
  const docRef = doc(getCollectionRef(COLLECTIONS.VIDEO_FOLDERS));
  await setDoc(docRef, stripUndefined({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  return docRef.id;
}

/** Actualiza una carpeta de videos existente. */
export async function updateVideoFolder(folderId: string, updates: Partial<Omit<VideoFolder, 'id'>>): Promise<void> {
  const docRef = getDocRef(COLLECTIONS.VIDEO_FOLDERS, folderId);
  await updateDoc(docRef, stripUndefined({ ...updates, updatedAt: serverTimestamp() }) as WithFieldValue<DocumentData>);
}

/** Elimina una carpeta de videos. */
export async function deleteVideoFolder(folderId: string): Promise<void> {
  await deleteDoc(getDocRef(COLLECTIONS.VIDEO_FOLDERS, folderId));
}

// ============================================================================
// SIMULACIONES POR NODOS (prototipo, standalone)
// ============================================================================

/** Devuelve todos los módulos de simulación. */
export async function getAllSimModules(): Promise<SimModule[]> {
  try {
    const snap = await getDocs(getCollectionRef(COLLECTIONS.SIM_MODULES));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as SimModule);
  } catch (error) {
    console.error('Error getting sim modules:', error);
    return [];
  }
}

/** Devuelve un módulo de simulación por id, o null si no existe. */
export async function getSimModule(moduleId: string): Promise<SimModule | null> {
  const snap = await getDoc(getDocRef(COLLECTIONS.SIM_MODULES, moduleId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SimModule;
}

/** Crea un módulo de simulación. */
export async function createSimModule(data: Omit<SimModule, 'id'>): Promise<string> {
  const docRef = doc(getCollectionRef(COLLECTIONS.SIM_MODULES));
  await setDoc(docRef, stripUndefined({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  return docRef.id;
}

/** Actualiza un módulo de simulación existente. */
export async function updateSimModule(moduleId: string, updates: Partial<Omit<SimModule, 'id'>>): Promise<void> {
  const docRef = getDocRef(COLLECTIONS.SIM_MODULES, moduleId);
  await updateDoc(docRef, stripUndefined({ ...updates, updatedAt: serverTimestamp() }) as WithFieldValue<DocumentData>);
}

/** Elimina un módulo de simulación. */
export async function deleteSimModule(moduleId: string): Promise<void> {
  await deleteDoc(getDocRef(COLLECTIONS.SIM_MODULES, moduleId));
}

/**
 * Registra un intento. Se crea al empezar, no al terminar: así los intentos
 * abandonados —que son justo los que dicen dónde se atora la gente— también
 * quedan registrados.
 */
export async function createSimAttempt(data: Omit<SimAttempt, 'id'>): Promise<string> {
  const docRef = doc(getCollectionRef(COLLECTIONS.SIM_ATTEMPTS));
  await setDoc(docRef, stripUndefined(data));
  return docRef.id;
}

/** Actualiza un intento en curso (avance parcial) o lo cierra al terminar. */
export async function updateSimAttempt(attemptId: string, updates: Partial<Omit<SimAttempt, 'id'>>): Promise<void> {
  const docRef = getDocRef(COLLECTIONS.SIM_ATTEMPTS, attemptId);
  await updateDoc(docRef, stripUndefined(updates) as WithFieldValue<DocumentData>);
}

/**
 * Intentos de un módulo, del más reciente al más viejo.
 *
 * Se ordena en memoria a propósito: combinar `where` con `orderBy` obligaría a
 * crear un índice compuesto en Firestore, y el volumen de un módulo de
 * capacitación no lo amerita.
 */
/** Intentos de simulación del usuario (para su listado de simulaciones). */
export async function getUserSimAttempts(userId: string): Promise<SimAttempt[]> {
  try {
    const snap = await getDocs(query(getCollectionRef(COLLECTIONS.SIM_ATTEMPTS), where('userId', '==', userId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as SimAttempt);
  } catch (error) {
    console.error('Error getting user sim attempts:', error);
    return [];
  }
}

export async function getSimAttempts(moduleId: string, max = 100): Promise<SimAttempt[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.SIM_ATTEMPTS), where('moduleId', '==', moduleId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }) as SimAttempt)
      .sort((a, b) => toMillis(b.startedAt) - toMillis(a.startedAt))
      .slice(0, max);
  } catch (error) {
    console.error('Error getting sim attempts:', error);
    return [];
  }
}

/** Los timestamps de Firestore pueden venir sin resolver mientras se escriben. */
function toMillis(value: SimAttempt['startedAt']): number {
  return value && typeof value === 'object' && 'toMillis' in value
    ? (value as Timestamp).toMillis()
    : 0;
}

/** Devuelve el registro de visualización de un usuario para todos sus videos. */
export async function getUserVideoViews(userId: string): Promise<VideoView[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.VIDEO_VIEWS), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as VideoView);
  } catch (error) {
    console.error('Error getting user video views:', error);
    return [];
  }
}

/** Devuelve todas las visualizaciones de un video (para admin analytics). */
export async function getVideoViews(videoId: string): Promise<VideoView[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.VIDEO_VIEWS),
      where('videoId', '==', videoId),
      orderBy('lastWatchedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as VideoView);
  } catch (error) {
    console.error('Error getting video views:', error);
    return [];
  }
}

/**
 * Crea o actualiza el registro de visualización de un usuario.
 * Solo actualiza si el nuevo watchedSeconds es mayor (nunca retrocede).
 */
export async function upsertVideoView(
  userId: string,
  videoId: string,
  update: {
    watchedSeconds: number;
    duration: number;
    trainerName: string;
    assignedKiosko?: string;
    productId?: string;
  }
): Promise<void> {
  try {
    const docId = `${userId}_${videoId}`;
    const docRef = getDocRef(COLLECTIONS.VIDEO_VIEWS, docId);
    const snap = await getDoc(docRef);

    const percentWatched = update.duration > 0
      ? Math.min(100, Math.round((update.watchedSeconds / update.duration) * 100))
      : 0;
    const completed = update.duration > 0 && update.watchedSeconds / update.duration >= 1.0;

    if (!snap.exists()) {
      await setDoc(docRef, stripUndefined({
        id: docId,
        videoId,
        userId,
        trainerName: update.trainerName,
        assignedKiosko: update.assignedKiosko,
        productId: update.productId,
        firstWatchedAt: serverTimestamp(),
        lastWatchedAt: serverTimestamp(),
        watchedSeconds: update.watchedSeconds,
        percentWatched,
        completed,
        viewCount: 1,
      }));
    } else {
      const prev = snap.data() as VideoView;
      // Detect a new replay session: user restarted from scratch (watchedSeconds dropped back below 10s)
      const isNewSession = (prev.watchedSeconds ?? 0) > 10 && update.watchedSeconds < 10;
      const newViewCount = isNewSession ? (prev.viewCount ?? 1) + 1 : (prev.viewCount ?? 1);

      // For a new session always update; otherwise only advance forward
      if (!isNewSession && update.watchedSeconds <= (prev.watchedSeconds ?? 0) && prev.completed) return;

      await updateDoc(docRef, stripUndefined({
        lastWatchedAt: serverTimestamp(),
        watchedSeconds: isNewSession
          ? update.watchedSeconds
          : Math.max(prev.watchedSeconds ?? 0, update.watchedSeconds),
        percentWatched: isNewSession
          ? percentWatched
          : Math.max(prev.percentWatched ?? 0, percentWatched),
        completed: prev.completed || completed,
        viewCount: newViewCount,
      }) as WithFieldValue<DocumentData>);
    }
  } catch (error) {
    console.error('Error upserting video view:', error);
  }
}

// ============================================================================
// VIDEO REACTIONS
// ============================================================================

/** Devuelve todas las reacciones de un video. */
export async function getVideoReactions(videoId: string): Promise<VideoReaction[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.VIDEO_REACTIONS), where('videoId', '==', videoId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as VideoReaction);
  } catch (error) {
    console.error('Error getting video reactions:', error);
    return [];
  }
}

/**
 * Establece o elimina la reacción de un usuario en un video.
 * emoji=null elimina la reacción.
 * Si el usuario ya tiene la misma reacción, la elimina (toggle).
 */
export async function setVideoReaction(
  userId: string,
  videoId: string,
  emoji: string | null,
  trainerName: string
): Promise<void> {
  const docId = `${userId}_${videoId}`;
  const docRef = getDocRef(COLLECTIONS.VIDEO_REACTIONS, docId);
  if (!emoji) {
    await deleteDoc(docRef);
  } else {
    await setDoc(docRef, stripUndefined({
      id: docId, videoId, userId, trainerName, emoji, reactedAt: serverTimestamp(),
    }));
  }
}

// ============================================================================
// VIDEO COMMENTS
// ============================================================================

/** Devuelve los comentarios de un video, ordenados de más antiguo a más nuevo. */
export async function getVideoComments(videoId: string): Promise<VideoComment[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.VIDEO_COMMENTS),
      where('videoId', '==', videoId),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as VideoComment);
  } catch (error) {
    console.error('Error getting video comments:', error);
    return [];
  }
}

/** Agrega un comentario a un video. */
export async function addVideoComment(
  data: Omit<VideoComment, 'id' | 'createdAt'>
): Promise<string> {
  const docRef = doc(getCollectionRef(COLLECTIONS.VIDEO_COMMENTS));
  await setDoc(docRef, { ...data, createdAt: serverTimestamp() });
  return docRef.id;
}

/** Elimina un comentario. */
export async function deleteVideoComment(commentId: string): Promise<void> {
  await deleteDoc(getDocRef(COLLECTIONS.VIDEO_COMMENTS, commentId));
}

// ============================================================================
// KNOWLEDGE PULSE — PULSO DE CONOCIMIENTO DIARIO
// ============================================================================
//
// Nota: las consultas de esta sección filtran por un solo campo y completan el
// filtrado en memoria, para no depender de índices compuestos de Firestore.

// ----------- Daily Pulse -----------

/** Obtiene el pulso de un día específico (id = YYYY-MM-DD). */
export async function getDailyPulse(date: string, orgId = DEFAULT_ORG_ID): Promise<DailyPulse | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.DAILY_PULSES, `${orgId}_${date}`);
    const snap = await getDoc(docRef);
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as DailyPulse) : null;
  } catch (error) {
    console.error('Error getting daily pulse:', error);
    return null;
  }
}

/** Lista los pulsos de un rango de fechas (más recientes primero). */
export async function getDailyPulses(
  startDate: string,
  endDate: string,
  orgId = DEFAULT_ORG_ID
): Promise<DailyPulse[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.DAILY_PULSES),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as DailyPulse))
      .filter(p => p.organizationId === orgId);
  } catch (error) {
    console.error('Error listing daily pulses:', error);
    return [];
  }
}

/**
 * Crea o actualiza el pool de preguntas de un día.
 * Si el pulso ya estaba cerrado conserva su estado; los vendedores que ya
 * empezaron conservan las preguntas que se les asignaron.
 */
export async function upsertDailyPulse(
  date: string,
  questionIds: string[],
  createdBy = 'system',
  orgId = DEFAULT_ORG_ID
): Promise<string> {
  const id = `${orgId}_${date}`;
  const docRef = getDocRef(COLLECTIONS.DAILY_PULSES, id);
  const existing = await getDoc(docRef);
  if (existing.exists()) {
    const currentStatus = existing.data()?.status as string | undefined;
    // Normalizar status a 'scheduled' si está ausente o tiene un valor desconocido
    const statusPatch = (!currentStatus || (currentStatus !== 'active' && currentStatus !== 'closed'))
      ? { status: 'scheduled' }
      : {};
    await updateDoc(docRef, { questionIds, updatedAt: serverTimestamp(), ...statusPatch });
  } else {
    await setDoc(docRef, stripUndefined(newDailyPulse(date, questionIds, createdBy, orgId)));
  }
  return id;
}

function newDailyPulse(date: string, questionIds: string[], createdBy: string, orgId: string): Omit<DailyPulse, 'id'> {
  return {
    organizationId: orgId,
    date,
    questionIds,
    status: 'scheduled',
    totalResponses: 0,
    createdAt: serverTimestamp() as unknown as Timestamp,
    updatedAt: serverTimestamp() as unknown as Timestamp,
    createdBy,
  };
}

/**
 * Actualiza el estado del pulso (active → closed, etc.).
 * Con `touchTimestamps=false` (p. ej. al reabrir) no reescribe sentAt/closedAt.
 */
export async function updatePulseStatus(
  date: string,
  status: DailyPulse['status'],
  orgId = DEFAULT_ORG_ID,
  touchTimestamps = true
): Promise<void> {
  const id = `${orgId}_${date}`;
  const extra: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
  if (touchTimestamps && status === 'active') extra.sentAt = serverTimestamp();
  if (touchTimestamps && status === 'closed') extra.closedAt = serverTimestamp();
  await updateDoc(getDocRef(COLLECTIONS.DAILY_PULSES, id), extra);
}

// ----------- Pulse Attempts -----------

/** Obtiene el intento de un usuario para un día específico. */
export async function getPulseAttempt(userId: string, date: string, orgId = DEFAULT_ORG_ID): Promise<PulseAttempt | null> {
  try {
    const id = `${userId}_${date}`;
    const snap = await getDoc(getDocRef(COLLECTIONS.PULSE_ATTEMPTS, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as PulseAttempt) : null;
  } catch (error) {
    console.error('Error getting pulse attempt:', error);
    return null;
  }
}

/** Lista los intentos de un usuario (más recientes primero). */
export async function getUserPulseAttempts(
  userId: string,
  limitCount = 30,
  orgId = DEFAULT_ORG_ID
): Promise<PulseAttempt[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.PULSE_ATTEMPTS), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as PulseAttempt))
      .filter(a => a.organizationId === orgId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limitCount);
  } catch (error) {
    console.error('Error getting user pulse attempts:', error);
    return [];
  }
}

/** Lista TODOS los intentos de un pulso (para analytics). */
export async function getPulseAttemptsByDate(
  date: string,
  orgId = DEFAULT_ORG_ID
): Promise<PulseAttempt[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.PULSE_ATTEMPTS), where('date', '==', date));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as PulseAttempt))
      .filter(a => a.organizationId === orgId);
  } catch (error) {
    console.error('Error getting pulse attempts by date:', error);
    return [];
  }
}

/** Lista TODOS los intentos completados en un rango de fechas (para analytics). */
export async function getPulseAttemptsByDateRange(
  startDate: string,
  endDate: string,
  orgId = DEFAULT_ORG_ID
): Promise<PulseAttempt[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.PULSE_ATTEMPTS),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as PulseAttempt))
      .filter(a => a.organizationId === orgId);
  } catch (error) {
    console.error('Error getting pulse attempts by date range:', error);
    return [];
  }
}

// ----------- Pulse Backlog (MVP2) -----------

/** Obtiene el backlog pendiente de un usuario (más antiguos primero). */
export async function getUserPulseBacklog(userId: string, orgId = DEFAULT_ORG_ID): Promise<PulseBacklogItem[]> {
  try {
    const q = query(getCollectionRef(COLLECTIONS.PULSE_BACKLOGS), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as PulseBacklogItem))
      .filter(b => b.organizationId === orgId && b.status === 'pending')
      .sort((a, b) => (a.addedAt?.toMillis?.() ?? 0) - (b.addedAt?.toMillis?.() ?? 0));
  } catch (error) {
    console.error('Error getting pulse backlog:', error);
    return [];
  }
}

// ----------- Slack Config -----------

/** Obtiene la configuración de Slack para el Knowledge Pulse. */
export async function getSlackConfig(orgId = DEFAULT_ORG_ID): Promise<SlackNotificationConfig | null> {
  try {
    const snap = await getDoc(getDocRef(COLLECTIONS.SLACK_CONFIG, orgId));
    return snap.exists() ? (snap.data() as SlackNotificationConfig) : null;
  } catch (error) {
    console.error('Error getting Slack config:', error);
    return null;
  }
}

/**
 * Guarda campos de la configuración de Slack. Hace merge: cada pantalla guarda
 * solo lo que edita (mensaje y horario desde el Pulso, destinatarios desde
 * Configuración Slack) sin borrar lo de la otra.
 */
export async function saveSlackConfig(
  config: Partial<Omit<SlackNotificationConfig, 'organizationId' | 'updatedAt' | 'updatedBy'>>,
  updatedBy: string,
  orgId = DEFAULT_ORG_ID
): Promise<void> {
  await setDoc(getDocRef(COLLECTIONS.SLACK_CONFIG, orgId), stripUndefined({
    ...config,
    organizationId: orgId,
    updatedAt: serverTimestamp(),
    updatedBy,
  }), { merge: true });
}

/**
 * Guarda la URL pública de la app en la configuración de Slack si aún no hay
 * una. La usan el botón del mensaje y la función programada del Pulso. Ignora
 * URLs locales (desarrollo). Devuelve true si la guardó.
 */
export async function rememberAppUrl(url: string, orgId = DEFAULT_ORG_ID): Promise<boolean> {
  const clean = url.trim().replace(/\/$/, '');
  if (!/^https?:\/\//.test(clean) || /\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(clean)) return false;
  const current = await getSlackConfig(orgId);
  if (current?.appUrl?.trim()) return false;
  await setDoc(getDocRef(COLLECTIONS.SLACK_CONFIG, orgId), { organizationId: orgId, appUrl: clean }, { merge: true });
  return true;
}

// ----------- Pulse Config -----------

/** Obtiene la configuración global del pulso de conocimiento. */
export async function getPulseConfig(orgId = DEFAULT_ORG_ID): Promise<PulseConfig> {
  try {
    const snap = await getDoc(getDocRef(COLLECTIONS.PULSE_CONFIG, orgId));
    if (snap.exists()) return { ...DEFAULT_PULSE_CONFIG, id: snap.id, ...snap.data() } as PulseConfig;
    return { ...DEFAULT_PULSE_CONFIG, organizationId: orgId };
  } catch (error) {
    console.error('Error getting pulse config:', error);
    return { ...DEFAULT_PULSE_CONFIG, organizationId: orgId };
  }
}

/** Guarda la configuración global del pulso. */
export async function savePulseConfig(
  config: Omit<PulseConfig, 'id' | 'organizationId' | 'updatedAt'>,
  updatedBy: string,
  orgId = DEFAULT_ORG_ID
): Promise<void> {
  await setDoc(getDocRef(COLLECTIONS.PULSE_CONFIG, orgId), stripUndefined({
    ...config,
    organizationId: orgId,
    updatedAt: serverTimestamp(),
    updatedBy,
  }));
}

// ----------- Cron status -----------

export async function getPulseCronStatus(orgId = DEFAULT_ORG_ID): Promise<PulseCronStatus | null> {
  try {
    const snap = await getDoc(getDocRef(COLLECTIONS.PULSE_CRON_STATUS, orgId));
    return snap.exists() ? (snap.data() as PulseCronStatus) : null;
  } catch (error) {
    console.error('Error getting pulse cron status:', error);
    return null;
  }
}

/**
 * Pide a la función programada que revise a qué hora está su ejecución diaria
 * (la función escucha cambios en slack_config). Lo usa el panel si detecta que
 * la hora programada no coincide con la configurada.
 */
export async function requestPulseScheduleSync(orgId = DEFAULT_ORG_ID): Promise<void> {
  await setDoc(getDocRef(COLLECTIONS.SLACK_CONFIG, orgId), { syncRequestedAt: serverTimestamp() }, { merge: true });
}

// ----------- Questions for the pulse -----------

// ----------- Auto-scheduling helpers -----------

/**
 * Arma el pool automático del día (ver `buildAutoPool`): respeta los módulos
 * activos, distribuye por módulo, prioriza las preguntas con menos aciertos y
 * evita repetir las de los últimos días. Las primeras `questionsPerPulse` son
 * las que ve todo el equipo cuando "mismas preguntas para todos" está activo.
 */
export async function scheduleAutoPulse(
  orgId = DEFAULT_ORG_ID,
  date = pulseDateStr()
): Promise<string[]> {
  const q = query(
    getCollectionRef(COLLECTIONS.QUESTIONS),
    where('organizationId', '==', orgId),
    where('active', '==', true),
  );
  const [snap, cfg, recentPulses] = await Promise.all([
    getDocs(q),
    getPulseConfig(orgId),
    getDailyPulses(addDaysStr(date, -RECENT_USE_WINDOW_DAYS), addDaysStr(date, -1), orgId),
  ]);
  const questions = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Question);
  return buildAutoPool(questions, {
    activeModules: cfg.activeModules,
    lastUsed: lastUsedByQuestion(recentPulses, cfg.questionsPerPulse),
    date,
  });
}

// ----------- Org Tokens -----------

/** Lista todos los tokens configurados para la organización. */
export async function getOrgTokens(orgId = DEFAULT_ORG_ID): Promise<OrgTokenConfig[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.ORG_TOKENS),
      where('organizationId', '==', orgId),
      orderBy('key', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as OrgTokenConfig);
  } catch (error) {
    console.error('Error getting org tokens:', error);
    return [];
  }
}

/** Guarda o actualiza un token de organización. */
export async function saveOrgToken(
  key: string,
  label: string,
  value: string,
  updatedBy: string,
  orgId = DEFAULT_ORG_ID
): Promise<void> {
  await setDoc(doc(ensureFirestore(), COLLECTIONS.ORG_TOKENS, `${orgId}_${key}`), {
    key,
    label,
    value,
    organizationId: orgId,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
}

/** Elimina un token de organización. */
export async function deleteOrgToken(key: string, orgId = DEFAULT_ORG_ID): Promise<void> {
  await deleteDoc(doc(ensureFirestore(), COLLECTIONS.ORG_TOKENS, `${orgId}_${key}`));
}

// ── Pulse Categories ──────────────────────────────────────────────────────────

export async function getPulseCategories(): Promise<PulseCategory[]> {
  const firestore = ensureFirestore();
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.PULSE_CATEGORIES), orderBy('order', 'asc'))
  );
  if (snap.empty) return [];
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PulseCategory);
  // Deduplicate by key — keep only the first occurrence of each key
  const seen = new Set<string>();
  return all.filter(cat => {
    if (seen.has(cat.key)) return false;
    seen.add(cat.key);
    return true;
  });
}

export async function savePulseCategory(
  cat: Omit<PulseCategory, 'id'>,
  id?: string
): Promise<string> {
  const firestore = ensureFirestore();
  const ref = id
    ? doc(firestore, COLLECTIONS.PULSE_CATEGORIES, id)
    : doc(collection(firestore, COLLECTIONS.PULSE_CATEGORIES));
  await setDoc(ref, stripUndefined(cat), { merge: true });
  return ref.id;
}

export async function deletePulseCategory(id: string): Promise<void> {
  await deleteDoc(doc(ensureFirestore(), COLLECTIONS.PULSE_CATEGORIES, id));
}

export async function seedDefaultCategoriesIfEmpty(): Promise<void> {
  const firestore = ensureFirestore();
  const existing = await getPulseCategories();
  if (existing.length > 0) return;
  // Use the category key as the document ID to ensure idempotent seeding
  const batch = writeBatch(firestore);
  DEFAULT_PULSE_CATEGORIES.forEach((cat, i) => {
    const ref = doc(firestore, COLLECTIONS.PULSE_CATEGORIES, cat.key);
    batch.set(ref, { ...cat, order: i });
  });
  await batch.commit();
}

// ============================================================================
// ROLE PERMISSIONS
// ============================================================================

export async function getRolePermissions(role: string): Promise<string[]> {
  try {
    const firestore = ensureFirestore();
    const ref = doc(firestore, COLLECTIONS.ROLE_PERMISSIONS, role);
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    return (snap.data()?.allowedPaths as string[]) ?? [];
  } catch {
    return [];
  }
}

export async function saveRolePermissions(
  role: string,
  allowedPaths: string[],
  updatedBy: string
): Promise<void> {
  const firestore = ensureFirestore();
  const ref = doc(firestore, COLLECTIONS.ROLE_PERMISSIONS, role);
  await setDoc(ref, { role, allowedPaths, updatedAt: serverTimestamp(), updatedBy });
}

export async function getAllRolePermissions(): Promise<Record<string, string[]>> {
  try {
    const firestore = ensureFirestore();
    const snap = await getDocs(collection(firestore, COLLECTIONS.ROLE_PERMISSIONS));
    const result: Record<string, string[]> = {};
    snap.docs.forEach(d => { result[d.id] = (d.data()?.allowedPaths as string[]) ?? []; });
    return result;
  } catch {
    return {};
  }
}

// ============================================================================
// KIOSCOS
// ============================================================================

export async function getKioscos(onlyActive = false): Promise<Kiosko[]> {
  try {
    const firestore = ensureFirestore();
    const constraints: QueryConstraint[] = onlyActive ? [where('active', '==', true)] : [];
    constraints.push(orderBy('name', 'asc'));
    const q = query(collection(firestore, COLLECTIONS.KIOSCOS), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Kiosko));
  } catch (error) {
    console.error('Error getting kioscos:', error);
    return [];
  }
}

export async function createKiosko(
  data: Omit<Kiosko, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string
): Promise<string> {
  const firestore = ensureFirestore();
  const docRef = doc(collection(firestore, COLLECTIONS.KIOSCOS));
  await setDoc(docRef, {
    ...data,
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateKiosko(id: string, updates: Partial<Kiosko>): Promise<void> {
  const firestore = ensureFirestore();
  await updateDoc(doc(firestore, COLLECTIONS.KIOSCOS, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteKiosko(id: string): Promise<void> {
  const firestore = ensureFirestore();
  await deleteDoc(doc(firestore, COLLECTIONS.KIOSCOS, id));
}

// ============================================================================
// AVISOS A EMBAJADORES (Admin → Notificaciones)
// ============================================================================

export async function getNotificationConfig(orgId = DEFAULT_ORG_ID): Promise<NotificationConfig> {
  const snap = await getDoc(getDocRef(COLLECTIONS.NOTIFICATION_CONFIG, orgId));
  return resolveNotificationConfig(snap.exists() ? (snap.data() as Partial<NotificationConfig>) : null, orgId);
}

export async function saveNotificationConfig(
  rules: NotificationConfig['rules'],
  updatedBy: string,
  orgId = DEFAULT_ORG_ID,
): Promise<void> {
  await setDoc(getDocRef(COLLECTIONS.NOTIFICATION_CONFIG, orgId), stripUndefined({
    organizationId: orgId,
    rules,
    updatedAt: serverTimestamp(),
    updatedBy,
  }));
}

/** Últimos avisos enviados (los escribe el servidor). */
export async function getRecentNotifications(max = 30): Promise<NotificationLogEntry[]> {
  const snap = await getDocs(query(getCollectionRef(COLLECTIONS.NOTIFICATION_LOG), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as NotificationLogEntry);
}

// ============================================================================
// ANALYTICS DE USUARIOS (panel)
// ============================================================================

export async function getAllEnrollments(): Promise<CourseEnrollment[]> {
  const snap = await getDocs(getCollectionRef(COLLECTIONS.ENROLLMENTS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseEnrollment);
}

export async function getAllJourneyProgress(): Promise<UserJourneyProgress[]> {
  const snap = await getDocs(getCollectionRef(COLLECTIONS.JOURNEY_PROGRESS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as UserJourneyProgress);
}

export async function getAllUserBadges(): Promise<UserBadge[]> {
  const snap = await getDocs(getCollectionRef(COLLECTIONS.USER_BADGES));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as UserBadge);
}
