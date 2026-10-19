/**
 * Reparación: perfiles creados desde una invitación (whitelist) antes de la
 * corrección del alta de usuarios.
 *
 * El alta guardaba el kiosko de la invitación en `producto` y descartaba el
 * producto asignado. Este script, para cada usuario cuyo `producto` no es el id
 * de un producto existente y coincide con el kiosko de su invitación:
 *   - pone ese valor en `assignedKiosko` (si no tenía),
 *   - pone en `producto` el producto de la invitación (o lo quita si no había).
 *
 * Uso (con credenciales de Google Cloud, p. ej. `gcloud auth application-default login`):
 *   DRY_RUN=true node scripts/repair-whitelist-profiles.mjs   # solo muestra los cambios
 *   node scripts/repair-whitelist-profiles.mjs                # aplica los cambios
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.PROJECT_ID || 'aviva-onb-app';
const ORG_ID = 'aviva-credito';
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

async function main() {
  const [users, products, whitelist] = await Promise.all([
    db.collection('users').get(),
    db.collection('products').get(),
    db.collection('whitelist').where('organizationId', '==', ORG_ID).get(),
  ]);
  const productIds = new Set(products.docs.map(d => d.id));
  const invitesByEmail = new Map();
  for (const d of whitelist.docs) {
    const entry = d.data();
    const email = String(entry.email ?? '').toLowerCase();
    if (!invitesByEmail.has(email)) invitesByEmail.set(email, []);
    invitesByEmail.get(email).push(entry);
  }

  let fixed = 0;
  for (const doc of users.docs) {
    const user = doc.data();
    if (!user.producto || productIds.has(user.producto)) continue;
    const invite = (invitesByEmail.get(String(user.email ?? '').toLowerCase()) ?? [])
      .find(e => e.assignedKiosko === user.producto);
    if (!invite) continue;

    const update = {
      producto: invite.assignedProductId && productIds.has(invite.assignedProductId)
        ? invite.assignedProductId
        : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!user.assignedKiosko) update.assignedKiosko = user.producto;

    console.log(`${DRY_RUN ? '[dry-run] ' : ''}${user.email}: producto "${user.producto}" → ` +
      `${invite.assignedProductId ?? '(sin producto)'}, kiosko → ${user.assignedKiosko || user.producto}`);
    if (!DRY_RUN) await doc.ref.update(update);
    fixed++;
  }
  console.log(`\n${fixed} perfil(es) ${DRY_RUN ? 'por reparar' : 'reparados'}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
