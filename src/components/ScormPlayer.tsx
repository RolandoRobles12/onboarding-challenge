'use client';

import { useEffect, useRef, useState } from 'react';
import { getLessonProgress, upsertLessonProgress } from '@/lib/firestore-service';

type CmiData = Record<string, string>;

interface ScormPlayerProps {
  src: string;
  version: '1.2' | '2004';
  title: string;
  userId: string;
  userName: string;
  lessonId: string;
  courseId: string;
  enrollmentId: string;
  isCompleted: boolean;
  onComplete: () => void;
  style?: React.CSSProperties;
}

const NO_ERROR = '0';

/**
 * Reproduce un paquete SCORM 1.2 o 2004. Expone en `window` la API que el
 * paquete busca (`API` o `API_1484_11`), guarda sus datos (avance, ubicación,
 * puntaje) en lesson_progress para retomarlo, y completa la lección cuando el
 * paquete reporta "completed" o "passed".
 */
export function ScormPlayer(props: ScormPlayerProps) {
  const { src, version, title, style } = props;
  const [ready, setReady] = useState(false);
  const data = useRef<CmiData>({});
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    let cancelled = false;
    const p = propsRef.current;
    const is2004 = version === '2004';
    let lastError = NO_ERROR;

    const save = (finished: boolean) => {
      const cur = propsRef.current;
      const d = data.current;
      const status = is2004 ? (d['cmi.completion_status'] ?? '') : (d['cmi.core.lesson_status'] ?? '');
      const success = is2004 ? (d['cmi.success_status'] ?? '') : '';
      const done = status === 'completed' || status === 'passed' || success === 'passed';
      upsertLessonProgress({
        userId: cur.userId,
        lessonId: cur.lessonId,
        courseId: cur.courseId,
        enrollmentId: cur.enrollmentId,
        status: done ? 'completed' : 'in_progress',
        progressPercentage: done ? 100 : 50,
        scormData: d,
      }).catch(err => console.error('[scorm] no se pudo guardar el avance:', err));
      if (done && !cur.isCompleted) cur.onComplete();
      if (finished) data.current = { ...d };
    };

    const get = (key: string) => {
      lastError = NO_ERROR;
      return data.current[key] ?? '';
    };
    const set = (key: string, value: string) => {
      lastError = NO_ERROR;
      data.current[key] = String(value);
      return 'true';
    };

    getLessonProgress(p.userId, p.lessonId).catch(() => null).then(progress => {
      if (cancelled) return;
      const saved = progress?.scormData ?? {};
      const resume = Object.keys(saved).length > 0;
      data.current = is2004
        ? {
            'cmi.learner_id': p.userId,
            'cmi.learner_name': p.userName,
            'cmi.completion_status': 'unknown',
            'cmi.success_status': 'unknown',
            'cmi.mode': 'normal',
            ...saved,
            'cmi.entry': resume ? 'resume' : 'ab-initio',
          }
        : {
            'cmi.core.student_id': p.userId,
            'cmi.core.student_name': p.userName,
            'cmi.core.lesson_status': 'not attempted',
            'cmi.core.lesson_mode': 'normal',
            'cmi.core.credit': 'credit',
            ...saved,
            'cmi.core.entry': resume ? 'resume' : 'ab-initio',
          };

      const w = window as unknown as Record<string, unknown>;
      if (is2004) {
        w.API_1484_11 = {
          Initialize: () => 'true',
          Terminate: () => { save(true); return 'true'; },
          GetValue: get,
          SetValue: set,
          Commit: () => { save(false); return 'true'; },
          GetLastError: () => lastError,
          GetErrorString: () => '',
          GetDiagnostic: () => '',
        };
      } else {
        w.API = {
          LMSInitialize: () => 'true',
          LMSFinish: () => { save(true); return 'true'; },
          LMSGetValue: get,
          LMSSetValue: set,
          LMSCommit: () => { save(false); return 'true'; },
          LMSGetLastError: () => lastError,
          LMSGetErrorString: () => '',
          LMSGetDiagnostic: () => '',
        };
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (Object.keys(data.current).length > 0) save(true);
      const w = window as unknown as Record<string, unknown>;
      delete w.API;
      delete w.API_1484_11;
    };
  }, [src, version]);

  if (!ready) return <div className="w-full rounded-xl bg-muted animate-pulse" style={style} />;
  return <iframe src={src} title={title} className="w-full rounded-xl border bg-white" style={style} allow="autoplay; fullscreen" />;
}
