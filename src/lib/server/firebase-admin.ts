/**
 * Firebase Admin SDK (solo servidor).
 *
 * Las rutas de /api usan este SDK en lugar del SDK de cliente: corre con la
 * cuenta de servicio del backend (App Hosting la provee sola), así que no
 * depende de las reglas de Firestore, que bloquean el acceso sin sesión.
 *
 * En desarrollo local con un proyecto "demo-*" se conecta a los emuladores,
 * igual que src/lib/firebase.ts.
 */

import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (PROJECT_ID?.startsWith('demo-')) {
    process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= 'localhost:9099';
  }
  return initializeApp(PROJECT_ID ? { projectId: PROJECT_ID } : undefined);
}

let settingsApplied = false;

export function adminDb() {
  const db = getFirestore(adminApp());
  if (!settingsApplied) {
    settingsApplied = true;
    // Campos opcionales sin valor se omiten en vez de fallar la escritura.
    // (Si el módulo se recarga en desarrollo, la instancia ya tiene la opción.)
    try { db.settings({ ignoreUndefinedProperties: true }); } catch { /* ya configurado */ }
  }
  return db;
}

export function adminAuth() {
  return getAuth(adminApp());
}
