/**
 * Script de Prueba de Conexión a Firebase
 *
 * Verifica que la configuración de Firebase es correcta y que podemos
 * escribir y leer datos de Firestore.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

console.log('🔍 Verificando configuración de Firebase...\n');

// Verificar que todas las variables estén definidas
const requiredVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

let missingVars = false;
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`❌ Falta la variable de entorno: ${varName}`);
    missingVars = true;
  } else {
    console.log(`✅ ${varName}: ${process.env[varName]?.substring(0, 20)}...`);
  }
}

if (missingVars) {
  console.error('\n❌ ERROR: Faltan variables de entorno necesarias.');
  console.error('   Asegúrate de tener un archivo .env con todas las credenciales de Firebase.\n');
  process.exit(1);
}

console.log('\n✅ Todas las variables de entorno están definidas.\n');

// Inicializar Firebase
console.log('🔄 Inicializando Firebase...');
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
console.log('✅ Firebase inicializado correctamente.\n');

// Probar escritura y lectura
async function testFirestore() {
  const testDocId = 'test-connection';
  const testCollection = 'test';

  try {
    console.log('🔄 Probando escritura en Firestore...');
    const testDocRef = doc(db, testCollection, testDocId);

    await setDoc(testDocRef, {
      message: 'Test de conexión',
      timestamp: serverTimestamp(),
      success: true,
    });

    console.log('✅ Escritura exitosa.\n');

    console.log('🔄 Probando lectura de Firestore...');
    const docSnap = await getDoc(testDocRef);

    if (docSnap.exists()) {
      console.log('✅ Lectura exitosa.');
      console.log('   Datos:', docSnap.data());
    } else {
      console.error('❌ No se pudo leer el documento.');
    }

    console.log('\n🔄 Limpiando documento de prueba...');
    await deleteDoc(testDocRef);
    console.log('✅ Documento de prueba eliminado.\n');

    console.log('🎉 ¡Todas las pruebas pasaron exitosamente!');
    console.log('   Firebase está correctamente configurado y funcionando.\n');
    console.log('✨ Ahora puedes ejecutar los scripts de migración:');
    console.log('   1. npx tsx scripts/init-users.ts');
    console.log('   2. npx tsx scripts/migrate-to-firestore.ts\n');

  } catch (error: any) {
    console.error('\n❌ ERROR al probar Firestore:', error.message);

    if (error.code === 'permission-denied') {
      console.error('\n💡 SOLUCIÓN: Las reglas de Firestore están bloqueando el acceso.');
      console.error('   Ve a Firebase Console > Firestore Database > Rules');
      console.error('   Y cambia temporalmente las reglas a:');
      console.error('\n   rules_version = \'2\';');
      console.error('   service cloud.firestore {');
      console.error('     match /databases/{database}/documents {');
      console.error('       match /{document=**} {');
      console.error('         allow read, write: if true;');
      console.error('       }');
      console.error('     }');
      console.error('   }\n');
    } else {
      console.error('\n💡 Verifica:');
      console.error('   1. Que las credenciales en .env sean correctas');
      console.error('   2. Que Firestore esté habilitado en Firebase Console');
      console.error('   3. Que las reglas de Firestore permitan escritura\n');
    }

    process.exit(1);
  }
}

testFirestore();
