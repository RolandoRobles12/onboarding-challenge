
'use client';

import * as React from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

const ALLOWED_DOMAIN = 'avivacredito.com';
const ALLOWED_EMAILS = ['rolando.9834@gmail.com'];

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  const isFirebaseConfigured = !!auth;

  const logout = async () => {
    if (auth) {
      await signOut(auth);
    }
  };
  
  React.useEffect(() => {
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
            <CardTitle className="text-destructive">Error: Configuración de Firebase Incompleta</CardTitle>
            <CardDescription>
             Para que la aplicación funcione, necesita las claves de la API de Firebase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Por favor, asegúrate de que tu archivo <strong>.env</strong> en la raíz del proyecto contiene las siguientes variables de tu proyecto de Firebase:
            </p>
            <div className="bg-muted p-3 rounded-md text-xs font-mono text-muted-foreground">
              <p>NEXT_PUBLIC_FIREBASE_API_KEY=...</p>
              <p>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...</p>
              <p>NEXT_PUBLIC_FIREBASE_PROJECT_ID=...</p>
              <p>NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...</p>
              <p>NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...</p>
              <p>NEXT_PUBLIC_FIREBASE_APP_ID=...</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Puedes encontrar estas claves en la configuración de tu proyecto de Firebase.
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

export const useAuth = () => React.useContext(AuthContext);
