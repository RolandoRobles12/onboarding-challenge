/**
 * Migración: actualiza organizationId en intentos de quiz guardados con 'default'
 *
 * Uso:
 *   1. Asegúrate de tener GOOGLE_APPLICATION_CREDENTIALS apuntando a tu
 *      service account JSON, o corre: firebase login antes.
 *
 *   2. Instala dependencias si no las tienes:
 *        npm install firebase-admin
 *
 *   3. Ejecuta:
 *        node scripts/migrate-attempts-org-id.mjs
 *
 *      Para ver qué se actualizaría sin hacer cambios (dry-run):
 *        DRY_RUN=true node scripts/migrate-attempts-org-id.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Configuración ────────────────────────────────────────────────────────────

const PROJECT_ID   = 'aviva-onb-app';
const FROM_ORG     = 'default';
const TO_ORG       = 'aviva-credito';
const COLLECTION   = 'attempts';
const DRY_RUN      = process.env.DRY_RUN === 'true';

// ─── Inicialización ───────────────────────────────────────────────────────────

if (!getApps().length) {
  // Si tienes GOOGLE_APPLICATION_CREDENTIALS en el entorno, se usa automáticamente
  // Si no, puedes especificar la ruta al archivo de service account:
  //   const serviceAccount = JSON.parse(readFileSync(resolve('./service-account.json'), 'utf8'));
  //   initializeApp({ credential: cert(serviceAccount) });
  initializeApp({ projectId: PROJECT_ID });
}

const db = getFirestore();

// ─── Migración ────────────────────────────────────────────────────────────────

async function migrate() {
  console.log(`\n🔍 Buscando intentos con organizationId == '${FROM_ORG}'...`);

  const snap = await db
    .collection(COLLECTION)
    .where('organizationId', '==', FROM_ORG)
    .get();

  if (snap.empty) {
    console.log('✅ No se encontraron documentos con organizationId == "default". Nada que migrar.');
    return;
  }

  console.log(`📋 Encontrados: ${snap.size} documento(s)\n`);

  if (DRY_RUN) {
    console.log('⚠️  DRY_RUN activado — no se escribirá nada. Documentos que se actualizarían:\n');
    snap.docs.forEach(d => {
      const data = d.data();
      console.log(`  • ${d.id}  |  quizId: ${data.quizId}  |  userId: ${data.userId}  |  score: ${data.score}/${data.maxScore}`);
    });
    console.log('\nPara aplicar la migración, corre sin DRY_RUN=true.');
    return;
  }

  // Usar batches de 500 (límite de Firestore)
  const BATCH_SIZE = 500;
  let updated = 0;

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);

    chunk.forEach(d => {
      batch.update(d.ref, { organizationId: TO_ORG });
    });

    await batch.commit();
    updated += chunk.length;
    console.log(`  ✔ Actualizados ${updated}/${snap.size}...`);
  }

  console.log(`\n✅ Migración completa: ${updated} intento(s) actualizados de '${FROM_ORG}' → '${TO_ORG}'`);
  console.log('   Los resultados ya deberían aparecer en Admin → Analytics → Evaluaciones.\n');
}

migrate().catch(err => {
  console.error('\n❌ Error durante la migración:', err);
  process.exit(1);
});
