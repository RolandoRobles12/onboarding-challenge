'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getAllRolePermissions, saveRolePermissions } from '@/lib/firestore-service';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Loader2, Save, Lock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lista completa de secciones/rutas del panel de admin
const NAV_SECTIONS = [
  {
    section: 'Catálogo de Contenido',
    items: [
      { label: 'Videos', path: '/admin/videos' },
      { label: 'Cursos', path: '/admin/courses' },
      { label: 'Evaluaciones y Desafíos', path: '/admin/quizzes' },
      { label: 'Preguntas', path: '/admin/questions' },
      { label: 'Importar Preguntas', path: '/admin/import' },
    ],
  },
  {
    section: 'Pulso de Conocimiento',
    items: [
      { label: 'Gestión del Pulso', path: '/admin/knowledge-pulse' },
      { label: 'Categorías del Pulso', path: '/admin/categories' },
      { label: 'Configuración Slack', path: '/admin/slack' },
    ],
  },
  {
    section: 'Rutas de Capacitación',
    items: [
      { label: 'Rutas del Jaguar Aviva', path: '/admin/journey' },
      { label: 'Formularios', path: '/admin/forms' },
      { label: 'Certificados', path: '/admin/certificados' },
      { label: 'Insignias', path: '/admin/insignias' },
    ],
  },
  {
    section: 'Configuración',
    items: [
      { label: 'Productos', path: '/admin/products' },
      { label: 'Kioscos', path: '/admin/kioscos' },
      { label: 'Niveles XP', path: '/admin/levels' },
      { label: 'Marca', path: '/admin/branding' },
      { label: 'Inscripciones', path: '/admin/enrollments' },
      { label: 'Notificaciones', path: '/admin/notifications' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { label: 'Usuarios', path: '/admin/users' },
      { label: 'Analytics', path: '/admin/analytics' },
      { label: 'Tokens', path: '/admin/tokens' },
      { label: 'Roles y Permisos', path: '/admin/roles' },
    ],
  },
];

const ALL_PATHS = NAV_SECTIONS.flatMap(s => s.items.map(i => i.path));

const CONFIGURABLE_ROLES = [
  { key: 'admin', label: 'Admin', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'trainer', label: 'Capacitador', color: 'bg-blue-100 text-blue-700 border-blue-200' },
];

export default function RolesPage() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.rol === 'super_admin';

  const [permissions, setPermissions] = useState<Record<string, Set<string>>>({
    admin: new Set(ALL_PATHS),
    trainer: new Set(ALL_PATHS),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    getAllRolePermissions().then(data => {
      const next: Record<string, Set<string>> = {
        admin: new Set(ALL_PATHS),
        trainer: new Set(ALL_PATHS),
      };
      for (const role of ['admin', 'trainer']) {
        if (data[role] && data[role].length > 0) {
          next[role] = new Set(data[role]);
        }
      }
      setPermissions(next);
    }).finally(() => setLoading(false));
  }, []);

  const toggle = (role: string, path: string) => {
    if (!isSuperAdmin) return;
    setPermissions(prev => {
      const set = new Set(prev[role]);
      if (set.has(path)) set.delete(path);
      else set.add(path);
      return { ...prev, [role]: set };
    });
  };

  const toggleSection = (role: string, paths: string[], allChecked: boolean) => {
    if (!isSuperAdmin) return;
    setPermissions(prev => {
      const set = new Set(prev[role]);
      paths.forEach(p => allChecked ? set.delete(p) : set.add(p));
      return { ...prev, [role]: set };
    });
  };

  const handleSave = async (role: string) => {
    if (!profile) return;
    setSaving(role);
    try {
      await saveRolePermissions(role, Array.from(permissions[role]), profile.uid);
      toast({ title: `Permisos de ${role} guardados` });
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Acceso restringido</h2>
        <p className="text-muted-foreground text-sm">Solo los Super Admins pueden configurar permisos de roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" /> Roles y Permisos
        </h1>
        <p className="text-muted-foreground mt-1">
          Configura qué secciones del panel puede ver cada rol. El <strong>Super Admin</strong> siempre tiene acceso total.
        </p>
      </div>

      {/* Super admin info */}
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="pt-4 pb-3 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Super Admin — Acceso total garantizado</p>
            <p className="text-xs text-red-600">Los Super Admins ven todas las secciones independientemente de esta configuración.</p>
          </div>
          <Badge className="ml-auto bg-red-100 text-red-700 border-red-200 shrink-0">super_admin</Badge>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando permisos...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {CONFIGURABLE_ROLES.map(({ key: role, label, color }) => (
            <Card key={role} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className={cn('border', color)}>{label}</Badge>
                      Permisos de acceso
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {permissions[role].size} de {ALL_PATHS.length} secciones habilitadas
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSave(role)}
                    disabled={saving === role}
                    className="gap-1.5"
                  >
                    {saving === role
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Save className="h-3.5 w-3.5" />}
                    Guardar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {NAV_SECTIONS.map(section => {
                  const paths = section.items.map(i => i.path);
                  const allChecked = paths.every(p => permissions[role].has(p));
                  const someChecked = paths.some(p => permissions[role].has(p));

                  return (
                    <div key={section.section}>
                      {/* Section header with toggle-all */}
                      <button
                        className="flex items-center gap-2 w-full mb-2 group"
                        onClick={() => toggleSection(role, paths, allChecked)}
                      >
                        <div className={cn(
                          'h-4 w-4 rounded border flex items-center justify-center transition-colors',
                          allChecked ? 'bg-primary border-primary' : someChecked ? 'border-primary bg-primary/20' : 'border-muted-foreground/40'
                        )}>
                          {allChecked && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                          {someChecked && !allChecked && <div className="h-1.5 w-1.5 rounded-sm bg-primary" />}
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                          {section.section}
                        </span>
                      </button>

                      {/* Items */}
                      <div className="space-y-1 pl-1">
                        {section.items.map(item => {
                          const checked = permissions[role].has(item.path);
                          return (
                            <label
                              key={item.path}
                              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors select-none"
                            >
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 accent-primary"
                                checked={checked}
                                onChange={() => toggle(role, item.path)}
                              />
                              <span className={cn('text-sm', !checked && 'text-muted-foreground line-through')}>
                                {item.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
