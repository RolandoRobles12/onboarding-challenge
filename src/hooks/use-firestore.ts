/**
 * Hooks personalizados para trabajar con Firestore
 */

import { useState, useEffect, useCallback } from 'react';
import type { Product, Quiz, Question } from '@/lib/types-scalable';
import { getProducts, getQuizzes, getQuestions } from '@/lib/firestore-service';

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


// ============================================================================
// PERFIL DE USUARIO
// ============================================================================


// ============================================================================
// LEADERBOARD
// ============================================================================



// ============================================================================
// ACHIEVEMENTS
// ============================================================================


// ============================================================================
// INTENTOS DE USUARIO
// ============================================================================

