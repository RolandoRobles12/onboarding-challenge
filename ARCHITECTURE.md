# 🏗️ Arquitectura Escalable - Desafío Aviva

## 📋 Índice

1. [Visión General](#visión-general)
2. [Arquitectura de Datos](#arquitectura-de-datos)
3. [Panel de Administración](#panel-de-administración)
4. [Sistema de Roles y Permisos](#sistema-de-roles-y-permisos)
5. [Gamificación Avanzada](#gamificación-avanzada)
6. [Flujo de Usuario](#flujo-de-usuario)
7. [Migración de Datos](#migración-de-datos)
8. [Próximos Pasos](#próximos-pasos)

---

## 🎯 Visión General

Esta arquitectura transforma el proyecto de un sistema monolítico con datos hardcodeados a una **plataforma escalable multi-producto** con:

- ✅ **Panel de administración completo** - Gestión visual de productos, quizzes y preguntas
- ✅ **Base de datos persistente** - Firestore para almacenamiento escalable
- ✅ **Sistema multi-producto** - Soporte ilimitado de productos y quizzes
- ✅ **Roles y permisos** - Super Admin, Admin, Capacitador, Vendedor
- ✅ **Gamificación mejorada** - Badges, logros, niveles, XP
- ✅ **Analytics en tiempo real** - Dashboard con métricas y reportes
- ✅ **Constructor visual de quizzes** - Drag & drop para crear quizzes fácilmente

---

## 🗄️ Arquitectura de Datos

### Colecciones de Firestore

```
📦 Firestore Database
├── 📁 organizations/
│   └── {orgId}
│       ├── name, logo, colors
│       └── settings (whitelist, AI, etc.)
│
├── 📁 products/
│   └── {productId}
│       ├── name, shortName, description
│       ├── icon, color, targetAudience
│       └── tags[], active, order
│
├── 📁 quizzes/
│   └── {quizId}
│       ├── title, description, productId
│       ├── missions[] (con questionIds)
│       ├── gamificationConfig
│       ├── totalQuestions, difficulty
│       └── published, version
│
├── 📁 questions/
│   └── {questionId}
│       ├── text, explanation
│       ├── type, difficulty, category
│       ├── options[] (text, isCorrect)
│       ├── isTricky, trickyHint
│       └── tags[], timesUsed, averageCorrectRate
│
├── 📁 users/
│   └── {userId}
│       ├── profile (name, email, role)
│       ├── selectedAvatar, level, totalXP
│       ├── badges[], assignedKiosko
│       └── stats (quizzes, scores, streaks)
│
├── 📁 attempts/
│   └── {attemptId}
│       ├── userId, quizId, productId
│       ├── score, percentage, timeTaken
│       ├── answers[] (detallado)
│       ├── missionResults[]
│       ├── aiFeedback, levelAchieved
│       └── badgesEarned[]
│
├── 📁 leaderboards/
│   └── {entryId}
│       ├── quizId, productId, userId
│       ├── score, percentage, timeTaken
│       ├── displayName, avatar, kiosko
│       └── globalRank, productRank
│
├── 📁 achievements/
│   └── {achievementId}
│       ├── name, description, icon
│       ├── badgeType, color
│       ├── criteria (type, threshold)
│       └── xpReward
│
└── 📁 whitelist/
    └── {entryId}
        ├── email, role, assignedKiosko
        ├── addedBy, addedAt
        └── used, expiresAt
```

### Modelos TypeScript

Todos los modelos están definidos en `/src/lib/types-scalable.ts`:

- `Product` - Productos de onboarding
- `Quiz` - Quizzes con misiones
- `Question` - Preguntas con opciones
- `UserProfile` - Perfil completo del usuario
- `QuizAttempt` - Intentos y resultados
- `LeaderboardEntry` - Entradas del leaderboard
- `Achievement` - Logros y badges
- `WhitelistEntry` - Control de acceso

---

## 🎛️ Panel de Administración

Accesible en `/admin` con las siguientes secciones:

### 1. Dashboard Principal (`/admin`)

Resumen general con:
- Estadísticas de productos, quizzes, usuarios
- Acciones rápidas
- Vista de productos y quizzes recientes

### 2. Gestión de Productos (`/admin/products`)

**Funcionalidades:**
- ✅ Crear productos con nombre, descripción, color
- ✅ Editar productos existentes
- ✅ Soft delete (marcar como inactivos)
- ✅ Búsqueda y filtros
- ✅ Tags y categorización

**Campos:**
- Nombre y nombre corto
- Descripción
- Color (selector visual)
- Audiencia objetivo
- Tags

### 3. Banco de Preguntas (`/admin/questions`)

**Funcionalidades:**
- ✅ CRUD completo de preguntas
- ✅ Filtros por producto, dificultad, categoría
- ✅ Búsqueda por texto, tags
- ✅ Estadísticas de uso
- ✅ Preguntas tricky con vidas extra

**Tipos de preguntas:**
- **Single Choice** - Una sola respuesta correcta
- **Multiple Choice** - Múltiples respuestas correctas
- **Tricky** - Pregunta con confirmación doble + vida extra

**Campos:**
- Texto de la pregunta
- Tipo y dificultad
- Opciones (con switch de correcta/incorrecta)
- Categoría y tags
- Explicación opcional
- Configuración tricky

### 4. Constructor de Quizzes (`/admin/quizzes`) ⏳ *Pendiente*

**Funcionalidades planificadas:**
- Drag & drop de preguntas
- Constructor de misiones narrativas
- Configuración de gamificación por quiz
- Preview en vivo
- Versionado de quizzes

### 5. Gestión de Usuarios (`/admin/users`) ⏳ *Pendiente*

**Funcionalidades planificadas:**
- Lista de usuarios con filtros
- Gestión de whitelist
- Asignación de roles
- Ver progreso y estadísticas individuales
- Resetear intentos

### 6. Analytics Dashboard (`/admin/analytics`) ⏳ *Pendiente*

**Métricas planificadas:**
- Dashboard en tiempo real
- Gráficos de rendimiento
- Comparativas entre kioskos
- Preguntas más difíciles
- Reportes exportables (Excel/PDF)
- Insights de capacitación

---

## 🔐 Sistema de Roles y Permisos

### Roles Disponibles

| Rol | Acceso | Descripción |
|-----|--------|-------------|
| **Super Admin** | Todo | Control total de la plataforma |
| **Admin** | Panel completo | Gestión de productos, quizzes, usuarios |
| **Trainer (Capacitador)** | Analytics + Limitado | Ver progreso de su kiosko, analytics |
| **Seller (Vendedor)** | Solo quizzes | Realizar quizzes, ver su progreso |

### Control de Acceso

**AuthContext actualizado:**
```typescript
const { profile, isAdmin, isTrainer, isSeller, hasRole } = useAuth();

// Verificar roles
if (isAdmin) { /* ... */ }
if (hasRole(['admin', 'trainer'])) { /* ... */ }
```

**Componente de protección:**
```tsx
<AdminRoute requiredRoles={['admin', 'super_admin']}>
  {/* Contenido protegido */}
</AdminRoute>
```

### Whitelist

Los usuarios deben estar en la whitelist para:
1. Definir su rol inicial
2. Asignar kiosko automáticamente
3. Control de acceso a la plataforma

**Proceso:**
1. Admin agrega email a whitelist con rol
2. Usuario se registra con Google Auth
3. Sistema verifica whitelist y crea perfil
4. Asigna rol y permisos automáticamente

---

## 🎮 Gamificación Avanzada

### Sistema de Vidas

- Cada misión permite **máximo 2 errores**
- Al tercer error = **Fallo de misión**
- **Preguntas Tricky**: otorgan vida extra si se responden correctamente
- Vidas extra rescatan de fallos de misión

### Sistema de Niveles

```
Nivel = f(totalXP)

XP se gana por:
- Completar quizzes
- Obtener badges
- Respuestas correctas
- Completar misiones sin errores
```

### Badges y Achievements

**Badges implementados:**
1. 🏁 **Primera Misión** - Completa tu primera misión (50 XP)
2. 🏆 **Perfeccionista** - 100% de aciertos (100 XP)
3. ⚡ **Velocista** - Completa en <15 min (75 XP)
4. ✅ **Sin Errores** - Misión sin ningún error (80 XP)

**Badges planificados:**
- Racha de 3/7/30 días
- Maestro por producto
- Completar todos los productos
- Top 3 en leaderboard

### Niveles de Maestría

Basados en porcentaje final:

| Nivel | Rango | Descripción |
|-------|-------|-------------|
| 🥇 **Maestro Aviva** | 90-100% | Dominio completo |
| 🥈 **Promotor en Ascenso** | 75-89% | Excelente conocimiento |
| 🥉 **Aprendiz Prometedor** | 60-74% | Buen progreso |
| 📚 **Explorador Novato** | 0-59% | Necesita mejorar |

### Leaderboard

**Tipos de ranking:**
- Global (todos los usuarios)
- Por producto
- Por kiosko

**Ordenamiento:**
1. Score (desc)
2. Tiempo (asc)

**Tiempo real:**
```typescript
const { entries } = useLeaderboard(quizId, 10, true);
// Se actualiza automáticamente con Firestore listeners
```

---

## 👤 Flujo de Usuario

### 1. Autenticación

```mermaid
graph TD
    A[Landing] --> B{Autenticado?}
    B -->|No| C[/login]
    C --> D[Google OAuth]
    D --> E{Email permitido?}
    E -->|Sí| F[Crear/Cargar Perfil]
    E -->|No| G[Acceso Denegado]
    F --> H[Verificar Whitelist]
    H --> I[Asignar Rol]
    I --> J[Dashboard Principal]
```

### 2. Realizar Quiz (Vendedor)

```
1. Usuario ve productos disponibles
2. Selecciona un producto
3. Ve quizzes disponibles del producto
4. Inicia quiz
5. Completa formulario pre-quiz (nombre, kiosko, avatar)
6. Realiza misiones y preguntas
7. Ve resultados + feedback AI
8. Se agrega al leaderboard
9. Puede descargar certificado
```

### 3. Panel Admin (Admin/Trainer)

```
Admin:
1. Login con cuenta autorizada
2. Acceso a /admin
3. Dashboard con métricas
4. Gestionar productos/preguntas/quizzes
5. Ver analytics globales

Trainer:
1. Login con cuenta autorizada
2. Acceso limitado a /admin
3. Ver analytics de su kiosko
4. Ver progreso de vendedores asignados
5. Reportes comparativos
```

---

## 📦 Migración de Datos

### Script de Migración

Ubicación: `/scripts/migrate-to-firestore.ts`

**Ejecutar migración:**
```bash
# Instalar tsx si no lo tienes
npm install -g tsx

# Configurar variables de entorno
cp .env.example .env
# Editar .env con credenciales de Firebase

# Ejecutar migración
npx tsx scripts/migrate-to-firestore.ts
```

**El script migra:**
1. ✅ Organización Aviva Crédito
2. ✅ Productos BA y ATN
3. ✅ ~43 preguntas de BA
4. ✅ ~56 preguntas de ATN (actualizar script con datos completos)
5. ✅ Quiz de certificación BA
6. ✅ 4 Achievements iniciales

**Estructura migrada:**
```
Organización: aviva-credito
├── Producto: Aviva Tu Compra (BA)
│   ├── 43 preguntas
│   └── Quiz: Certificación Promotores BA
│       ├── Misión 1: Fundamentos y Plataformas
│       └── Misión 2: Proceso y Operación
│
└── Producto: Aviva Tu Negocio/Contigo (ATN)
    └── 56 preguntas (pendiente quiz)
```

---

## 🔄 Servicios de Firestore

Ubicación: `/src/lib/firestore-service.ts`

### Funciones CRUD Disponibles

**Productos:**
```typescript
getProducts(orgId?) // Listar productos
getProduct(productId) // Obtener uno
createProduct(product, userId) // Crear
updateProduct(productId, updates) // Actualizar
deleteProduct(productId) // Soft delete
```

**Preguntas:**
```typescript
getQuestions(productId?, activeOnly?) // Listar
getQuestion(questionId) // Obtener una
getQuestionsByIds(ids[]) // Obtener por IDs
createQuestion(question, userId) // Crear
updateQuestion(questionId, updates) // Actualizar
deleteQuestion(questionId) // Soft delete
batchCreateQuestions(questions[], userId) // Batch crear
```

**Quizzes:**
```typescript
getQuizzes(productId?, activeOnly?) // Listar
getQuiz(quizId) // Obtener uno
createQuiz(quiz, userId) // Crear
updateQuiz(quizId, updates) // Actualizar
publishQuiz(quizId) // Publicar
deleteQuiz(quizId) // Soft delete
```

**Usuarios:**
```typescript
getUserProfile(userId) // Obtener perfil
createUserProfile(userId, profile) // Crear
updateUserProfile(userId, updates) // Actualizar
getUsersByKiosko(kiosko) // Por kiosko
```

**Quiz Attempts:**
```typescript
createQuizAttempt(attempt) // Crear intento
updateQuizAttempt(attemptId, updates) // Actualizar
getQuizAttempt(attemptId) // Obtener
getUserAttempts(userId, quizId?) // Por usuario
```

**Leaderboard:**
```typescript
addLeaderboardEntry(entry) // Agregar
getLeaderboard(quizId, limit, kiosko?) // Obtener
getProductLeaderboard(productId, limit) // Por producto
subscribeToLeaderboard(quizId, callback, limit) // Tiempo real
```

---

## 🎣 Hooks de React

Ubicación: `/src/hooks/use-firestore.ts`

### Hooks Disponibles

```typescript
// Productos
const { products, loading, error } = useProducts();
const { product, loading, error } = useProduct(productId);

// Quizzes
const { quizzes, loading, error, refresh } = useQuizzes(productId?);
const { quiz, loading, error, refresh } = useQuiz(quizId);

// Preguntas
const { questions, loading, error, refresh } = useQuestions(productId?);
const { questions, loading, error } = useQuestionsByIds(ids[]);

// Usuarios
const { profile, loading, error } = useUserProfile(userId, realtime?);

// Leaderboard
const { entries, loading, error } = useLeaderboard(quizId, limit, realtime?);
const { entries, loading, error } = useProductLeaderboard(productId, limit);

// Achievements
const { achievements, loading, error } = useAchievements();

// Intentos
const { attempts, loading, error, refresh } = useUserAttempts(userId, quizId?);
```

**Ejemplo de uso:**
```tsx
function ProductList() {
  const { products, loading, error } = useProducts();

  if (loading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <div>
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

---

## 🚀 Próximos Pasos

### Fase 1: Completar Panel Admin (Alta Prioridad)

- [ ] **Constructor visual de quizzes**
  - Drag & drop de preguntas
  - Builder de misiones con narrativas
  - Preview en vivo
  - Versionado

- [ ] **Gestión de usuarios**
  - Lista con filtros
  - CRUD de whitelist
  - Asignación de roles
  - Ver progreso individual

- [ ] **Dashboard de Analytics**
  - Gráficos con Recharts
  - Métricas en tiempo real
  - Comparativas entre kioskos
  - Identificar preguntas difíciles
  - Exportación a Excel/PDF

### Fase 2: Mejorar Gamificación

- [ ] **Sistema de rachas**
  - Tracking de días consecutivos
  - Badges por rachas (3/7/30 días)
  - Recordatorios

- [ ] **Más achievements**
  - Por producto completado
  - Top 3 en leaderboard
  - Velocista extremo
  - Maestro de todos los productos

- [ ] **Progreso visual**
  - Barra de progreso por producto
  - Visualización de badges ganados
  - Historial de attempts

### Fase 3: IA Mejorada

- [ ] **Feedback contextual**
  - Por misión completada
  - Análisis de errores comunes
  - Recomendaciones personalizadas

- [ ] **Generación de preguntas**
  - Usar IA para generar variaciones
  - Sugerir preguntas según categoría
  - Validar calidad de preguntas

### Fase 4: Features Avanzados

- [ ] **Modo práctica**
  - Repetir preguntas fallidas
  - Quiz personalizado por debilidades
  - Sin impacto en leaderboard

- [ ] **Competencias**
  - Torneos entre kioskos
  - Premios y reconocimientos
  - Leaderboards temporales

- [ ] **Notificaciones**
  - Push notifications
  - Recordatorios de quizzes pendientes
  - Avisos de nuevos productos

- [ ] **Mobile app**
  - React Native o PWA
  - Notificaciones nativas
  - Modo offline

---

## 📚 Recursos y Referencias

### Documentación Externa

- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [Next.js 15](https://nextjs.org/docs)
- [Radix UI](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Claude API (Anthropic)](https://docs.claude.com/)

### Archivos Clave

```
/src
├── /lib
│   ├── types-scalable.ts          # Modelos TypeScript
│   ├── firestore-service.ts       # Servicios CRUD
│   ├── firebase.ts                # Config Firebase
│   └── questions.ts               # Datos legacy
│
├── /hooks
│   └── use-firestore.ts          # Hooks personalizados
│
├── /context
│   └── AuthContext.tsx           # Auth + Roles
│
├── /components
│   ├── AdminRoute.tsx            # Protección admin
│   └── /ui                       # Componentes UI
│
├── /app
│   ├── /admin                    # Panel admin
│   │   ├── layout.tsx           # Layout con nav
│   │   ├── page.tsx             # Dashboard
│   │   ├── /products            # Gestión productos
│   │   ├── /questions           # Banco preguntas
│   │   ├── /quizzes             # Constructor quizzes
│   │   ├── /users               # Gestión usuarios
│   │   └── /analytics           # Analytics
│   │
│   └── /[quizType]              # Quiz dinámico
│
└── /scripts
    └── migrate-to-firestore.ts   # Script migración
```

---

## 🤝 Contribuir

Para agregar nuevas features o mejorar las existentes:

1. **Modelos** - Agregar/modificar tipos en `types-scalable.ts`
2. **Servicios** - Agregar funciones CRUD en `firestore-service.ts`
3. **Hooks** - Crear hooks en `use-firestore.ts` para uso en componentes
4. **UI** - Implementar componentes usando los hooks
5. **Testing** - Probar con datos reales en Firestore

---

## 📝 Notas Importantes

### Seguridad

- **Roles verificados en backend**: Aunque hay protección en frontend, siempre validar roles en reglas de Firestore
- **Whitelist**: Controla quién puede acceder a la plataforma
- **Firebase Rules**: Configurar reglas de seguridad en Firestore Console

### Performance

- **Índices**: Crear índices compuestos en Firestore para queries complejas
- **Paginación**: Implementar para listas grandes (>100 items)
- **Cache**: Usar hooks con cache para evitar re-fetches innecesarios
- **Optimistic UI**: Actualizar UI antes de confirmar con Firestore

### Costos

- **Firestore**: Pay-as-you-go, optimizar queries
- **Claude (Anthropic)**: Costo por llamada de IA, hacer opcional
- **Firebase Auth**: Gratis hasta 10k usuarios/mes
- **Firebase Hosting**: Gratis nivel básico

---

## ✨ Conclusión

Esta arquitectura escalable transforma Desafío Aviva en una plataforma robusta y profesional capaz de:

- ✅ Gestionar múltiples productos de onboarding
- ✅ Crear quizzes dinámicos sin código
- ✅ Escalar a miles de usuarios
- ✅ Proveer analytics y reportes detallados
- ✅ Gamificar la experiencia de aprendizaje
- ✅ Adaptarse a las necesidades futuras

**El futuro es escalable. 🚀**
