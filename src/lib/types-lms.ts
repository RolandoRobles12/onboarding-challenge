/**
 * Tipos TypeScript para Aviva LMS
 * Módulos: Cursos, Lecciones, Rutas de Aprendizaje, Inscripciones, Certificaciones
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// TIPOS BASE LMS
// ============================================================================

export type LessonType =
  | 'video'
  | 'slides'      // Presentación con narración
  | 'document'    // PDF, DOC, PPT
  | 'html'        // Página HTML / texto enriquecido
  | 'embedded'    // iFrame / contenido externo
  | 'audio'
  | 'scorm';

export type CourseStatus = 'draft' | 'published' | 'archived';

export type EnrollmentStatus = 'enrolled' | 'in_progress' | 'completed' | 'expired';

export type ContentNavigation = 'sequential' | 'free';

export type RecurrenceType = 'none' | 'monthly' | 'quarterly' | 'biannual' | 'annual';

export type LMSModule =
  | 'challenges'      // Desafíos (quiz gamificado)
  | 'courses'         // Cursos estructurados con lecciones
  | 'learning_paths'  // Rutas de aprendizaje secuenciales
  | 'certifications'; // Gestión y visualización de certificados

// ============================================================================
// CURSO (Course Container)
// ============================================================================

export interface Course {
  id: string;
  organizationId: string;
  productId?: string;           // Asociación opcional con producto Aviva

  // Metadatos
  title: string;
  description: string;
  thumbnail?: string;
  tags: string[];
  category: string;

  // Estructura pedagógica
  modules: CourseModule[];

  // Configuración de navegación
  navigation: ContentNavigation;
  prerequisiteCourseIds: string[];

  // Restricciones temporales
  durationDays?: number;        // Días máximos para completar
  expiresAt?: Timestamp;

  // Audiencia
  targetRoles: string[];
  branchIds: string[];

  // Certificación
  certificateTemplate?: string;
  passingScore?: number;        // % mínimo para aprobar

  // Re-certificación
  recertification: RecertificationConfig;

  // Estado y autoría
  status: CourseStatus;
  authorId: string;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

// ============================================================================
// MÓDULO DE CURSO (Sección / Capítulo)
// ============================================================================

export interface CourseModule {
  id: string;
  title: string;
  description?: string;
  order: number;
  lessons: Lesson[];
  prerequisiteModuleIds: string[];
  isOptional: boolean;
  /** Quiz/evaluación que se muestra al finalizar todas las lecciones del módulo. */
  assessmentQuizId?: string;
}

// ============================================================================
// LECCIÓN
// ============================================================================

export interface Lesson {
  id: string;
  moduleId: string;
  courseId: string;

  title: string;
  description?: string;
  type: LessonType;
  order: number;

  content: LessonContent;

  estimatedDuration?: number;   // Minutos

  /** Quiz/evaluación que se muestra al finalizar esta lección (opcional). */
  assessmentQuizId?: string;

  // Configuración
  isRequired: boolean;
  isFreePreview: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LessonContent {
  // Video
  videoUrl?: string;
  videoDuration?: number;       // Segundos

  // Slides
  slidesUrl?: string;
  slidesCount?: number;

  // Documento
  documentUrl?: string;
  documentType?: 'pdf' | 'doc' | 'ppt' | 'other';

  // HTML / texto enriquecido
  htmlContent?: string;

  // iFrame / embebido
  embedUrl?: string;
  embedHeight?: number;

  // Audio
  audioUrl?: string;
  audioDuration?: number;

  // SCORM
  scormPackageUrl?: string;
  scormVersion?: '1.2' | '2004';

  // Recursos adicionales
  attachments?: LessonAttachment[];
}

export interface LessonAttachment {
  name: string;
  url: string;
  type: string;
  sizeKb?: number;
}

// ============================================================================
// RE-CERTIFICACIÓN
// ============================================================================

export interface RecertificationConfig {
  enabled: boolean;
  recurrenceType: RecurrenceType;
  intervalDays?: number;
  notifyDaysBefore: number;
  autoReassign: boolean;
}

// ============================================================================
// INSCRIPCIÓN DE USUARIO (Enrollment)
// ============================================================================

export interface CourseEnrollment {
  id: string;
  userId: string;
  courseId: string;
  learningPathId?: string;
  organizationId: string;

  status: EnrollmentStatus;

  completedLessonIds: string[];
  completedModuleIds: string[];
  lastAccessedAt?: Timestamp;

  overallScore?: number;

  certificateId?: string;
  certificateIssuedAt?: Timestamp;
  certificateExpiresAt?: Timestamp;

  renewalDueAt?: Timestamp;

  assignedBy?: string;
  assignedAt: Timestamp;
  dueDate?: Timestamp;

  enrolledAt: Timestamp;
  completedAt?: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PROGRESO DE LECCIÓN
// ============================================================================

export interface LessonProgress {
  id: string;
  userId: string;
  lessonId: string;
  courseId: string;
  enrollmentId: string;

  status: 'not_started' | 'in_progress' | 'completed';
  progressPercentage: number;

  lastPosition?: number;        // Para video/audio (segundos)

  startedAt?: Timestamp;
  completedAt?: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// CONFIGURACIÓN DE MÓDULOS LMS (para UI)
// ============================================================================

export interface LMSModuleCard {
  id: LMSModule;
  title: string;
  description: string;
  icon: string;                 // nombre de icono lucide-react
  href: string;
  color: string;
  gradient: string;
  status: 'active' | 'coming_soon' | 'beta';
  adminHref?: string;
  stats?: {
    label: string;
    value: string | number;
  };
}
