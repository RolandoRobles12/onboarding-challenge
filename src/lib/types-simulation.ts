/**
 * Tipos del prototipo de "simulación por nodos": ejercicios donde el vendedor
 * navega una secuencia de capturas reales de una herramienta (HubSpot, Slack,
 * el prototipo de Aviva, etc.) tocando zonas sobre la imagen, en vez de
 * responder una pregunta de opción múltiple.
 *
 * Vive aparte de types-scalable.ts a propósito: es una prueba de concepto
 * standalone, sin conectarse todavía al banco de preguntas, AssessmentConfig,
 * cursos ni rutas de aprendizaje.
 */

import type { Timestamp, FieldValue } from 'firebase/firestore';

export type SimHotspotKind = 'hotspot' | 'checkbox' | 'text';

export interface SimHotspot {
  id: string;
  label: string;
  kind: SimHotspotKind;
  /** Coordenadas en porcentaje del ancho/alto de la imagen (0-100), no píxeles. */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  /**
   * kind 'hotspot': es la zona correcta a tocar para avanzar.
   * kind 'checkbox': debe quedar marcada para que la respuesta cuente como correcta.
   * kind 'text': no aplica.
   */
  isCorrect: boolean;
  /** Solo kind 'hotspot'. Vacío = fin del módulo. */
  nextNodeId?: string;
  /** Mensaje breve al tocar (acierto o error), opcional. */
  feedback?: string;
  /**
   * Solo kind 'text': respuestas aceptadas. Se comparan normalizando
   * mayúsculas, acentos y espacios, para no reprobar por formato.
   * Lista vacía = texto abierto: se guarda pero lo revisa un capacitador,
   * mismo patrón que las preguntas `open_text` del banco.
   */
  validAnswers?: string[];
  /** Solo kind 'text': texto guía dentro del campo. */
  placeholder?: string;
}

export interface SimNode {
  id: string;
  imageUrl: string;
  /** Nota interna para el capacitador, nunca se muestra al vendedor. */
  note?: string;
  hotspots: SimHotspot[];
}

export interface SimModule {
  id: string;
  title: string;
  instructions: string;
  startNodeId: string;
  nodes: SimNode[];
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}

export interface SimTapEvent {
  nodeId: string;
  xPct: number;
  yPct: number;
  hotspotId?: string;
  hit: boolean;
  at: number;
}

export interface SimAttempt {
  id?: string;
  moduleId: string;
  userId?: string;
  userEmail?: string;
  startedAt: Timestamp | FieldValue;
  finishedAt?: Timestamp | FieldValue;
  passed: boolean;
  wrongTaps: number;
  path: string[];
  taps: SimTapEvent[];
  durationMs?: number;
  /** Lo que escribió el vendedor, por id de campo de texto. */
  textAnswers?: Record<string, string>;
  /** true si algún campo de texto era abierto y necesita revisión humana. */
  needsManualReview?: boolean;
}

/**
 * Normaliza texto antes de compararlo: sin espacios sobrantes, sin
 * diferencias de mayúsculas y sin acentos. "Ferretería López " y
 * "ferreteria lopez" cuentan como la misma respuesta.
 */
export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** true si `value` coincide con alguna de las respuestas aceptadas. */
export function matchesValidAnswer(value: string, validAnswers: string[]): boolean {
  const normalized = normalizeAnswer(value);
  return validAnswers.some(a => normalizeAnswer(a) === normalized);
}
