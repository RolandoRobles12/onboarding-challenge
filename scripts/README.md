# 📚 Scripts de Inicialización

Este directorio contiene scripts para inicializar y poblar Firestore con datos.

## 🚀 Inicializar Usuarios

El script `init-users.ts` crea la colección de usuarios en Firestore con una estructura simplificada.

### Estructura de Usuario

Cada usuario tiene los siguientes campos:

```typescript
{
  uid: string;        // ID único de Firebase Auth
  email: string;      // Correo electrónico
  nombre: string;     // Nombre completo
  rol: UserRole;      // super_admin | admin | trainer | seller
  producto?: string;  // ID del producto asignado (opcional para admins)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Usuarios de Ejemplo

El script crea 6 usuarios de ejemplo:

| Email | Nombre | Rol | Producto |
|-------|--------|-----|----------|
| admin@avivacredito.com | Administrador Principal | super_admin | - |
| rolando.9834@gmail.com | Rolando Robles | super_admin | - |
| capacitador1@avivacredito.com | María García | trainer | ba-product |
| capacitador2@avivacredito.com | Juan López | trainer | atn-product |
| vendedor1@avivacredito.com | Carlos Martínez | seller | ba-product |
| vendedor2@avivacredito.com | Ana Rodríguez | seller | atn-product |

### Cómo Ejecutar

1. **Asegúrate de tener las variables de entorno configuradas**

```bash
# .env.local
NEXT_PUBLIC_FIREBASE_API_KEY=tu-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=tu-app-id
```

2. **Ejecuta el script**

```bash
npx tsx scripts/init-users.ts
```

3. **Verifica en Firestore Console**

Ve a tu [Firestore Console](https://console.firebase.google.com/) y verifica que la colección `users` se haya creado con los 6 usuarios.

### Agregar Usuarios Manualmente

Para agregar un usuario manualmente en Firestore:

1. Ve a Firestore Console
2. Abre la colección `users`
3. Haz click en "Agregar documento"
4. Usa el UID del usuario como ID del documento
5. Agrega los campos:
   ```
   uid: "el-mismo-uid"
   email: "usuario@avivacredito.com"
   nombre: "Nombre Completo"
   rol: "seller" (o admin, trainer, super_admin)
   producto: "ba-product" (opcional)
   createdAt: [timestamp actual]
   updatedAt: [timestamp actual]
   ```

### Flujo de Autenticación

1. El usuario inicia sesión con Google OAuth
2. El sistema busca su perfil en la colección `users` por UID
3. Si existe, carga su información y rol
4. Si no existe:
   - Verifica si está en la whitelist
   - Crea su perfil con el rol de la whitelist (o 'seller' por defecto)
5. Asigna permisos según su rol

### Modificar Usuarios

Puedes editar el array `exampleUsers` en `init-users.ts` para crear usuarios personalizados:

```typescript
const exampleUsers: UserData[] = [
  {
    uid: 'mi-usuario-001',
    email: 'micorreo@avivacredito.com',
    nombre: 'Mi Nombre',
    rol: 'admin',
    producto: 'ba-product', // Opcional
  },
  // ... más usuarios
];
```

## 🗄️ Migración Completa

Para poblar toda la base de datos (productos, preguntas, quizzes, etc.):

```bash
npx tsx scripts/migrate-to-firestore.ts
```

Este script crea:
- Organización (aviva-credito)
- 2 Productos (BA y ATN)
- ~100 Preguntas
- Quizzes con misiones
- 4 Achievements iniciales

## 📊 Orden Recomendado

1. **Primero**: Ejecutar `migrate-to-firestore.ts` (crea productos y estructura)
2. **Segundo**: Ejecutar `init-users.ts` (crea usuarios)
3. **Tercero**: Iniciar la app y probar el login

## 🔒 Seguridad

**IMPORTANTE**: Estos scripts son para desarrollo/staging. En producción:

- No expongas las credenciales de Firebase en el código
- Usa Firebase Rules para proteger las colecciones
- Implementa validación en el backend
- No permitas que cualquiera se registre como admin

### Reglas de Firestore Recomendadas

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuarios solo pueden leer su propio perfil
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.rol in ['admin', 'super_admin'];
    }

    // Productos - todos pueden leer, solo admins escribir
    match /products/{productId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.rol in ['admin', 'super_admin'];
    }

    // Preguntas - todos pueden leer, solo admins escribir
    match /questions/{questionId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.rol in ['admin', 'super_admin'];
    }

    // Quizzes - todos pueden leer, solo admins escribir
    match /quizzes/{quizId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.rol in ['admin', 'super_admin'];
    }

    // Attempts - usuarios pueden crear sus propios attempts
    match /attempts/{attemptId} {
      allow read: if request.auth != null &&
                     (request.auth.uid == resource.data.userId ||
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.rol in ['admin', 'super_admin', 'trainer']);
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update, delete: if false; // No se pueden modificar attempts
    }

    // Leaderboard - todos pueden leer, sistema puede escribir
    match /leaderboards/{entryId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update, delete: if false;
    }
  }
}
```

## 🆘 Troubleshooting

### Error: "Firestore is not initialized"

Verifica que las variables de entorno estén correctamente configuradas en `.env.local`.

### Error: "Permission denied"

Asegúrate de que las reglas de Firestore permitan escritura. En desarrollo puedes usar:

```javascript
allow read, write: if true; // SOLO PARA DESARROLLO
```

### Los usuarios no aparecen

1. Verifica que el script se ejecutó sin errores
2. Revisa Firestore Console para confirmar que la colección `users` existe
3. Verifica que los documentos tienen el formato correcto

## 📞 Soporte

Si tienes problemas, verifica:
1. Las credenciales de Firebase
2. Las reglas de Firestore
3. Los logs de la consola del script
4. La estructura de los datos en Firestore Console
