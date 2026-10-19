# 🔥 Configuración de Firebase

## 🔒 Seguridad: cómo está armada

- **Reglas de Firestore** (`firestore.rules`) y de **Storage** (`storage.rules`):
  solo entran cuentas `@avivacredito.com` (con el correo verificado) que tengan
  perfil activo. El contenido lo administra el staff (`super_admin`, `admin`,
  `trainer`); el vendedor solo lee el contenido y escribe su propio progreso.
  Usuarios, invitaciones y tokens son solo de admins, y únicamente un
  `super_admin` crea o modifica otros `super_admin`.
- **Rutas de `/api`**: usan el Firebase Admin SDK (`src/lib/server/`) y piden el
  ID token de la sesión (`Authorization: Bearer …`). `send-slack` y
  `seed-questions` exigen rol de staff; `auto-create`, una sesión válida;
  `cron`, el secreto que genera la función programada.
- **Perfiles**: los crea el servidor en el primer inicio de sesión
  (`POST /api/auth/profile`). El rol sale de la whitelist; si el correo no
  está ahí, de `SUPER_ADMIN_EMAILS`; si tampoco, es vendedor. El navegador no
  puede escribir su propio rol.

## 🚀 Desplegar

```bash
# Reglas, índices y reglas de Storage
firebase deploy --only firestore:rules,firestore:indexes,storage
```

- La primera vez que se despliegan las reglas de Storage, la CLI pide permiso
  para que Storage lea Firestore (las reglas revisan el rol del usuario):
  acéptalo.
- Si la consola tiene índices creados a mano que no están en
  `firestore.indexes.json`, la CLI pregunta si borrarlos: responde que no.
- La cuenta de servicio del backend de App Hosting necesita acceso a Firestore
  (rol **Cloud Datastore User** o **Firebase Admin**). Si las rutas de `/api`
  responden "Error interno" con `PERMISSION_DENIED` en los logs, falta ese rol.
  También necesita leer Storage (rol **Storage Object Viewer**): los paquetes
  SCORM se sirven desde la misma app por `/scorm/...`.
- Orden recomendado: primero la app (App Hosting) y después reglas e índices.
  Las reglas nuevas ya no dejan que el navegador escriba intentos, puntajes ni
  el Pulso; si se despliegan antes que la app, la versión vieja deja de guardar.

### Variables de entorno (opcionales)

| Variable | Para qué |
|---|---|
| `SUPER_ADMIN_EMAILS` | Correos, separados por comas, que reciben `super_admin` en su primer inicio de sesión si no están en la whitelist. Por defecto, los que ya tenía la app. |
| `PULSE_CRON_SECRET` | Secreto alterno para `/api/pulse/cron` (la función programada genera uno solo). |
| `SLACK_BOT_TOKEN` | Respaldo del token del bot si no está en Admin → Tokens. |
| `APP_URL` | URL pública de la app para los enlaces de los avisos, si no está en la configuración de Slack. |
| `ANTHROPIC_API_KEY` | Respaldo de la API key de Claude si no está en Admin → Tokens (`anthropic_api_key`). Activa el mensaje con IA en los resultados de los desafíos; sin llave, se muestran las frases fijas. |

## 🔔 Avisos (Slack y push)

Los avisos salen por **mensaje directo de Slack** y **notificación push** (no
hay correo). Se configuran en **Admin → Notificaciones**: cada regla se puede
apagar, elegir canal y ajustar los días de anticipación; el botón "Enviarme una
prueba" manda un aviso al admin para revisar ambos canales.

- **Slack**: usa el token del bot (Admin → Tokens) y el **Slack ID** del perfil
  de cada persona. Sin Slack ID, ese aviso solo llega por push. El bot necesita
  el permiso `chat:write`.
- **Push**: cada embajador lo activa desde su perfil o el aviso de la pantalla
  de inicio. Las llaves VAPID se generan solas la primera vez y se guardan en
  `server_secrets`. En iPhone, el push solo funciona con la app instalada en la
  pantalla de inicio (iOS 16.4 o posterior).
- Los avisos de plazos, re-certificación e inactividad los corre la función
  programada del Pulso una vez al día. Cada aviso se manda una sola vez
  (`notification_log`).

## 👥 Invitar usuarios

Desde **Admin → Usuarios → Invitar** (o importando un CSV). La invitación
guarda el rol, el producto y el kiosko; se aplican cuando la persona inicia
sesión por primera vez.

### Reparar perfiles creados antes de la corrección de invitaciones

Las invitaciones guardaban el kiosko en el campo `producto`. Para corregir los
perfiles afectados:

```bash
DRY_RUN=true node scripts/repair-whitelist-profiles.mjs   # muestra los cambios
node scripts/repair-whitelist-profiles.mjs                # los aplica
```

## 🧪 Desarrollo local con emuladores

Con un proyecto `demo-*` la app (cliente y servidor) se conecta sola a los
emuladores:

```bash
firebase emulators:start --only auth,firestore,storage --project demo-aviva
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-aviva NEXT_PUBLIC_FIREBASE_API_KEY=fake \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-aviva.firebaseapp.com npm run dev
```

## 📞 Problemas comunes

### "Missing or insufficient permissions"
- Revisa que el usuario tenga perfil en `users` y que no esté desactivado.
- Para editar contenido se necesita rol de staff; para usuarios y tokens, admin.

### El usuario no puede entrar después del login
1. Su correo debe ser `@avivacredito.com` (o estar en la lista de `src/lib/auth-utils.ts`).
2. Revisa en los logs del backend la respuesta de `/api/auth/profile`.

### Los scripts de `scripts/` fallan con "Permission denied"
- `migrate-attempts-org-id.mjs` y `repair-whitelist-profiles.mjs` usan el Admin
  SDK: necesitan credenciales de Google Cloud (`gcloud auth application-default login`).
- `init-users.ts`, `migrate-to-firestore.ts`, `seed-pulse-questions.ts` y
  `test-firebase.ts` usan el SDK de cliente sin sesión, así que con las reglas
  actuales ya no pueden escribir en producción. Córrelos contra los emuladores
  o pásalos al Admin SDK. Para las preguntas base del Pulso, usa el botón de
  Admin → Categorías del Pulso.
