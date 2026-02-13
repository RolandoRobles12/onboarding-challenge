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
  OnboardingField,
} from './types-scalable';

// ============================================================================
// CONSTANTES
// ============================================================================

const COLLECTIONS = {
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
  ONBOARDING_FIELDS: 'onboarding_fields',
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
