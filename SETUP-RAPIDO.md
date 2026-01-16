# 🚀 Setup Rápido - Configuración en 3 Pasos

## Paso 1: Obtener los Cambios

En PowerShell, ejecuta:

```powershell
git pull origin claude/scalable-gamified-onboarding-3Ljfa
```

## Paso 2: Configurar Reglas de Firestore

**ESTO ES CRÍTICO - Sin esto, NADA funcionará.**

1. Ve a https://console.firebase.google.com/
2. Selecciona tu proyecto
3. En el menú izquierdo, haz clic en **Firestore Database**
4. Haz clic en la pestaña **Reglas**
5. Reemplaza TODO el contenido con esto:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

6. Haz clic en **Publicar**

> ⚠️ **Nota:** Estas reglas son para desarrollo. Más adelante las haremos más seguras.

## Paso 3: Probar y Poblar la Base de Datos

En PowerShell, ejecuta estos comandos **uno por uno**:

### 3.1 Probar la conexión a Firebase

```powershell
npx tsx scripts/test-firebase.ts
```

✅ Si ves "¡Todas las pruebas pasaron exitosamente!", continúa al siguiente paso.
❌ Si falla, revisa el Paso 2.

### 3.2 Crear usuarios en whitelist

```powershell
npx tsx scripts/init-users.ts
```

✅ Deberías ver mensajes como "✅ Usuario agregado a whitelist: admin@avivacredito.com"

### 3.3 Poblar productos, quizzes y preguntas

```powershell
npx tsx scripts/migrate-to-firestore.ts
```

✅ Deberías ver un resumen al final indicando cuántos productos, preguntas y quizzes se crearon.

## Paso 4: Iniciar la App

```powershell
npm run dev
```

Luego ve a http://localhost:9002/login

Inicia sesión con tu email de Google (rolando.9834@gmail.com o admin@avivacredito.com).

Deberías poder:
- ✅ Ver el dashboard principal
- ✅ Acceder a /admin
- ✅ Ver productos y quizzes

---

## ❓ Si algo falla

### Error: "Invalid resource field value"
- **Solución:** Asegúrate de haber ejecutado `git pull` para obtener los últimos cambios

### Error: "Permission denied"
- **Solución:** Revisa las reglas de Firestore en el Paso 2

### La app se queda cargando
- **Solución:** Abre la consola del navegador (F12) y comparte el error

### No puedo acceder a /admin
- **Solución:** Verifica que tu email esté en el whitelist ejecutando el script del paso 3.2
