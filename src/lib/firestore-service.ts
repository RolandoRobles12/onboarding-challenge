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
  onSnapshot,
  QueryConstraint,
  DocumentData,
  WithFieldValue,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  Product,
  Quiz,
  Question,
  UserProfile,
  QuizAttempt,
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
} from './types-scalable';
import { DEFAULT_CERTIFICATE_CONFIG } from './types-scalable';
import type {
  Course,
  LearningPath,
  CourseEnrollment,
  LessonProgress,
} from './types-lms';

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

// ============================================================================
// ORGANIZACIONES
// ============================================================================

export async function getOrganization(orgId: string = DEFAULT_ORG_ID): Promise<Organization | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.ORGANIZATIONS, orgId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Organization : null;
  } catch (error) {
    console.error('Error getting organization:', error);
    throw error;
  }
}

export async function createOrganization(org: Omit<Organization, 'id'>): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.ORGANIZATIONS));
    await setDoc(docRef, {
      ...org,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating organization:', error);
    throw error;
  }
}

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
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
  } catch (error) {
    console.error('Error getting questions:', error);
    throw error;
  }
}

export async function getQuestion(questionId: string): Promise<Question | null> {
  try {
    const docRef = getDocRef(COLLECTIONS.QUESTIONS, questionId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Question : null;
  } catch (error) {
    console.error('Error getting question:', error);
    throw error;
  }
}

export async function getQuestionsByIds(questionIds: string[]): Promise<Question[]> {
  try {
    const questions: Question[] = [];

    // Firestore tiene un límite de 10 elementos en el operador 'in'
    // Por lo que dividimos en chunks si hay más de 10 IDs
    const chunkSize = 10;
    for (let i = 0; i < questionIds.length; i += chunkSize) {
      const chunk = questionIds.slice(i, i + chunkSize);
      const q = query(
        getCollectionRef(COLLECTIONS.QUESTIONS),
        where('__name__', 'in', chunk)
      );
      const snapshot = await getDocs(q);
      questions.push(...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
    }

    return questions;
  } catch (error) {
    console.error('Error getting questions by IDs:', error);
    throw error;
  }
}

export async function createQuestion(
  question: Omit<Question, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'averageCorrectRate'>,
  userId: string
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.QUESTIONS));
    await setDoc(docRef, {
      ...stripUndefined(question),
      timesUsed: 0,
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

export async function updateQuestion(questionId: string, updates: Partial<Question>): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.QUESTIONS, questionId);
    await updateDoc(docRef, {
      ...stripUndefined(updates),
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

export async function createUserProfile(
  userId: string,
  profile: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.USERS, userId);

    // Filtrar campos undefined
    const data: any = {
      uid: userId,
      email: profile.email,
      nombre: profile.nombre,
      rol: profile.rol,
      onboardingCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Solo agregar producto si tiene valor
    if (profile.producto) {
      data.producto = profile.producto;
    }

    await setDoc(docRef, data);
  } catch (error) {
    console.error('Error creating user profile:', error);
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

export async function getUsersByKiosko(kiosko: string, orgId: string = DEFAULT_ORG_ID): Promise<UserProfile[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.USERS),
      where('organizationId', '==', orgId),
      where('assignedKiosko', '==', kiosko),
      where('active', '==', true)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
  } catch (error) {
    console.error('Error getting users by kiosko:', error);
    throw error;
  }
}

// ============================================================================
// QUIZ ATTEMPTS
// ============================================================================

export async function createQuizAttempt(
  attempt: Omit<QuizAttempt, 'id'>
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.ATTEMPTS));
    await setDoc(docRef, attempt);
    return docRef.id;
  } catch (error) {
    console.error('Error creating quiz attempt:', error);
    throw error;
  }
}

export async function updateQuizAttempt(attemptId: string, updates: Partial<QuizAttempt>): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.ATTEMPTS, attemptId);
    await updateDoc(docRef, updates as DocumentData);
  } catch (error) {
    console.error('Error updating quiz attempt:', error);
    throw error;
  }
}

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

export async function getUserAttempts(userId: string, quizId?: string): Promise<QuizAttempt[]> {
  try {
    const constraints: QueryConstraint[] = [
      where('userId', '==', userId),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc')
    ];

    if (quizId) {
      constraints.push(where('quizId', '==', quizId));
    }

    const q = query(getCollectionRef(COLLECTIONS.ATTEMPTS), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizAttempt));
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
      .map(d => ({ id: d.id, ...d.data() } as QuizAttempt))
      .filter(d => d.status === 'completed');
    if (quizId) docs = docs.filter(d => d.quizId === quizId);
    return docs
      .sort((a, b) =>
        b.percentage !== a.percentage ? b.percentage - a.percentage : a.timeTaken - b.timeTaken
      )
      .slice(0, 10);
  } catch (error) {
    console.error('Error getting quiz leaderboard:', error);
    return [];
  }
}

// ============================================================================
// LEADERBOARD
// ============================================================================

export async function addLeaderboardEntry(entry: Omit<LeaderboardEntry, 'id'>): Promise<void> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.LEADERBOARDS));
    await setDoc(docRef, entry);
  } catch (error) {
    console.error('Error adding leaderboard entry:', error);
    throw error;
  }
}

export async function getLeaderboard(
  quizId: string,
  limitCount: number = 10,
  kiosko?: string
): Promise<LeaderboardEntry[]> {
  try {
    const constraints: QueryConstraint[] = [
      where('quizId', '==', quizId),
      orderBy('score', 'desc'),
      orderBy('timeTaken', 'asc'),
      limit(limitCount)
    ];

    if (kiosko) {
      constraints.push(where('assignedKiosko', '==', kiosko));
    }

    const q = query(getCollectionRef(COLLECTIONS.LEADERBOARDS), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    throw error;
  }
}

export async function getProductLeaderboard(
  productId: string,
  limitCount: number = 10
): Promise<LeaderboardEntry[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.LEADERBOARDS),
      where('productId', '==', productId),
      orderBy('score', 'desc'),
      orderBy('timeTaken', 'asc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
  } catch (error) {
    console.error('Error getting product leaderboard:', error);
    throw error;
  }
}

// ============================================================================
// ACHIEVEMENTS
// ============================================================================

export async function getAchievements(orgId: string = DEFAULT_ORG_ID): Promise<Achievement[]> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.ACHIEVEMENTS),
      where('organizationId', '==', orgId),
      where('active', '==', true),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Achievement));
  } catch (error) {
    console.error('Error getting achievements:', error);
    throw error;
  }
}

export async function createAchievement(
  achievement: Omit<Achievement, 'id'>
): Promise<string> {
  try {
    const docRef = doc(getCollectionRef(COLLECTIONS.ACHIEVEMENTS));
    await setDoc(docRef, {
      ...achievement,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating achievement:', error);
    throw error;
  }
}

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

export async function checkWhitelist(email: string, orgId: string = DEFAULT_ORG_ID): Promise<WhitelistEntry | null> {
  try {
    const q = query(
      getCollectionRef(COLLECTIONS.WHITELIST),
      where('organizationId', '==', orgId),
      where('email', '==', email),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('No whitelist entry found for:', email);
      return null;
    }

    const entry = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as WhitelistEntry;
    console.log('Whitelist entry found:', entry);
    return entry;
  } catch (error: any) {
    // Si la colección no existe o hay error de permisos, no es crítico
    console.warn('Could not check whitelist (collection may not exist):', error?.message);
    return null; // Retornar null en lugar de lanzar error
  }
}

export async function markWhitelistAsUsed(entryId: string): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.WHITELIST, entryId);
    await updateDoc(docRef, { used: true });
  } catch (error) {
    console.error('Error marking whitelist as used:', error);
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

export function subscribeToLeaderboard(
  quizId: string,
  callback: (entries: LeaderboardEntry[]) => void,
  limitCount: number = 10
) {
  const q = query(
    getCollectionRef(COLLECTIONS.LEADERBOARDS),
    where('quizId', '==', quizId),
    orderBy('score', 'desc'),
    orderBy('timeTaken', 'asc'),
    limit(limitCount)
  );

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    callback(entries);
  });
}

export function subscribeToUserProfile(
  userId: string,
  callback: (profile: UserProfile | null) => void
) {
  const docRef = getDocRef(COLLECTIONS.USERS, userId);

  return onSnapshot(docRef, (doc) => {
    const profile = doc.exists() ? { id: doc.id, ...doc.data() } as UserProfile : null;
    callback(profile);
  });
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export async function batchCreateQuestions(
  questions: Omit<Question, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'averageCorrectRate'>[],
  userId: string
): Promise<string[]> {
  try {
    const firestore = ensureFirestore();
    const batch = writeBatch(firestore);
    const ids: string[] = [];

    for (const question of questions) {
      const docRef = doc(getCollectionRef(COLLECTIONS.QUESTIONS));
      batch.set(docRef, {
        ...stripUndefined(question),
        timesUsed: 0,
        averageCorrectRate: 0,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      ids.push(docRef.id);
    }

    await batch.commit();
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
    const docRef = doc(
      collection(db, COLLECTIONS.JOURNEY_PROGRESS),
      `${userId}_${journeyId}`
    );
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as UserJourneyProgress;
  } catch (error) {
    console.error('Error getting journey progress:', error);
    return null;
  }
}

export async function markJourneyStepComplete(
  userId: string,
  journeyId: string,
  productId: string,
  stepId: string
): Promise<void> {
  try {
    const docId = `${userId}_${journeyId}`;
    const docRef = doc(collection(db, COLLECTIONS.JOURNEY_PROGRESS), docId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      await setDoc(docRef, {
        userId,
        journeyId,
        productId,
        completedStepIds: [stepId],
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data().completedStepIds as string[] ?? [];
      if (!existing.includes(stepId)) {
        await updateDoc(docRef, {
          completedStepIds: [...existing, stepId],
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    console.error('Error marking step complete:', error);
    throw error;
  }
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
    await updateDoc(docRef, {
      onboardingData: data,
      onboardingCompleted: true,
      updatedAt: serverTimestamp(),
    } as DocumentData);
  } catch (error) {
    console.error('Error saving seller onboarding data:', error);
    throw error;
  }
}


// ============================================================================
// LMS - INSCRIPCIONES (Enrollments)
// ============================================================================

export async function enrollUserInCourse(
  enrollmentData: Omit<CourseEnrollment, 'id' | 'updatedAt'>
): Promise<string> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.ENROLLMENTS);
    const docRef = doc(colRef);
    await setDoc(docRef, {
      ...enrollmentData,
      status: 'enrolled',
      completedLessonIds: [],
      completedModuleIds: [],
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error enrolling user in course:', error);
    throw error;
  }
}

export async function getUserEnrollments(userId: string): Promise<CourseEnrollment[]> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.ENROLLMENTS);
    const q = query(colRef, where('userId', '==', userId), orderBy('enrolledAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CourseEnrollment));
  } catch (error) {
    console.error('Error fetching user enrollments:', error);
    throw error;
  }
}

export async function updateEnrollmentProgress(
  enrollmentId: string,
  updates: Partial<Pick<CourseEnrollment, 'completedLessonIds' | 'completedModuleIds' | 'status' | 'overallScore' | 'completedAt' | 'lastAccessedAt'>>
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

/** Inscribe manualmente un usuario en un curso (desde el panel de admin) */
export async function adminEnrollUserInCourse(
  userId: string,
  courseId: string,
  assignedBy: string,
  orgId: string = DEFAULT_ORG_ID
): Promise<string> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.ENROLLMENTS);
    const docRef = doc(colRef);
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
    return docRef.id;
  } catch (error) {
    console.error('Error enrolling user:', error);
    throw error;
  }
}

// ============================================================================
// LMS - MÓDULO RUTAS DE APRENDIZAJE (Learning Paths Module)
// ============================================================================

export async function getLearningPaths(
  organizationId: string = DEFAULT_ORG_ID
): Promise<LearningPath[]> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.LEARNING_PATHS);
    const q = query(
      colRef,
      where('organizationId', '==', organizationId),
      where('status', '==', 'published'),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as LearningPath));
  } catch (error) {
    console.error('Error fetching learning paths:', error);
    throw error;
  }
}

export async function createLearningPath(
  pathData: Omit<LearningPath, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const colRef = getCollectionRef(COLLECTIONS.LEARNING_PATHS);
    const docRef = doc(colRef);
    await setDoc(docRef, {
      ...pathData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating learning path:', error);
    throw error;
  }
}

export async function updateLearningPath(
  pathId: string,
  updates: Partial<Omit<LearningPath, 'id' | 'createdAt'>>
): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.LEARNING_PATHS, pathId);
    await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() } as DocumentData);
  } catch (error) {
    console.error('Error updating learning path:', error);
    throw error;
  }
}

export async function deleteLearningPath(pathId: string): Promise<void> {
  try {
    const docRef = getDocRef(COLLECTIONS.LEARNING_PATHS, pathId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting learning path:', error);
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
