'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Package,
  HelpCircle,
  Users,
  BarChart3,
  Upload,
  LogOut,
  Menu,
  X,
  Route,
  BookOpen,
  Award,
  Medal,
  Swords,
  BellRing,
  UserCheck,
  FileText,
  Layers,
  Clapperboard,
  Radio,
  KeyRound,
  FolderKanban,
  MessageSquare,
  ShieldCheck,
  Store,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useState, useEffect } from 'react';
import { AvivaLogo } from '@/components/AvivaLogo';
import { getRolePermissions } from '@/lib/firestore-service';

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { section: string; items: NavItem[] };

const navigation: (NavItem | NavSection)[] = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Mi Equipo', href: '/admin/team', icon: Users },
  {
    section: 'Catálogo de Contenido',
    items: [
      { name: 'Videos', href: '/admin/videos', icon: Clapperboard },
      { name: 'Cursos', href: '/admin/courses', icon: BookOpen },
      { name: 'Evaluaciones y Desafíos', href: '/admin/quizzes', icon: Swords },
      { name: 'Preguntas', href: '/admin/questions', icon: HelpCircle },
      { name: 'Importar Preguntas', href: '/admin/import', icon: Upload },
    ],
  },
  {
    section: 'Pulso de Conocimiento',
    items: [
      { name: 'Gestión del Pulso', href: '/admin/knowledge-pulse', icon: Radio },
      { name: 'Categorías del Pulso', href: '/admin/categories', icon: FolderKanban },
      { name: 'Configuración Slack', href: '/admin/slack', icon: MessageSquare },
    ],
  },
  {
    section: 'Rutas de Capacitación',
    items: [
      { name: 'Rutas del Jaguar Aviva', href: '/admin/journey', icon: Route },
      { name: 'Formularios', href: '/admin/forms', icon: FileText },
      { name: 'Certificados', href: '/admin/certificados', icon: Award },
      { name: 'Insignias', href: '/admin/insignias', icon: Medal },
    ],
  },
  {
    section: 'Configuración',
    items: [
      { name: 'Productos', href: '/admin/products', icon: Package },
      { name: 'Kioscos', href: '/admin/kioscos', icon: Store },
      { name: 'Niveles XP', href: '/admin/levels', icon: Layers },
      { name: 'Marca', href: '/admin/branding', icon: ImageIcon },
      { name: 'Inscripciones', href: '/admin/enrollments', icon: UserCheck },
      { name: 'Notificaciones', href: '/admin/notifications', icon: BellRing },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { name: 'Usuarios', href: '/admin/users', icon: Users },
      { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
      { name: 'Tokens', href: '/admin/tokens', icon: KeyRound },
      { name: 'Roles y Permisos', href: '/admin/roles', icon: ShieldCheck },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allowedPaths, setAllowedPaths] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (profile.rol === 'super_admin') {
      setAllowedPaths(null); // null = all access
      return;
    }
    getRolePermissions(profile.rol).then(paths => {
      setAllowedPaths(paths.length > 0 ? new Set(paths) : null);
    });
  }, [profile]);

  // Filter nav based on permissions (super_admin always sees everything)
  const filteredNavigation = navigation.map(entry => {
    if (allowedPaths === null) return entry; // super_admin or no config = show all
    if ('section' in entry) {
      return {
        ...entry,
        items: entry.items.filter(item => allowedPaths.has(item.href)),
      };
    }
    return entry;
  }).filter(entry => {
    // "Mi Equipo" solo tiene sentido para el rol capacitador
    if (!('section' in entry) && entry.href === '/admin/team') return profile?.rol === 'trainer';
    if ('section' in entry) return entry.items.length > 0;
    return true;
  });

  const handleLogout = async () => {
    await logout();
  };

  return (
    <AdminRoute requiredRoles={['super_admin', 'admin', 'trainer']}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar para mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 transform bg-accent text-white transition-transform lg:relative lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <AvivaLogo variant="icon" className="h-8 w-8" />
                <div>
                  <h1 className="text-lg font-bold">Admin Panel</h1>
                  <p className="text-xs text-white/70">Aviva LMS</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-white hover:bg-white/10"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* User Info */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {profile?.nombre?.charAt(0) || 'A'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{profile?.nombre}</p>
                  <p className="text-xs text-white/70 capitalize">{profile?.rol.replace('_', ' ')}</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {filteredNavigation.map((entry) => {
                if ('section' in entry) {
                  return (
                    <div key={entry.section} className="pt-3 first:pt-0">
                      <p className="px-3 mb-1 text-xs font-semibold text-white/40 uppercase tracking-wider">
                        {entry.section}
                      </p>
                      {entry.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                              isActive ? 'bg-white text-accent' : 'text-white/90 hover:bg-white/10'
                            )}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <Icon className="h-5 w-5" />
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  );
                }
                const Icon = entry.icon;
                const isActive = pathname === entry.href;
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-white text-accent' : 'text-white/90 hover:bg-white/10'
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className="h-5 w-5" />
                    {entry.name}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 space-y-2">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
              >
                <LayoutDashboard className="h-5 w-5" />
                Volver a la app
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top Bar */}
          <header className="flex h-16 items-center gap-4 border-b bg-card px-4 lg:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </Button>

            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">
                {(() => {
                  const extraTitles: Record<string, string> = {
                    '/admin/enrollments': 'Inscripciones y Progreso',
                    '/admin/notifications': 'Notificaciones',
                    '/admin/learning-paths': 'Rutas del Jaguar Aviva',
                    '/admin/levels': 'Niveles XP',
                  };
                  if (extraTitles[pathname]) return extraTitles[pathname];
                  for (const entry of navigation) {
                    if ('section' in entry) {
                      const found = entry.items.find((i) => i.href === pathname);
                      if (found) return found.name;
                    } else if (!('section' in entry) && entry.href === pathname) {
                      return entry.name;
                    }
                  }
                  return 'Admin Panel';
                })()}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {profile?.email}
              </span>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </AdminRoute>
  );
}
