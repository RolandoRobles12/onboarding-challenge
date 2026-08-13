/**
 * Motor de "simulaciones por nodos": ejercicios donde el vendedor opera una
 * herramienta real (HubSpot, Slack, el prototipo de Aviva) navegando capturas
 * de pantalla, en vez de responder opción múltiple.
 *
 * La idea de fondo es emular el uso de la herramienta, no adivinar la zona
 * correcta. Por eso el modelo es un grafo y no una lista:
 *
 *  - Cualquier zona puede llevar a otra pantalla (`goToNodeId`), sea o no el
 *    paso esperado. Tocar el botón equivocado te lleva a donde de verdad te
 *    llevaría la herramienta, y tienes que darte cuenta y regresar. Eso es lo
 *    que se está evaluando.
 *  - `isCorrect` marca cuál es el paso esperado, que sirve para calificar y
 *    para calcular la ruta óptima — no para decidir si la zona "funciona".
 *  - Una pantalla marcada con `isSuccess` termina el módulo al llegar a ella:
 *    la simulación acaba viendo la pantalla de confirmación real, como en la
 *    herramienta de verdad.
 *
 * Compatibilidad: los módulos del prototipo original usaban `nextNodeId` y
 * "zona correcta sin destino = fin del módulo". `resolveHotspotStep` sigue
 * respetando esa semántica, así que los módulos ya creados siguen corriendo
 * sin migración.
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
   * kind 'hotspot': es el paso esperado en esta pantalla.
   * kind 'checkbox': debe quedar marcada para poder avanzar.
   * kind 'text': no aplica.
   */
  isCorrect: boolean;
  /**
   * A dónde lleva esta zona al tocarla, sea o no el paso esperado. Es lo que
   * permite que un toque equivocado navegue a la pantalla que realmente
   * saldría en la herramienta. Vacío = no lleva a ningún lado.
   */
  goToNodeId?: string;
  /** Legado del primer prototipo; equivale a `goToNodeId`. */
  nextNodeId?: string;
  /**
   * Tocar esta zona (o confirmar este campo) cierra el módulo.
   *
   * Es explícito a propósito. En la primera versión, "zona esperada sin
   * destino" significaba terminar, y como toda zona nueva nace sin destino,
   * cualquier zona a medio configurar terminaba el ejercicio de golpe. Ahora
   * terminar es una decisión que se toma, no lo que pasa por omisión.
   */
  endsModule?: boolean;
  /** Mensaje breve al tocar, opcional. */
  feedback?: string;
  /** Pista de esta zona, se muestra sólo si el vendedor la pide. */
  hint?: string;
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
  /** Ruta en Storage, para poder borrar la captura junto con el módulo. */
  imagePath?: string;
  /** Nota interna para el capacitador, nunca se muestra al vendedor. */
  note?: string;
  /** Objetivo visible de este paso: "Abre el filtro de negocios". */
  goal?: string;
  /** Pista del paso, se muestra sólo si el vendedor la pide. */
  hint?: string;
  /** Llegar a esta pantalla termina el módulo con éxito. */
  isSuccess?: boolean;
  hotspots: SimHotspot[];
}

export interface SimModule {
  id: string;
  title: string;
  instructions: string;
  startNodeId: string;
  nodes: SimNode[];
  active: boolean;
  /** Errores permitidos para aprobar. undefined = usa DEFAULT_MAX_WRONG_TAPS. */
  maxWrongTaps?: number;
  /** Permite regresar a la pantalla anterior. undefined = permitido. */
  allowBack?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}

/**
 * Qué fue cada toque:
 *  - expected: el paso esperado.
 *  - detour:   una zona real que lleva a otra pantalla, pero no era el paso.
 *  - wrong:    tocó algo que no procede (o le falta llenar la pantalla).
 *  - toggle:   marcó/desmarcó una casilla.
 *  - miss:     tocó donde no hay nada. No penaliza: explorar es parte del uso.
 */
export type SimTapKind = 'expected' | 'detour' | 'wrong' | 'toggle' | 'miss';

export interface SimTapEvent {
  nodeId: string;
  xPct: number;
  yPct: number;
  hotspotId?: string;
  kind: SimTapKind;
  /** Legado: equivale a kind 'expected' | 'detour' | 'toggle'. */
  hit: boolean;
  at: number;
}

export type SimAttemptState = 'in_progress' | 'completed' | 'abandoned';
export type SimOutcome = 'passed' | 'failed' | 'pending_review';

export interface SimAttempt {
  id?: string;
  moduleId: string;
  moduleTitle?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  startedAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  finishedAt?: Timestamp | FieldValue;
  /** El intento se crea al empezar, así que abandonar también deja registro. */
  state: SimAttemptState;
  outcome?: SimOutcome;
  passed: boolean;
  wrongTaps: number;
  hintsUsed: number;
  /** Toques que avanzaron de pantalla (esperados + desvíos). */
  stepsTaken: number;
  /** Pasos de la ruta óptima, para medir eficiencia. */
  optimalSteps?: number;
  path: string[];
  /** Dónde se quedó: la pantalla donde abandonó o terminó. */
  lastNodeId?: string;
  taps: SimTapEvent[];
  durationMs?: number;
  /** Lo que escribió el vendedor, por id de campo de texto. */
  textAnswers?: Record<string, string>;
  /** true si algún campo de texto era abierto y necesita revisión humana. */
  needsManualReview?: boolean;
}

/** Errores permitidos por defecto antes de reprobar un intento. */
export const DEFAULT_MAX_WRONG_TAPS = 3;

/**
 * Tope de toques guardados por intento. Un vendedor atorado puede picar la
 * pantalla decenas de veces y un documento de Firestore no pasa de 1 MB;
 * guardamos los últimos, que son los que dicen dónde se atoró.
 */
export const MAX_STORED_TAPS = 300;

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

export type SimStep =
  | { type: 'go'; nodeId: string }
  | { type: 'finish' }
  | { type: 'blocked' };

/**
 * Qué hace una zona al tocarla. `blocked` significa que no lleva a ningún
 * lado: en la herramienta real, ese toque no haría nada.
 */
export function resolveHotspotStep(hotspot: SimHotspot): SimStep {
  const target = hotspot.goToNodeId || hotspot.nextNodeId;
  if (target) return { type: 'go', nodeId: target };
  if (hotspot.endsModule) return { type: 'finish' };
  // Módulos del primer prototipo, que nunca pasaron por el editor nuevo: ahí
  // "zona esperada sin destino" sí quería decir fin del módulo.
  if (hotspot.endsModule === undefined && hotspot.kind === 'hotspot' && hotspot.isCorrect) {
    return { type: 'finish' };
  }
  return { type: 'blocked' };
}

/**
 * Deja explícito el `endsModule` de los módulos viejos, para que al reeditarlos
 * en el editor nuevo sigan terminando donde terminaban.
 */
export function normalizeHotspots(nodes: SimNode[]): SimNode[] {
  return nodes.map(node => ({
    ...node,
    hotspots: node.hotspots.map(hotspot => hotspot.endsModule !== undefined ? hotspot : {
      ...hotspot,
      endsModule: resolveHotspotStep(hotspot).type === 'finish',
    }),
  }));
}

/** true si llegar a esta pantalla termina el módulo. */
export function isFinishNode(node: SimNode): boolean {
  return node.isSuccess === true;
}

/**
 * Zonas por las que sale la ruta esperada de una pantalla.
 *
 * Incluye los campos de texto con destino: escribir y confirmar es una forma
 * legítima de avanzar —es lo que se hace en la herramienta real— y sin esto
 * una pantalla de captura no tendría cómo continuar.
 */
export function expectedExits(node: SimNode): SimHotspot[] {
  return node.hotspots.filter(hotspot => {
    if (hotspot.kind === 'hotspot') return hotspot.isCorrect;
    if (hotspot.kind === 'text') return resolveHotspotStep(hotspot).type !== 'blocked';
    return false;
  });
}

/** La zona que representa el paso esperado de una pantalla, si existe. */
export function expectedHotspot(node: SimNode): SimHotspot | undefined {
  return expectedExits(node)[0];
}

/**
 * true si esta pantalla le pide algo al vendedor antes de poder cerrarse
 * (llenar un campo, marcar una casilla).
 *
 * Una pantalla final con campos no puede terminar sola al llegar: acabaría el
 * ejercicio antes de dejarlo escribir.
 */
export function nodeNeedsInput(node: SimNode): boolean {
  return node.hotspots.some(h => h.kind === 'text' || h.kind === 'checkbox');
}

export interface SimExpectedPath {
  /** Pantallas por las que pasa la ruta esperada. */
  nodes: string[];
  /** Toques que hacen falta para completarla. */
  steps: number;
  /** Pantallas de la ruta. Es el número que ve el vendedor: "paso 2 de 4". */
  screens: number;
}

/**
 * Ruta más corta siguiendo únicamente los pasos esperados. Sirve para dos
 * cosas: medir qué tan directo fue el vendedor y avisarle al capacitador que
 * su módulo no tiene salida.
 */
export function findExpectedPath(module: Pick<SimModule, 'nodes' | 'startNodeId'>): SimExpectedPath | null {
  const byId = new Map(module.nodes.map(n => [n.id, n]));
  const start = byId.has(module.startNodeId) ? module.startNodeId : module.nodes[0]?.id;
  if (!start) return null;

  const queue: string[][] = [[start]];
  const seen = new Set<string>([start]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const node = byId.get(path[path.length - 1]);
    if (!node) continue;

    // Llegar a la pantalla de éxito no requiere un toque extra.
    if (isFinishNode(node)) return { nodes: path, steps: path.length - 1, screens: path.length };

    for (const hotspot of expectedExits(node)) {
      const step = resolveHotspotStep(hotspot);
      // Terminar tocando la zona sí cuenta como un toque más.
      if (step.type === 'finish') return { nodes: path, steps: path.length, screens: path.length };
      if (step.type === 'go' && byId.has(step.nodeId) && !seen.has(step.nodeId)) {
        seen.add(step.nodeId);
        queue.push([...path, step.nodeId]);
      }
    }
  }
  return null;
}

/** Pantallas a las que se puede llegar desde el inicio por cualquier camino. */
export function reachableNodeIds(module: Pick<SimModule, 'nodes' | 'startNodeId'>): Set<string> {
  const byId = new Map(module.nodes.map(n => [n.id, n]));
  const start = byId.has(module.startNodeId) ? module.startNodeId : module.nodes[0]?.id;
  const seen = new Set<string>();
  if (!start) return seen;

  const stack = [start];
  seen.add(start);
  while (stack.length > 0) {
    const node = byId.get(stack.pop()!);
    if (!node) continue;
    for (const hotspot of node.hotspots) {
      const step = resolveHotspotStep(hotspot);
      if (step.type === 'go' && byId.has(step.nodeId) && !seen.has(step.nodeId)) {
        seen.add(step.nodeId);
        stack.push(step.nodeId);
      }
    }
  }
  return seen;
}

export interface SimModuleIssues {
  /** Impiden que el módulo se pueda jugar. */
  errors: string[];
  /** No lo rompen, pero casi siempre son un descuido. */
  warnings: string[];
}

/**
 * Revisa un módulo antes de guardarlo. Sin esto es fácil publicar una
 * simulación donde el vendedor queda atorado sin salida y sin saber por qué.
 */
export function findModuleIssues(module: Pick<SimModule, 'nodes' | 'startNodeId'>): SimModuleIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(module.nodes.map(n => [n.id, n]));
  const label = (id: string) => {
    const index = module.nodes.findIndex(n => n.id === id);
    return index >= 0 ? `Pantalla ${index + 1}` : 'una pantalla eliminada';
  };

  if (module.nodes.length === 0) {
    errors.push('El módulo no tiene ninguna pantalla.');
    return { errors, warnings };
  }
  if (!byId.has(module.startNodeId)) {
    errors.push('La pantalla inicial no existe. Elige con cuál empieza el módulo.');
  }
  if (!findExpectedPath(module)) {
    errors.push(
      'No hay una ruta esperada que termine el módulo. Marca la última pantalla como "Pantalla final" ' +
      'o deja una zona esperada sin destino para cerrar el ejercicio.'
    );
  }

  const reachable = reachableNodeIds(module);
  for (const node of module.nodes) {
    const name = label(node.id);

    if (!reachable.has(node.id)) {
      warnings.push(`${name} no se alcanza desde la pantalla inicial: nadie va a verla.`);
    }
    if (!isFinishNode(node) && node.hotspots.length === 0) {
      warnings.push(`${name} no tiene zonas ni está marcada como final: el vendedor se queda atorado ahí.`);
    }
    if (!isFinishNode(node) && node.hotspots.length > 0 && expectedExits(node).length === 0) {
      const hasFields = node.hotspots.some(h => h.kind === 'text');
      warnings.push(hasFields
        ? `${name} tiene campos que llenar pero ninguna salida: conecta el campo —o el botón de la ` +
          'captura— a la siguiente pantalla, si no el vendedor se queda ahí.'
        : `${name} no tiene un paso esperado: no hay forma de avanzar correctamente.`);
    }

    for (const hotspot of node.hotspots) {
      const target = hotspot.goToNodeId || hotspot.nextNodeId;
      if (target && !byId.has(target)) {
        warnings.push(`En ${name}, la zona "${hotspot.label}" lleva a una pantalla que ya no existe.`);
      }
      if (hotspot.kind === 'hotspot' && !hotspot.isCorrect && !target && !hotspot.endsModule && !hotspot.feedback) {
        warnings.push(
          `En ${name}, la zona "${hotspot.label}" no lleva a ningún lado ni tiene retroalimentación: ` +
          'al tocarla no pasa nada.'
        );
      }
      if (hotspot.kind === 'text' && (hotspot.validAnswers?.length ?? 0) === 0) {
        warnings.push(`En ${name}, el campo "${hotspot.label}" es abierto: el intento quedará pendiente de revisión.`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Qué provoca un toque. Es la regla central del ejercicio, por eso vive aquí
 * como función pura y no dentro del componente: se puede leer y probar sola.
 */
export type SimTapOutcome =
  /** Cayó donde no hay nada. No penaliza. */
  | { kind: 'miss' }
  /** Marcó o desmarcó una casilla. */
  | { kind: 'toggle'; hotspotId: string }
  /** El paso esperado, y lleva a otra pantalla. */
  | { kind: 'expected'; nodeId: string }
  /** El paso esperado, y con él termina el módulo. */
  | { kind: 'finish' }
  /** Zona real pero equivocada: navega a donde llevaría de verdad. */
  | { kind: 'detour'; nodeId: string; message: string }
  /** Error: no procede, o falta algo en la pantalla. */
  | { kind: 'wrong'; message: string; textErrors?: Record<string, string> }
  /** El módulo está mal armado; no es culpa del vendedor y no se le cobra. */
  | { kind: 'broken'; message: string };

export function decideTap(input: {
  node: SimNode;
  hotspot: SimHotspot | null;
  /** Casillas marcadas en esta pantalla. */
  checked: string[];
  texts: Record<string, string>;
  nodeExists: (nodeId: string) => boolean;
  /**
   * 'tap' es un toque sobre la captura. 'submit' es confirmar un campo de
   * texto (Enter o el botón del teclado), que es como se avanza en una
   * pantalla de captura.
   */
  via?: 'tap' | 'submit';
}): SimTapOutcome {
  const { node, hotspot, checked, texts, nodeExists, via = 'tap' } = input;

  // Tocar el vacío no penaliza: explorar es parte de aprender una herramienta.
  if (!hotspot) return { kind: 'miss' };

  if (hotspot.kind === 'text') {
    // El borde del campo no hace nada; el input de encima maneja lo suyo.
    if (via !== 'submit') return { kind: 'miss' };
    const textStep = resolveHotspotStep(hotspot);
    // Un campo que sólo se llena no avanza: lo hará el botón de la pantalla.
    if (textStep.type === 'blocked') return { kind: 'miss' };
    const missing = findPendingWork(node, checked, texts);
    if (missing) return missing;
    if (textStep.type === 'finish') return { kind: 'finish' };
    if (nodeExists(textStep.nodeId)) return { kind: 'expected', nodeId: textStep.nodeId };
    return { kind: 'broken', message: 'Este campo no lleva a ningún lado. Avísale a tu capacitador.' };
  }

  if (hotspot.kind === 'checkbox') return { kind: 'toggle', hotspotId: hotspot.id };

  const step = resolveHotspotStep(hotspot);

  if (!hotspot.isCorrect) {
    if (step.type === 'go' && nodeExists(step.nodeId)) {
      return {
        kind: 'detour',
        nodeId: step.nodeId,
        message: hotspot.feedback || 'Este no era el camino. Fíjate dónde quedaste.',
      };
    }
    return { kind: 'wrong', message: hotspot.feedback || 'Ahí no pasa nada. Busca otro camino.' };
  }

  const pending = findPendingWork(node, checked, texts);
  if (pending) return pending;

  if (step.type === 'finish') return { kind: 'finish' };
  if (step.type === 'go' && nodeExists(step.nodeId)) return { kind: 'expected', nodeId: step.nodeId };

  return { kind: 'broken', message: 'Esta pantalla no lleva a ningún lado. Avísale a tu capacitador.' };
}

/** Lo que falta llenar o corregir en una pantalla antes de poder avanzar. */
export function findPendingWork(
  node: SimNode,
  checked: string[],
  texts: Record<string, string>,
): Extract<SimTapOutcome, { kind: 'wrong' }> | null {
  const boxes = node.hotspots.filter(h => h.kind === 'checkbox');
  if (boxes.length > 0 && !boxes.every(h => checked.includes(h.id) === h.isCorrect)) {
    return { kind: 'wrong', message: 'Revisa lo que marcaste antes de continuar.' };
  }

  const fields = node.hotspots.filter(h => h.kind === 'text');
  const textErrors: Record<string, string> = {};
  for (const field of fields) {
    const value = texts[field.id] || '';
    if (!value.trim()) {
      textErrors[field.id] = 'Falta llenar este campo.';
    } else if ((field.validAnswers?.length ?? 0) > 0 && !matchesValidAnswer(value, field.validAnswers!)) {
      textErrors[field.id] = field.feedback || 'Revisa lo que escribiste.';
    }
  }

  const firstBad = fields.find(field => textErrors[field.id]);
  if (!firstBad) return null;

  return {
    kind: 'wrong',
    message: texts[firstBad.id]?.trim()
      ? `Revisa lo que escribiste en "${firstBad.label}".`
      : `Falta llenar "${firstBad.label}".`,
    textErrors,
  };
}

export interface SimEvaluation {
  outcome: SimOutcome;
  passed: boolean;
  /** 0-100. Toques con intención que fueron el paso esperado. */
  accuracy: number;
  /** 0-100. Pasos óptimos entre pasos dados. null si no hay ruta esperada. */
  efficiency: number | null;
}

/**
 * Califica un intento terminado. El criterio es explícito a propósito: se
 * aprueba por número de errores, no por una fórmula que nadie pueda explicarle
 * al vendedor.
 */
export function evaluateAttempt(input: {
  wrongTaps: number;
  stepsTaken: number;
  optimalSteps?: number | null;
  maxWrongTaps?: number;
  needsManualReview?: boolean;
}): SimEvaluation {
  const limit = input.maxWrongTaps ?? DEFAULT_MAX_WRONG_TAPS;
  const passed = input.wrongTaps <= limit;
  const intentional = input.stepsTaken + input.wrongTaps;
  const accuracy = intentional > 0 ? Math.round((input.stepsTaken / intentional) * 100) : 100;
  const efficiency = input.optimalSteps && input.stepsTaken > 0
    ? Math.min(100, Math.round((input.optimalSteps / input.stepsTaken) * 100))
    : null;

  return {
    outcome: !passed ? 'failed' : input.needsManualReview ? 'pending_review' : 'passed',
    passed,
    accuracy,
    efficiency,
  };
}
