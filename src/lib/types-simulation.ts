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

export type SimHotspotKind = 'hotspot' | 'checkbox';

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
   */
  isCorrect: boolean;
  /** Solo kind 'hotspot'. Vacío = fin del módulo. */
  nextNodeId?: string;
  /** Mensaje breve al tocar (acierto o error), opcional. */
  feedback?: string;
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
}
