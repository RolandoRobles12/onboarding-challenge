import type { QuestionOption } from './types-scalable';

/**
 * Garantiza que cada opción tenga un `id` único.
 *
 * El Pulso identifica la opción elegida por su id. Las preguntas creadas desde
 * el panel antes de esta corrección se guardaron sin ids: al leerlas reciben
 * `opt_<posición>`, el mismo id que se les asigna si se vuelven a guardar, así
 * que las respuestas ya registradas siguen apuntando a la opción correcta.
 */
export function withOptionIds<T extends Partial<QuestionOption>>(options: T[] | undefined): (T & { id: string })[] {
  const list = options ?? [];
  const used = new Set(list.map(o => o.id).filter((id): id is string => !!id));
  return list.map((opt, i) => {
    if (opt.id) return opt as T & { id: string };
    let id = `opt_${i}`;
    while (used.has(id)) id = `opt_${i}_${Math.random().toString(36).slice(2, 7)}`;
    used.add(id);
    return { ...opt, id };
  });
}
