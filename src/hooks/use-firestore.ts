/**
 * Hooks personalizados para trabajar con Firestore
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  Product,
  Quiz,
  Question,
  UserProfile,
  LeaderboardEntry,
  Achievement,
  QuizAttempt,
} from '@/lib/types-scalable';
import {
  getProducts,
  getProduct,
  getQuizzes,
  getQuiz,
  getQuestions,
  getQuestionsByIds,
  getUserProfile,
  getLeaderboard,
  getProductLeaderboard,
  getAchievements,
  subscribeToLeaderboard,
  subscribeToUserProfile,
  getUserAttempts,
} from '@/lib/firestore-service';

// ============================================================================
// PRODUCTOS
// ============================================================================

export function useProducts(orgId?: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function fetchProducts() {
      try {
        setLoading(true);
        const data = await getProducts(orgId);
        if (mounted) {
          setProducts(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchProducts();

    return () => {
      mounted = false;
    };
  }, [orgId, refreshCounter]);

  const refresh = () => setRefreshCounter(c => c + 1);

  return { products, loading, error, refresh };
}

export function useProduct(productId: string | null) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchProduct() {
      try {
        setLoading(true);
        const data = await getProduct(productId);
        if (mounted) {
          setProduct(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchProduct();

    return () => {
      mounted = false;
    };
  }, [productId]);

  return { product, loading, error };
}

// ============================================================================
// QUIZZES
// ============================================================================

export function useQuizzes(productId?: string, activeOnly: boolean = true) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getQuizzes(productId, activeOnly);
      setQuizzes(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [productId, activeOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { quizzes, loading, error, refresh };
}

export function useQuiz(quizId: string | null) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!quizId) {
      setQuiz(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getQuiz(quizId);
      setQuiz(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { quiz, loading, error, refresh };
}

// ============================================================================
// PREGUNTAS
// ============================================================================

export function useQuestions(productId?: string, activeOnly: boolean = true) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getQuestions(productId, activeOnly);
      setQuestions(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [productId, activeOnly]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { questions, loading, error, refresh };
}

export function useQuestionsByIds(questionIds: string[]) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (questionIds.length === 0) {
      setQuestions([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchQuestions() {
      try {
        setLoading(true);
        const data = await getQuestionsByIds(questionIds);
        if (mounted) {
          // Ordenar según el orden de los IDs originales
          const orderedQuestions = questionIds.map(id => data.find(q => q.id === id)).filter(Boolean) as Question[];
          setQuestions(orderedQuestions);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchQuestions();

    return () => {
      mounted = false;
    };
  }, [questionIds.join(',')]); // Usar join para evitar re-renders innecesarios

  return { questions, loading, error };
}

// ============================================================================
// PERFIL DE USUARIO
// ============================================================================

export function useUserProfile(userId: string | null | undefined, realtime: boolean = false) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function fetchProfile() {
      try {
        setLoading(true);

        if (realtime) {
          // Suscripción en tiempo real
          unsubscribe = subscribeToUserProfile(userId, (data) => {
            if (mounted) {
              setProfile(data);
              setError(null);
              setLoading(false);
            }
          });
        } else {
          // Fetch único
          const data = await getUserProfile(userId);
          if (mounted) {
            setProfile(data);
            setError(null);
            setLoading(false);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId, realtime]);

  return { profile, loading, error };
}

// ============================================================================
// LEADERBOARD
// ============================================================================

export function useLeaderboard(
  quizId: string | null,
  limitCount: number = 10,
  realtime: boolean = false,
  kiosko?: string
) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!quizId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function fetchLeaderboard() {
      try {
        setLoading(true);

        if (realtime) {
          // Suscripción en tiempo real
          unsubscribe = subscribeToLeaderboard(quizId, (data) => {
            if (mounted) {
              setEntries(data);
              setError(null);
              setLoading(false);
            }
          }, limitCount);
        } else {
          // Fetch único
          const data = await getLeaderboard(quizId, limitCount, kiosko);
          if (mounted) {
            setEntries(data);
            setError(null);
            setLoading(false);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setLoading(false);
        }
      }
    }

    fetchLeaderboard();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [quizId, limitCount, realtime, kiosko]);

  return { entries, loading, error };
}

export function useProductLeaderboard(productId: string | null, limitCount: number = 10) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!productId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchLeaderboard() {
      try {
        setLoading(true);
        const data = await getProductLeaderboard(productId, limitCount);
        if (mounted) {
          setEntries(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchLeaderboard();

    return () => {
      mounted = false;
    };
  }, [productId, limitCount]);

  return { entries, loading, error };
}

// ============================================================================
// ACHIEVEMENTS
// ============================================================================

export function useAchievements(orgId?: string) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchAchievements() {
      try {
        setLoading(true);
        const data = await getAchievements(orgId);
        if (mounted) {
          setAchievements(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchAchievements();

    return () => {
      mounted = false;
    };
  }, [orgId]);

  return { achievements, loading, error };
}

// ============================================================================
// INTENTOS DE USUARIO
// ============================================================================

export function useUserAttempts(userId: string | null | undefined, quizId?: string) {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setAttempts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getUserAttempts(userId, quizId);
      setAttempts(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [userId, quizId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { attempts, loading, error, refresh };
}
