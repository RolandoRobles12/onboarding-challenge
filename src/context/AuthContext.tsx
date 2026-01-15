'use client';

import * as React from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { isUserAllowed } from '@/lib/auth-utils';
import { getUserProfile, createUserProfile, checkWhitelist, markWhitelistAsUsed } from '@/lib/firestore-service';
import type { UserProfile, UserRole } from '@/lib/types-scalable';
import { Timestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  isAdmin: boolean;
  isTrainer: boolean;
  isSeller: boolean;
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: async () => {},
  refreshProfile: async () => {},
  hasRole: () => false,
  isAdmin: false,
  isTrainer: false,
  isSeller: false,
});

const DEFAULT_ORG_ID = 'aviva-credito';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const isFirebaseConfigured = !!auth;

  const logout = async () => {
    if (auth) {
      await signOut(auth);
      setProfile(null);
    }
  };

  const refreshProfile = React.useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    try {
      const userProfile = await getUserProfile(user.uid);
      setProfile(userProfile);
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  }, [user]);

  const loadOrCreateUserProfile = React.useCallback(async (currentUser: User) => {
    try {
      // Intentar cargar el perfil existente
      let userProfile = await getUserProfile(currentUser.uid);

      // Si no existe, crear uno nuevo
      if (!userProfile) {
        console.log('Creating new user profile for:', currentUser.email);

        // Verificar whitelist para determinar el rol
        let role: UserRole = 'seller'; // Rol por defecto
        let whitelistEntry = null;

        if (currentUser.email) {
          try {
            whitelistEntry = await checkWhitelist(currentUser.email, DEFAULT_ORG_ID);
            if (whitelistEntry) {
              role = whitelistEntry.role;
              console.log('Found whitelist entry, role:', role);
            } else {
              // Si no está en whitelist pero es email autorizado, dar super_admin
              const allowedEmails = ['rolando.9834@gmail.com', 'admin@avivacredito.com'];
              if (allowedEmails.includes(currentUser.email.toLowerCase())) {
                role = 'super_admin';
                console.log('Email autorizado sin whitelist, asignando super_admin');
              }
            }
          } catch (error) {
            console.error('Error checking whitelist:', error);
            // Si hay error (ej: colección no existe), usar emails autorizados
            const allowedEmails = ['rolando.9834@gmail.com', 'admin@avivacredito.com'];
            if (currentUser.email && allowedEmails.includes(currentUser.email.toLowerCase())) {
              role = 'super_admin';
              console.log('Whitelist no disponible, usando email autorizado para super_admin');
            }
          }
        }

        // Crear el perfil con estructura simplificada
        const profileData: {
          email: string;
          nombre: string;
          rol: UserRole;
          producto?: string;
        } = {
          email: currentUser.email || '',
          nombre: currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuario',
          rol: role,
        };

        // Solo agregar producto si existe
        if (whitelistEntry?.assignedKiosko) {
          profileData.producto = whitelistEntry.assignedKiosko;
        }

        console.log('Creating user profile with data:', profileData);
        await createUserProfile(currentUser.uid, profileData);
        console.log('User profile created successfully');

        // Marcar whitelist como usada si corresponde
        if (whitelistEntry) {
          try {
            await markWhitelistAsUsed(whitelistEntry.id);
            console.log('Whitelist marked as used');
          } catch (error) {
            console.error('Error marking whitelist as used:', error);
            // No es crítico, continuar
          }
        }

        // Cargar el perfil recién creado
        userProfile = await getUserProfile(currentUser.uid);
      }

      setProfile(userProfile);
    } catch (error) {
      console.error('Error loading/creating user profile:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo cargar tu perfil de usuario. Intenta de nuevo más tarde.',
      });
    }
  }, []);

  React.useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (isUserAllowed(currentUser?.email)) {
        setUser(currentUser);

        if (currentUser) {
          await loadOrCreateUserProfile(currentUser);
        }
      } else {
        // If there is a user, it means they were not allowed.
        // Sign them out and show a message.
        if (currentUser) {
          toast({
            variant: 'destructive',
            title: 'Acceso Denegado',
            description: 'El acceso está restringido. Por favor, utiliza una cuenta autorizada.',
          });
          signOut(auth);
        }
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isFirebaseConfigured, loadOrCreateUserProfile]);

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

  // Helper functions for role checking
  const hasRole = React.useCallback((roles: UserRole | UserRole[]): boolean => {
    if (!profile) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(profile.rol);
  }, [profile]);

  const isAdmin = profile?.rol === 'admin' || profile?.rol === 'super_admin';
  const isTrainer = profile?.rol === 'trainer' || isAdmin;
  const isSeller = profile?.rol === 'seller';

  const value = {
    user,
    profile,
    loading,
    logout,
    refreshProfile,
    hasRole,
    isAdmin,
    isTrainer,
    isSeller,
  };

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
