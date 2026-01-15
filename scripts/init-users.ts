/**
 * Script para inicializar usuarios en Firestore
 *
 * Estructura simplificada de usuarios:
 * - uid: ID único del usuario (mismo que Firebase Auth)
 * - email: Correo electrónico
 * - nombre: Nombre completo
 * - rol: super_admin | admin | trainer | seller
 * - producto: ID del producto asignado (opcional para admins)
 *
 * Para ejecutar: npx tsx scripts/init-users.ts
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, Timestamp } from 'firebase/firestore';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Inicializar Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

// Tipos de roles
type UserRole = 'super_admin' | 'admin' | 'trainer' | 'seller';

interface UserData {
  uid: string;
  email: string;
  nombre: string;
  rol: UserRole;
  producto?: string; // Opcional, solo para sellers/trainers
}

// Usuarios de ejemplo para inicializar
const exampleUsers: UserData[] = [
  {
    uid: 'admin-001',
    email: 'admin@avivacredito.com',
    nombre: 'Administrador Principal',
    rol: 'super_admin',
  },
  {
    uid: 'admin-002',
    email: 'rolando.9834@gmail.com',
    nombre: 'Rolando Robles',
    rol: 'super_admin',
  },
  {
    uid: 'trainer-001',
    email: 'capacitador1@avivacredito.com',
    nombre: 'María García',
    rol: 'trainer',
    producto: 'ba-product',
  },
  {
    uid: 'trainer-002',
    email: 'capacitador2@avivacredito.com',
    nombre: 'Juan López',
    rol: 'trainer',
    producto: 'atn-product',
  },
  {
    uid: 'seller-001',
    email: 'vendedor1@avivacredito.com',
    nombre: 'Carlos Martínez',
    rol: 'seller',
    producto: 'ba-product',
  },
  {
    uid: 'seller-002',
    email: 'vendedor2@avivacredito.com',
    nombre: 'Ana Rodríguez',
    rol: 'seller',
    producto: 'atn-product',
  },
];

async function createUser(userData: UserData) {
  try {
    const userRef = doc(db, 'users', userData.uid);
    await setDoc(userRef, {
      ...userData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`✅ Usuario creado: ${userData.nombre} (${userData.email}) - Rol: ${userData.rol}`);
  } catch (error) {
    console.error(`❌ Error creando usuario ${userData.email}:`, error);
  }
}

async function initializeUsers() {
  console.log('🚀 Inicializando colección de usuarios en Firestore...\n');

  for (const user of exampleUsers) {
    await createUser(user);
  }

  console.log('\n✅ Colección de usuarios inicializada exitosamente!');
  console.log(`\n📊 Total de usuarios creados: ${exampleUsers.length}`);
  console.log('\n📋 Resumen por rol:');

  const roleCount = exampleUsers.reduce((acc, user) => {
    acc[user.rol] = (acc[user.rol] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(roleCount).forEach(([role, count]) => {
    console.log(`   - ${role}: ${count}`);
  });

  console.log('\n💡 Ahora puedes iniciar sesión con cualquiera de estos correos usando Google Auth.');
  console.log('   El sistema asignará automáticamente el rol correspondiente.\n');
}

// Ejecutar
initializeUsers().catch((error) => {
  console.error('❌ Error durante la inicialización:', error);
  process.exit(1);
});
