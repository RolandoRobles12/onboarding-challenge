import type { Journey, JourneyStage, JourneyStep } from './types-scalable';

/** Etapas de la ruta en orden (soporta stages[] y el modelo legacy steps[]). */
export function journeyStages(journey: Journey): JourneyStage[] {
  if (journey.stages?.length) return [...journey.stages].sort((a, b) => a.order - b.order);
  if (journey.steps?.length) {
    return [{
      id: 'legacy', order: 0, title: journey.name || 'Mi Ruta', required: true,
      actions: [...journey.steps].sort((a, b) => a.order - b.order),
    }];
  }
  return [];
}

export function journeySteps(journey: Journey): JourneyStep[] {
  return journeyStages(journey).flatMap(s => s.actions ?? []);
}

/**
 * Si un paso ya está disponible para el vendedor, con el mismo criterio que la
 * ruta en la pantalla de inicio: las etapas visibles anteriores deben tener sus
 * acciones obligatorias completas y, dentro de su etapa, el paso debe ser el
 * primero sin completar.
 */
export function isJourneyStepUnlocked(journey: Journey, stepId: string, completedIds: Set<string>): boolean {
  if (completedIds.has(stepId)) return true;
  const stages = journeyStages(journey).filter(s => s.visible !== false);
  const stageIdx = stages.findIndex(s => s.actions.some(a => a.id === stepId));
  if (stageIdx === -1) return false;
  const isStageDone = (s: JourneyStage) =>
    s.actions.length === 0 || s.actions.filter(a => a.required).every(a => completedIds.has(a.id));
  if (!stages.slice(0, stageIdx).every(isStageDone)) return false;
  const firstIncomplete = stages[stageIdx].actions.find(a => !completedIds.has(a.id));
  return firstIncomplete?.id === stepId;
}
