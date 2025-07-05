'use client';

import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AvivaLogo } from '@/components/AvivaLogo';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

const ALLOWED_DOMAIN = 'avivacredito.com';
const ALLOWED_EMAILS = ['rolando.9834@gmail.com'];

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const handleSignIn = async () => {
    if (!auth) {
      toast({
        variant: 'destructive',
        title: 'Error de Configuración',
        description: 'La configuración de Firebase no está completa. Revisa las variables de entorno.',
      });
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const userEmail = result.user.email;

      if (userEmail && (userEmail.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`) || ALLOWED_EMAILS.includes(userEmail.toLowerCase()))) {
        router.push('/');
      } else {
        await signOut(auth);
        toast({
          variant: 'destructive',
          title: 'Acceso Denegado',
          description: 'El acceso está restringido. Por favor, utiliza una cuenta autorizada.',
        });
      }
    } catch (error: any) {
      // Ignore errors caused by the user closing the popup or rapid clicks,
      // as these are normal user actions, not application errors.
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return;
      }

      console.error('Error durante el inicio de sesión:', error);
      
      let description = 'Hubo un problema al iniciar sesión. Por favor, inténtalo de nuevo.';
      if (error.code === 'auth/configuration-not-found') {
        description = 'Configuración incompleta. Asegúrate de haber habilitado el proveedor de "Google" en la sección de "Authentication" > "Sign-in method" de tu consola de Firebase.';
      } else if (error.code === 'auth/unauthorized-domain') {
        description = `El dominio desde el que intentas acceder no está autorizado en tu configuración de Firebase. Por favor, añade '${window.location.hostname}' a la lista de dominios autorizados en la sección Authentication > Settings de tu consola de Firebase.`;
      }


      toast({
        variant: 'destructive',
        title: 'Error de Autenticación',
        description: description,
      });
    }
  };
  
  useEffect(() => {
    if (!loading && user) {
        router.push('/');
    }
  }, [user, loading, router]);


  if (loading || user) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Card>
                <CardHeader>
                    <CardTitle>Cargando...</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Redirigiendo a la página principal...</p>
                </CardContent>
            </Card>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg border-primary/20">
        <CardHeader className="text-center items-center">
          <AvivaLogo className="h-12 w-auto mb-4" />
          <CardTitle className="text-3xl font-headline text-accent">Desafío Aviva</CardTitle>
          <CardDescription>
            Por favor, inicia sesión con tu cuenta de Google de Aviva para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSignIn} className="w-full text-primary-foreground bg-primary hover:bg-primary/90" size="lg">
            <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 23.4 172.9 61.5l-62.7 62.7C337 97.2 293.6 80 248 80c-82.8 0-150 67.2-150 150s67.2 150 150 150c94.9 0 131.3-64.1 135.2-95.6H248v-73.6h239.2c1.4 9.1 2.8 18.2 2.8 27.8z"></path></svg>
            Iniciar sesión con Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
