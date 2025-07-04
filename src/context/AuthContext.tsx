
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

const ALLOWED_DOMAIN = 'avivacredito.com';
const ALLOWED_EMAILS = ['rolando.9834@gmail.com'];

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isFirebaseConfigured = !!auth;

  const logout = async () => {
    if (auth) {
      await signOut(auth);
    }
  };
  
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email) {
        const isAllowed = currentUser.email.endsWith(`@${ALLOWED_DOMAIN}`) || ALLOWED_EMAILS.includes(currentUser.email);
        if (isAllowed) {
          setUser(currentUser);
        } else {
          signOut(auth);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isFirebaseConfigured]);

  if (!isFirebaseConfigured) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg shadow-lg border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Error de Configuración de Firebase</CardTitle>
            <CardDescription>
              La autenticación no se pudo inicializar. Para que la aplicación funcione, necesita las claves de la API de Firebase, que no están configuradas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Por favor, asegúrate de que tu archivo <strong>.env</strong> en la raíz del proyecto contiene las variables de entorno correctas de tu proyecto de Firebase.
            </p>
            <div className="bg-muted p-3 rounded-md text-xs font-mono text-muted-foreground">
              <p>NEXT_PUBLIC_FIREBASE_API_KEY=...</p>
              <p>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...</p>
              <p>NEXT_PUBLIC_FIREBASE_PROJECT_ID=...</p>
              <p>...</p>
            </div>
            <p className="text-sm text-muted-foreground">
              La aplicación no puede funcionar sin una configuración válida.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const value = { user, loading, logout };

  return (
    <AuthContext.Provider value={value}>
        {loading ? (
             <div className="flex min-h-screen items-center justify-center bg-background">
                <Card>
                    <CardHeader>
                        <CardTitle>Cargando...</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>Verificando autenticación...</p>
                    </CardContent>
                </Card>
            </div>
        ) : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
