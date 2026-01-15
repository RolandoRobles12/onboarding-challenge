/**
 * Script para inicializar whitelist en Firestore
 *
 * Este script crea entradas en la whitelist. Cuando un usuario hace login por primera vez,
 * el sistema automáticamente:
 * 1. Busca su email en la whitelist
 * 2. Crea su perfil en la colección 'users' con su UID real de Firebase Auth
 * 3. Le asigna el rol y producto especificados en la whitelist
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

const ORG_ID = 'aviva-credito';

// Tipos de roles
type UserRole = 'super_admin' | 'admin' | 'trainer' | 'seller';

interface WhitelistData {
  email: string;
  role: UserRole;
  assignedKiosko?: string; // Usaremos esto como 'producto' por ahora
  nombre?: string; // Nombre sugerido (opcional)
}

// Whitelist de usuarios autorizados
const whitelist: WhitelistData[] = [
  {
    email: 'admin@avivacredito.com',
    role: 'super_admin',
    nombre: 'Administrador Principal',
  },
  {
    email: 'rolando.9834@gmail.com',
    role: 'super_admin',
    nombre: 'Rolando Robles',
  },
  {
    email: 'capacitador1@avivacredito.com',
    role: 'trainer',
    assignedKiosko: 'ba-product',
    nombre: 'María García',
  },
  {
    email: 'capacitador2@avivacredito.com',
    role: 'trainer',
    assignedKiosko: 'atn-product',
    nombre: 'Juan López',
  },
  {
    email: 'vendedor1@avivacredito.com',
    role: 'seller',
    assignedKiosko: 'ba-product',
    nombre: 'Carlos Martínez',
  },
  {
    email: 'vendedor2@avivacredito.com',
    role: 'seller',
    assignedKiosko: 'atn-product',
    nombre: 'Ana Rodríguez',
  },
];

async function addToWhitelist(entry: WhitelistData, addedBy: string = 'init-script') {
  try {
    // Usar el email como ID para evitar duplicados
    const whitelistRef = doc(db, 'whitelist', entry.email.replace(/[@.]/g, '_'));

    // Construir el objeto solo con campos que tengan valor
    const data: any = {
      organizationId: ORG_ID,
      email: entry.email,
      role: entry.role,
      addedBy: addedBy,
      addedAt: Timestamp.now(),
      used: false,
    };

    // Solo agregar assignedKiosko si tiene valor
    if (entry.assignedKiosko) {
      data.assignedKiosko = entry.assignedKiosko;
    }

    console.log(`Intentando crear: ${entry.email}`, JSON.stringify(data, null, 2));
    await setDoc(whitelistRef, data);
    console.log(`✅ Whitelist: ${entry.email} - Rol: ${entry.role}${entry.assignedKiosko ? ` - Producto: ${entry.assignedKiosko}` : ''}`);
  } catch (error: any) {
    console.error(`❌ Error agregando a whitelist ${entry.email}:`);
    console.error('Error code:', error?.code);
    console.error('Error message:', error?.message);
    if (error?.customData) {
      console.error('Custom data:', JSON.stringify(error.customData, null, 2));
    }
  }
}

async function initializeWhitelist() {
  console.log('🚀 Inicializando whitelist en Firestore...\n');
  console.log('📋 Esto permitirá que los siguientes usuarios accedan al sistema:\n');

  for (const entry of whitelist) {
    await addToWhitelist(entry);
  }

  console.log('\n✅ Whitelist inicializada exitosamente!');
  console.log(`\n📊 Total de emails autorizados: ${whitelist.length}`);
  console.log('\n📋 Resumen por rol:');

  const roleCount = whitelist.reduce((acc, entry) => {
    acc[entry.role] = (acc[entry.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(roleCount).forEach(([role, count]) => {
    console.log(`   - ${role}: ${count}`);
  });

  console.log('\n🔐 Flujo de autenticación:');
  console.log('   1. Usuario hace login con Google Auth');
  console.log('   2. Sistema verifica si su email está en la whitelist');
  console.log('   3. Si está autorizado, crea su perfil en "users" con su UID real');
  console.log('   4. Le asigna el rol y producto especificados');
  console.log('   5. Usuario puede acceder a la plataforma según sus permisos\n');

  console.log('💡 Los usuarios pueden ahora iniciar sesión con Google usando estos correos.');
  console.log('   Sus perfiles se crearán automáticamente al hacer login por primera vez.\n');
}

// Ejecutar
initializeWhitelist().catch((error) => {
  console.error('❌ Error durante la inicialización:', error);
  process.exit(1);
});
