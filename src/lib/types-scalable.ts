/**
 * Tipos TypeScript para Arquitectura Escalable - Desafío Aviva
 * Sistema multi-producto con panel de administración
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// TIPOS BASE Y ENUMS
// ============================================================================

export type UserRole = 'super_admin' | 'admin' | 'trainer' | 'seller';

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type QuestionType = 'single_choice' | 'multiple_choice' | 'tricky';

export type BadgeType =
  | 'first_mission'
  | 'perfectionist'
  | 'speedster'
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  | 'master_level'
  | 'no_errors'
  | 'all_products';

export type AchievementCriteriaType =
  | 'score_threshold'
  | 'time_under'
  | 'no_errors'
  | 'streak_days'
  | 'quizzes_completed'
  | 'product_mastery';

// ============================================================================
// ORGANIZACIÓN Y CONFIGURACIÓN
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  logo?: string;
  primaryColor: string;
  accentColor: string;
  domain: string; // ej: avivacredito.com
  settings: OrganizationSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrganizationSettings {
  allowSelfRegistration: boolean;
  requireEmailVerification: boolean;
  enableAIFeedback: boolean;
  defaultLanguage: string;
  certificateTemplate?: string;
  maxAttemptsPerQuiz: number;
  leaderboardVisibility: 'public' | 'kiosko' | 'private';
}

// ============================================================================
// PRODUCTOS
// ============================================================================

export interface Product {
  id: string;
  organizationId: string;
  name: string; // ej: "Aviva Tu Compra", "Aviva Tu Negocio"
  shortName: string; // ej: "BA", "ATN"
  description: string;
  icon: string; // nombre del icono de lucide-react
  color: string; // color hex para UI
  targetAudience: string; // ej: "Promotores BA"
  active: boolean;
  order: number; // para ordenar en UI
  imageUrl?: string;
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // userId
}

// ============================================================================
// QUIZZES
// ============================================================================

export interface Quiz {
  id: string;
  organizationId: string;
  productId: string;
  title: string;
  description: string;
  difficulty: QuizDifficulty;
  estimatedDuration: number; // minutos
  missions: Mission[];
  totalQuestions: number; // calculado
  active: boolean;
  published: boolean;
  version: number; // para versionado

  // Configuración de gamificación
  gamificationConfig: GamificationConfig;

  // Metadata
  tags: string[];
  prerequisites?: string[]; // IDs de quizzes requeridos
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  publishedAt?: Timestamp;
}

export interface Mission {
  id: string;
  title: string;
  narrative: string;
  description?: string;
  order: number;
  questionIds: string[]; // Referencias a Questions
  maxErrors: number; // máximo de errores permitidos antes de fallar
  bonusPoints?: number; // puntos extra por completar sin errores
  imageUrl?: string;
}

export interface GamificationConfig {
  enableLives: boolean;
  maxLives: number;
  enableBonusLives: boolean; // vidas extra por preguntas tricky
  pointsPerCorrectAnswer: number;
  pointsPerTrickyQuestion: number;
  penaltyPerError: number;
  timeBonus: boolean; // bonus por completar rápido
  enableBadges: boolean;
  badgeIds: string[]; // badges disponibles para este quiz
}

// ============================================================================
// PREGUNTAS
// ============================================================================

export interface Question {
  id: string;
  organizationId: string;
  productId: string;
  text: string;
  explanation?: string; // explicación de la respuesta correcta
  options: QuestionOption[];
  type: QuestionType;
  difficulty: QuizDifficulty;
  tags: string[];
  category?: string;

  // Metadata
  active: boolean;
  timesUsed: number; // contador de usos
  averageCorrectRate: number; // % de aciertos

  // Configuración especial
  isTricky: boolean;
  trickyHint?: string; // pista para preguntas tricky

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
  explanation?: string; // explicación de por qué es correcta/incorrecta
}

// ============================================================================
// USUARIOS Y PERFILES
// ============================================================================

export interface UserProfile {
  uid: string; // ID único de Firebase Auth
  email: string;
  nombre: string;
  rol: UserRole;
  producto?: string; // ID del producto asignado (opcional para admins)

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Interfaz extendida para compatibilidad con código legacy
export interface UserProfileExtended extends UserProfile {
  id: string; // alias de uid para compatibilidad
  organizationId?: string;
  displayName: string; // alias de nombre
  photoURL?: string;
  employeeId?: string;
  assignedKiosko?: string;
  trainerId?: string;
  selectedAvatar?: string;
  level?: number;
  totalXP?: number;
  badges?: string[];
  stats?: UserStats;
  active?: boolean;
  lastLoginAt?: Timestamp;
  role: UserRole; // alias de rol
}

export interface UserStats {
  quizzesCompleted: number;
  quizzesAttempted: number;
  totalScore: number;
  averageScore: number;
  totalTimeSpent: number; // segundos
  perfectScores: number; // cantidad de quizzes con 100%
  currentStreak: number; // días consecutivos
  longestStreak: number;
  favoriteProduct?: string; // productId con más actividad
}

// ============================================================================
// INTENTOS Y RESULTADOS
// ============================================================================

export interface QuizAttempt {
  id: string;
  organizationId: string;
  userId: string;
  quizId: string;
  productId: string;

  // Información del intento
  startedAt: Timestamp;
  completedAt?: Timestamp;
  status: 'in_progress' | 'completed' | 'abandoned';

  // Resultados
  score: number;
  maxScore: number;
  percentage: number;
  timeTaken: number; // segundos
  livesRemaining: number;

  // Respuestas detalladas
  missionResults: MissionResult[];
  answers: QuestionAnswer[];

  // Feedback
  aiFeedback?: string;
  levelAchieved: string; // ej: "Maestro Aviva"
  badgesEarned: string[];
  xpEarned: number;

  // Metadata
  assignedKiosko?: string;
  trainingKiosko?: string;
  trainerName?: string;
}

export interface MissionResult {
  missionId: string;
  missionTitle: string;
  completed: boolean;
  score: number;
  maxScore: number;
  errors: number;
  timeTaken: number;
  failed: boolean; // si se quedó sin vidas
}

export interface QuestionAnswer {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  pointsEarned: number;
  timeSpent: number; // segundos
  wasChanged: boolean; // si cambió su respuesta
  originalAnswerWasCorrect?: boolean; // para análisis de dudas
  trickyBonusEarned: boolean;
}

// ============================================================================
// LEADERBOARD
// ============================================================================

export interface LeaderboardEntry {
  id: string;
  organizationId: string;
  quizId: string;
  productId: string;
  userId: string;

  // Información del usuario
  displayName: string;
  avatar: string;
  assignedKiosko?: string;

  // Métricas
  score: number;
  percentage: number;
  timeTaken: number;
  attemptId: string;
  completedAt: Timestamp;

  // Rankings
  globalRank?: number;
  productRank?: number;
  kioskoRank?: number;
}

// ============================================================================
// ACHIEVEMENTS Y BADGES
// ============================================================================

export interface Achievement {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  icon: string;
  badgeType: BadgeType;
  color: string;

  // Criterios para obtenerlo
  criteria: AchievementCriteria;

  // Recompensas
  xpReward: number;

  // Metadata
  order: number;
  active: boolean;
  createdAt: Timestamp;
}

export interface AchievementCriteria {
  type: AchievementCriteriaType;
  threshold?: number; // ej: score > 90, time < 300
  productId?: string; // para logros específicos de producto
  quizId?: string;
  streakDays?: number;
}

// ============================================================================
// ANALYTICS Y REPORTES
// ============================================================================

export interface QuizAnalytics {
  quizId: string;
  productId: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;

  // Métricas generales
  totalAttempts: number;
  completedAttempts: number;
  averageScore: number;
  averageTime: number;
  completionRate: number;

  // Distribución de scores
  scoreDistribution: {
    '0-60': number;
    '60-75': number;
    '75-90': number;
    '90-100': number;
  };

  // Preguntas problemáticas
  difficultQuestions: QuestionAnalytics[];

  // Por kiosko
  kioskoPerformance: KioskoPerformance[];
}

export interface QuestionAnalytics {
  questionId: string;
  questionText: string;
  timesAsked: number;
  correctAnswers: number;
  incorrectAnswers: number;
  correctRate: number;
  averageTimeSpent: number;

  // Análisis de opciones
  optionDistribution: {
    optionId: string;
    timesSelected: number;
    percentage: number;
  }[];
}

export interface KioskoPerformance {
  kioskoId: string;
  kioskoName: string;
  attempts: number;
  averageScore: number;
  completionRate: number;
  rank: number;
}

// ============================================================================
// ADMIN - WHITELIST
// ============================================================================

export interface WhitelistEntry {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  assignedKiosko?: string;
  addedBy: string;
  addedAt: Timestamp;
  used: boolean; // si ya se registró el usuario
  expiresAt?: Timestamp;
}

// ============================================================================
// TIPOS DE UI Y HELPERS
// ============================================================================

export interface Avatar {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

export interface MasteryLevel {
  id: string;
  name: string;
  minPercentage: number;
  maxPercentage: number;
  description: string;
  color: string;
  icon: string;
}

// ============================================================================
// TIPOS PARA FORMULARIOS Y BUILDERS
// ============================================================================

export interface QuizBuilderState {
  quiz: Partial<Quiz>;
  missions: Mission[];
  selectedQuestions: Question[];
  unsavedChanges: boolean;
}

export interface ProductFormData {
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  targetAudience: string;
  tags: string[];
  imageUrl?: string;
}

export interface QuestionFormData {
  text: string;
  explanation?: string;
  type: QuestionType;
  difficulty: QuizDifficulty;
  options: Omit<QuestionOption, 'id'>[];
  tags: string[];
  category?: string;
  isTricky: boolean;
  trickyHint?: string;
}

// ============================================================================
// TIPOS PARA REQUESTS API
// ============================================================================

export interface CreateQuizRequest {
  productId: string;
  title: string;
  description: string;
  difficulty: QuizDifficulty;
  missions: Omit<Mission, 'id'>[];
  gamificationConfig: GamificationConfig;
  tags: string[];
}

export interface UpdateQuizRequest extends Partial<CreateQuizRequest> {
  quizId: string;
  version: number; // para control de versiones
}

export interface SubmitQuizRequest {
  quizId: string;
  answers: QuestionAnswer[];
  timeTaken: number;
  assignedKiosko?: string;
  trainingKiosko?: string;
  trainerName?: string;
}

// ============================================================================
// TIPOS PARA RESPUESTAS API
// ============================================================================

export interface QuizSubmissionResponse {
  attemptId: string;
  score: number;
  percentage: number;
  levelAchieved: string;
  aiFeedback?: string;
  badgesEarned: Achievement[];
  xpEarned: number;
  newLevel?: number;
  leaderboardRank: number;
}

// ============================================================================
// TIPOS PARA DASHBOARD ANALYTICS
// ============================================================================

export interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number; // últimos 7 días
  totalQuizzes: number;
  totalAttempts: number;
  averageCompletionRate: number;
  averageScore: number;

  // Tendencias
  userGrowth: number; // % cambio vs período anterior
  attemptGrowth: number;
  scoreImprovement: number;

  // Por producto
  productMetrics: {
    productId: string;
    productName: string;
    attempts: number;
    averageScore: number;
  }[];

  // Timeline
  dailyActivity: {
    date: string;
    attempts: number;
    completions: number;
    averageScore: number;
  }[];
}

export interface TrainerDashboardData {
  trainerId: string;
  kiosko: string;

  // Métricas del equipo
  totalSellers: number;
  activeSellers: number; // últimos 7 días
  averageScore: number;
  completionRate: number;

  // Ranking
  kioskoRank: number;
  totalKioskos: number;

  // Vendedores
  sellerPerformance: {
    userId: string;
    displayName: string;
    quizzesCompleted: number;
    averageScore: number;
    lastActivity: Timestamp;
    needsAttention: boolean; // score bajo o inactivo
  }[];

  // Comparativa
  comparisonData: {
    kioskoId: string;
    kioskoName: string;
    averageScore: number;
    completionRate: number;
  }[];
}
