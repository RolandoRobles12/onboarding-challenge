'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useProducts } from '@/hooks/use-firestore';
import { getAllUsers, updateUserProfile, addToWhitelist, getKioscos, getUserAllJourneyProgress, resetUserJourneyProgress } from '@/lib/firestore-service';
import { Combobox } from '@/components/ui/combobox';
import type { Kiosko } from '@/lib/types-scalable';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users, Search, UserCog, Plus, Trash2,
  Loader2, RefreshCw, CheckCircle, UserX, UserCheck,
  Upload, FileSpreadsheet, AlertCircle, ArrowRight, X, Mail, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserProfile, UserRole, UserJourneyProgress } from '@/lib/types-scalable';

// ── Constants ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  trainer: 'Capacitador',
  seller: 'Jaguar Aviva',
};

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-700 border-red-200',
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  trainer: 'bg-blue-100 text-blue-700 border-blue-200',
  seller: 'bg-green-100 text-green-700 border-green-200',
};

const CSV_COLUMNS = ['email', 'nombre', 'rol', 'kiosko', 'producto', 'fecha_ingreso', 'capacitador_email'];

type CsvRow = {
  email: string;
  nombre?: string;
  rol?: string;
  kiosko?: string;
  producto?: string;
  fecha_ingreso?: string;
  capacitador_email?: string;
  _status: 'update' | 'whitelist' | 'error';
  _error?: string;
};

// ── Component ──────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { profile: currentUser } = useAuth();
  const { products } = useProducts();
  const [kioscos, setKioscos] = useState<Kiosko[]>([]);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');

  // Edit user
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({
    nombre: '',
    rol: 'seller' as UserRole,
    producto: '',
    assignedKiosko: '',
    trainerId: '',
    fechaIngreso: '',
  });
  const [saving, setSaving] = useState(false);
  const [journeyProgress, setJourneyProgress] = useState<UserJourneyProgress[]>([]);
  const [loadingJourney, setLoadingJourney] = useState(false);
  const [resettingJourneyId, setResettingJourneyId] = useState<string | null>(null);

  // Bulk deactivate
  const [bulkDeactivateOpen, setBulkDeactivateOpen] = useState(false);
  const [bulkEmailsInput, setBulkEmailsInput] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  // Reactivate confirm
  const [reactivatingUser, setReactivatingUser] = useState<UserProfile | null>(null);


  // Invite user
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', rol: 'seller' as UserRole, assignedKiosko: '', producto: '' });
  const [inviting, setInviting] = useState(false);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ updated: number; whitelist: number; errors: number } | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [usersData, kioscosData] = await Promise.all([getAllUsers(), getKioscos()]);
      setUsers(usersData);
      setKioscos(kioscosData);
    } catch (err: unknown) {
      toast({ title: 'Error al cargar datos', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeUsers = useMemo(() => users.filter(u => u.active !== false), [users]);
  const inactiveUsers = useMemo(() => users.filter(u => u.active === false), [users]);
  const trainers = useMemo(() => activeUsers.filter(u => u.rol === 'trainer'), [activeUsers]);

  const filteredActive = useMemo(() => activeUsers.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = u.nombre?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.assignedKiosko?.toLowerCase().includes(q);
    const matchRole = filterRole === 'all' || u.rol === filterRole;
    return matchSearch && matchRole;
  }), [activeUsers, search, filterRole]);

  const filteredInactive = useMemo(() => inactiveUsers.filter(u => {
    const q = search.toLowerCase();
    return u.nombre?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  }), [inactiveUsers, search]);

  const roleCounts = useMemo(() => activeUsers.reduce((acc, u) => {
    acc[u.rol] = (acc[u.rol] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [activeUsers]);

  const getProductName = (id?: string) => products.find(p => p.id === id)?.name || id || '—';
  const getTrainerName = (id?: string) => {
    if (!id) return '—';
    const t = users.find(u => u.uid === id);
    return t ? (t.nombre || t.email) : id;
  };

  // ── Edit user ─────────────────────────────────────────────────────────────

  const openEdit = (user: UserProfile) => {
    setEditingUser(user);
    setEditForm({
      nombre: user.nombre || '',
      rol: user.rol,
      producto: user.producto || '',
      assignedKiosko: user.assignedKiosko || '',
      trainerId: user.trainerId || '',
      fechaIngreso: user.fechaIngreso || '',
    });
    setJourneyProgress([]);
    setLoadingJourney(true);
    getUserAllJourneyProgress(user.uid)
      .then(setJourneyProgress)
      .finally(() => setLoadingJourney(false));
  };

  const handleResetJourney = async (journeyId: string) => {
    if (!editingUser) return;
    setResettingJourneyId(journeyId);
    try {
      await resetUserJourneyProgress(editingUser.uid, journeyId);
      setJourneyProgress(prev => prev.filter(p => p.journeyId !== journeyId));
      toast({ title: 'Journey reseteado', description: 'El progreso del journey fue eliminado. El usuario comenzará desde cero.' });
    } catch {
      toast({ title: 'Error', description: 'No se pudo resetear el journey.', variant: 'destructive' });
    } finally {
      setResettingJourneyId(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const updates: Partial<UserProfile> = {
        nombre: editForm.nombre || editingUser.nombre,
        rol: editForm.rol,
        producto: editForm.producto || undefined,
        assignedKiosko: editForm.assignedKiosko || undefined,
        trainerId: editForm.trainerId || undefined,
        fechaIngreso: editForm.fechaIngreso || undefined,
      };
      await updateUserProfile(editingUser.uid, updates);
      setUsers(prev => prev.map(u => u.uid === editingUser.uid ? { ...u, ...updates } : u));
      toast({ title: 'Usuario actualizado' });
      setEditingUser(null);
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Bulk deactivate ───────────────────────────────────────────────────────

  const bulkMatchedUsers = useMemo(() => {
    if (!bulkEmailsInput.trim()) return [];
    const emails = bulkEmailsInput.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
    return emails.map(email => ({
      email,
      user: activeUsers.find(u => u.email.toLowerCase() === email) || null,
    }));
  }, [bulkEmailsInput, activeUsers]);

  const handleBulkDeactivate = async () => {
    const toDeactivate = bulkMatchedUsers.filter(m => m.user);
    if (toDeactivate.length === 0) return;
    setDeactivating(true);
    try {
      await Promise.all(toDeactivate.map(m => updateUserProfile(m.user!.uid, { active: false })));
      setUsers(prev => prev.map(u => {
        const found = toDeactivate.find(m => m.user?.uid === u.uid);
        return found ? { ...u, active: false } : u;
      }));
      toast({ title: `${toDeactivate.length} usuario${toDeactivate.length !== 1 ? 's' : ''} desactivado${toDeactivate.length !== 1 ? 's' : ''}` });
      setBulkDeactivateOpen(false);
      setBulkEmailsInput('');
    } catch (err: unknown) {
      toast({ title: 'Error al desactivar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setDeactivating(false);
    }
  };

  // ── Reactivate ────────────────────────────────────────────────────────────

  const handleReactivate = async (user: UserProfile) => {
    try {
      await updateUserProfile(user.uid, { active: true });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, active: true } : u));
      toast({ title: `${user.nombre || user.email} reactivado` });
      setReactivatingUser(null);
    } catch (err: unknown) {
      toast({ title: 'Error al reactivar', variant: 'destructive' });
    }
  };


  // ── Invite user ───────────────────────────────────────────────────────────

  const handleInvite = async () => {
    if (!inviteForm.email.trim() || !inviteForm.email.includes('@')) {
      toast({ title: 'Email inválido', variant: 'destructive' });
      return;
    }
    setInviting(true);
    try {
      const prod = inviteForm.producto ? products.find(p => p.id === inviteForm.producto) : null;
      await addToWhitelist({
        organizationId: 'aviva-credito',
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.rol,
        assignedKiosko: inviteForm.assignedKiosko || undefined,
        assignedProductId: prod?.id || undefined,
        addedBy: currentUser?.uid || '',
        expiresAt: undefined,
      } as never);
      toast({ title: 'Usuario invitado', description: `${inviteForm.email} fue agregado a la whitelist.` });
      setInviteOpen(false);
      setInviteForm({ email: '', rol: 'seller', assignedKiosko: '', producto: '' });
    } catch (err: unknown) {
      toast({ title: 'Error al invitar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  // ── CSV / XLS import ──────────────────────────────────────────────────────

  const userEmailSet = useMemo(() => new Set(users.map(u => u.email.toLowerCase())), [users]);

  function parseRows(raw: Record<string, string>[]): CsvRow[] {
    return raw.map(row => {
      const email = (row.email || row.Email || row.correo || '').trim().toLowerCase();
      if (!email) return { ...row, email: '', _status: 'error', _error: 'Email vacío' } as CsvRow;
      if (!email.includes('@')) return { email, _status: 'error', _error: 'Email inválido' } as CsvRow;
      const status = userEmailSet.has(email) ? 'update' : 'whitelist';
      return {
        email,
        nombre: row.nombre || row.Nombre || '',
        rol: row.rol || row.Rol || row.role || 'seller',
        kiosko: row.kiosko || row.Kiosko || row.hub || '',
        producto: row.producto || row.Producto || '',
        fecha_ingreso: row.fecha_ingreso || row['Fecha Ingreso'] || row.fechaIngreso || '',
        capacitador_email: row.capacitador_email || row.capacitador || '',
        _status: status,
      } as CsvRow;
    });
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResults(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          setCsvRows(parseRows(res.data as Record<string, string>[]));
        },
        error: () => toast({ title: 'Error al leer CSV', variant: 'destructive' }),
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        setCsvRows(parseRows(data));
      };
      reader.readAsBinaryString(file);
    } else {
      toast({ title: 'Formato no soportado. Usa .csv, .xlsx o .xls', variant: 'destructive' });
    }
    // Reset input for re-upload
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const exampleKiosko = kioscos.length > 0 ? kioscos[0].name : '0001 Chalco';
    const productRows = products.map(p => [
      `vendedor_${p.name.toLowerCase().replace(/\s+/g, '_')}@empresa.com`,
      `Vendedor Ejemplo ${p.name}`,
      'seller',
      exampleKiosko,
      p.id,
      new Date().toISOString().split('T')[0],
      '',
    ]);
    const rows = [
      CSV_COLUMNS,
      ...(productRows.length > 0
        ? productRows
        : [['juan@empresa.com', 'Juan García', 'seller', exampleKiosko, '', new Date().toISOString().split('T')[0], '']]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    XLSX.writeFile(wb, 'plantilla_usuarios.xlsx');
  };

  const handleImport = async () => {
    const validRows = csvRows.filter(r => r._status !== 'error');
    if (validRows.length === 0) return;
    setImporting(true);
    let updated = 0, newWL = 0, errors = 0;
    try {
      for (const row of validRows) {
        try {
          if (row._status === 'update') {
            const user = users.find(u => u.email.toLowerCase() === row.email);
            if (!user) { errors++; continue; }
            const trainer = row.capacitador_email ? users.find(u => u.email.toLowerCase() === row.capacitador_email!.toLowerCase()) : null;
            const prod = row.producto ? products.find(p => p.name.toLowerCase() === row.producto!.toLowerCase() || p.id === row.producto) : null;
            await updateUserProfile(user.uid, {
              ...(row.nombre ? { nombre: row.nombre } : {}),
              ...(row.rol && ['seller','trainer','admin','super_admin'].includes(row.rol) ? { rol: row.rol as UserRole } : {}),
              ...(row.kiosko ? { assignedKiosko: row.kiosko } : {}),
              ...(prod ? { producto: prod.id } : {}),
              ...(row.fecha_ingreso ? { fechaIngreso: row.fecha_ingreso } : {}),
              ...(trainer ? { trainerId: trainer.uid } : {}),
            });
            updated++;
          } else {
            const prod = row.producto ? products.find(p => p.name.toLowerCase() === row.producto!.toLowerCase() || p.id === row.producto) : null;
            await addToWhitelist({
              organizationId: 'aviva-credito',
              email: row.email,
              role: (row.rol && ['seller','trainer','admin','super_admin'].includes(row.rol) ? row.rol : 'seller') as UserRole,
              assignedKiosko: row.kiosko || undefined,
              assignedProductId: prod?.id || undefined,
              addedBy: currentUser?.uid || '',
              expiresAt: undefined,
            } as never);
            newWL++;
          }
        } catch {
          errors++;
        }
      }
      setImportResults({ updated, whitelist: newWL, errors });
      toast({ title: `Importación completada: ${updated} actualizados, ${newWL} en whitelist, ${errors} errores` });
      await fetchAll();
    } finally {
      setImporting(false);
    }
  };

  // ── User Card ─────────────────────────────────────────────────────────────

  function UserCard({ user, showReactivate }: { user: UserProfile; showReactivate?: boolean }) {
    return (
      <Card className={cn('transition-colors', showReactivate ? 'opacity-70' : 'hover:border-primary/30')}>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">
            {(user.nombre || user.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate">{user.nombre || '(sin nombre)'}</p>
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full border font-medium shrink-0', ROLE_COLORS[user.rol])}>
                {ROLE_LABELS[user.rol]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {user.producto && <span>Producto: {getProductName(user.producto)}</span>}
              {user.assignedKiosko && <span>Hub: {user.assignedKiosko}</span>}
              {user.trainerId && <span>Capacitador: {getTrainerName(user.trainerId)}</span>}
              {user.fechaIngreso && <span>Ingreso: {user.fechaIngreso}</span>}
            </div>
          </div>
          {showReactivate ? (
            <Button size="sm" variant="outline" onClick={() => setReactivatingUser(user)} className="shrink-0 gap-1">
              <UserCheck className="h-3.5 w-3.5" /> Reactivar
            </Button>
          ) : (
            <Button
              variant="outline" size="sm"
              onClick={() => openEdit(user)}
              disabled={user.uid === currentUser?.uid}
              className="gap-1 shrink-0"
            >
              <UserCog className="h-3.5 w-3.5" /> Editar
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground mt-1">Gestiona usuarios, accesos e importa desde CSV/XLS</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <Mail className="h-4 w-4" /> Invitar usuario
          </Button>
          <Button variant="outline" onClick={fetchAll} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
          <Card key={role} className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setFilterRole(filterRole === role ? 'all' : role)}>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{roleCounts[role] || 0}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{ROLE_LABELS[role]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="active">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="active" className="gap-1.5">
            <Users className="h-4 w-4" /> Activos ({activeUsers.length})
          </TabsTrigger>
          <TabsTrigger value="inactive" className="gap-1.5">
            <UserX className="h-4 w-4" /> Inactivos ({inactiveUsers.length})
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> Importar
          </TabsTrigger>
        </TabsList>

        {/* ── Active users ───────────────────────────────────────────── */}
        <TabsContent value="active" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar nombre, email o hub..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/5"
              onClick={() => setBulkDeactivateOpen(true)}>
              <UserX className="h-4 w-4" /> Desactivar en bulk
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : filteredActive.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <UserX className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No se encontraron usuarios</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filteredActive.map(u => <UserCard key={u.uid} user={u} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Inactive users ─────────────────────────────────────────── */}
        <TabsContent value="inactive" className="space-y-4 mt-4">
          {inactiveUsers.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-3" />
              <p className="text-muted-foreground">No hay usuarios desactivados</p>
            </CardContent></Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Estos usuarios tienen acceso bloqueado. Puedes reactivarlos en cualquier momento.
              </p>
              <div className="space-y-2">
                {filteredInactive.map(u => <UserCard key={u.uid} user={u} showReactivate />)}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── CSV / XLS Import ───────────────────────────────────────── */}
        <TabsContent value="import" className="space-y-5 mt-4">
          {/* Instructions */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">¿Cómo funciona la importación?</p>
                  <p className="text-muted-foreground">
                    Si el email <strong>ya existe</strong> en la plataforma se actualiza el perfil del usuario.
                    Si <strong>no existe</strong>, se agrega a la whitelist para que el usuario se registre por primera vez.
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Columnas aceptadas: <code className="bg-muted rounded px-1">{CSV_COLUMNS.join(', ')}</code>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> Subir archivo CSV / XLS
            </Button>
            <Button variant="ghost" onClick={downloadTemplate} className="gap-2 text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" /> Descargar plantilla XLS
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Preview */}
          {csvRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-medium">{csvRows.length} filas</span>
                  <span className="text-blue-600 flex items-center gap-1">
                    <ArrowRight className="h-3.5 w-3.5" />
                    {csvRows.filter(r => r._status === 'update').length} actualizarán perfil
                  </span>
                  <span className="text-green-600 flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    {csvRows.filter(r => r._status === 'whitelist').length} irán a whitelist
                  </span>
                  {csvRows.filter(r => r._status === 'error').length > 0 && (
                    <span className="text-destructive flex items-center gap-1">
                      <X className="h-3.5 w-3.5" />
                      {csvRows.filter(r => r._status === 'error').length} con error
                    </span>
                  )}
                </div>
                <Button onClick={handleImport} disabled={importing || csvRows.filter(r => r._status !== 'error').length === 0} className="gap-2">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Importar {csvRows.filter(r => r._status !== 'error').length} registros
                </Button>
              </div>

              <div className="border rounded-xl overflow-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Estado</th>
                      <th className="px-3 py-2 text-left font-semibold">Email</th>
                      <th className="px-3 py-2 text-left font-semibold">Nombre</th>
                      <th className="px-3 py-2 text-left font-semibold">Rol</th>
                      <th className="px-3 py-2 text-left font-semibold">Hub</th>
                      <th className="px-3 py-2 text-left font-semibold">Producto</th>
                      <th className="px-3 py-2 text-left font-semibold">Ingreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((row, idx) => (
                      <tr key={idx} className={cn('border-t', row._status === 'error' && 'bg-destructive/5')}>
                        <td className="px-3 py-2 shrink-0">
                          {row._status === 'update' && (
                            <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-[10px]">Actualizar</Badge>
                          )}
                          {row._status === 'whitelist' && (
                            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-[10px]">Nuevo</Badge>
                          )}
                          {row._status === 'error' && (
                            <Badge variant="destructive" className="text-[10px]">{row._error}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.email || '—'}</td>
                        <td className="px-3 py-2">{row.nombre || '—'}</td>
                        <td className="px-3 py-2">{row.rol || '—'}</td>
                        <td className="px-3 py-2">{row.kiosko || '—'}</td>
                        <td className="px-3 py-2">{row.producto || '—'}</td>
                        <td className="px-3 py-2">{row.fecha_ingreso || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import results */}
              {importResults && (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="pt-4 pb-3">
                    <p className="font-semibold text-green-800 text-sm">Importación completada</p>
                    <div className="flex gap-4 mt-2 text-sm text-green-700">
                      <span>{importResults.updated} perfiles actualizados</span>
                      <span>{importResults.whitelist} añadidos a whitelist</span>
                      {importResults.errors > 0 && <span className="text-destructive">{importResults.errors} errores</span>}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Edit user dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>{editingUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Nombre completo</Label>
                <Input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del usuario" />
              </div>

              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select value={editForm.rol} onValueChange={v => setEditForm(f => ({ ...f, rol: v as UserRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Producto asignado</Label>
                <Select value={editForm.producto || '__none__'} onValueChange={v => {
                  const newProducto = v === '__none__' ? '' : v;
                  // Clear hub if it doesn't belong to the new product
                  const stillValid = kioscos.some(k => k.active && k.productIds?.includes(newProducto) && k.name === editForm.assignedKiosko);
                  setEditForm(f => ({ ...f, producto: newProducto, assignedKiosko: stillValid ? f.assignedKiosko : '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Sin producto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin producto</SelectItem>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(() => {
                const productKioscos = kioscos.filter(k => k.active && (editForm.producto ? k.productIds?.includes(editForm.producto) : false));
                if (!editForm.producto || productKioscos.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <Label>Hub / Kiosko <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                    <Combobox
                      options={productKioscos.map(k => ({ value: k.name, label: k.name, description: k.location }))}
                      value={editForm.assignedKiosko}
                      onChange={v => setEditForm(f => ({ ...f, assignedKiosko: v }))}
                      placeholder="Seleccionar kiosko…"
                      searchPlaceholder="Buscar kiosko…"
                      emptyLabel="No hay kioscos para este producto"
                    />
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <Label>Fecha de ingreso</Label>
                <Input
                  type="date"
                  value={editForm.fechaIngreso}
                  onChange={e => setEditForm(f => ({ ...f, fechaIngreso: e.target.value }))}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Capacitador asignado <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                <Select value={editForm.trainerId || '__none__'} onValueChange={v => setEditForm(f => ({ ...f, trainerId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Sin capacitador" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin capacitador</SelectItem>
                    {trainers.map(t => (
                      <SelectItem key={t.uid} value={t.uid}>{t.nombre || t.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {trainers.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay usuarios con rol "Capacitador" activos.</p>
                )}
              </div>
            </div>
          </div>
          {/* Journey progress reset */}
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Progreso del Journey
            </p>
            {loadingJourney ? (
              <p className="text-xs text-muted-foreground">Cargando...</p>
            ) : journeyProgress.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin progreso registrado.</p>
            ) : (
              <div className="space-y-2">
                {journeyProgress.map(jp => (
                  <div key={jp.id} className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/30">
                    <div>
                      <p className="text-xs font-medium">Journey: <span className="font-mono text-[10px] text-muted-foreground">{jp.journeyId}</span></p>
                      <p className="text-[10px] text-muted-foreground">
                        {jp.completedStepIds.length} pasos completados
                        {jp.updatedAt && ` · actualizado ${new Date((jp.updatedAt as unknown as { seconds: number }).seconds * 1000).toLocaleDateString('es-MX')}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/5"
                      disabled={resettingJourneyId === jp.journeyId}
                      onClick={() => handleResetJourney(jp.journeyId)}
                    >
                      {resettingJourneyId === jp.journeyId
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RotateCcw className="h-3 w-3" />}
                      Resetear
                    </Button>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">Resetear elimina todo el progreso del journey. El usuario comenzará desde el paso 1.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk deactivate dialog ────────────────────────────────────────── */}
      <Dialog open={bulkDeactivateOpen} onOpenChange={v => { setBulkDeactivateOpen(v); if (!v) setBulkEmailsInput(''); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Desactivar usuarios en bulk</DialogTitle>
            <DialogDescription>
              Pega los correos de los usuarios que deseas desactivar (uno por línea, o separados por coma).
              Se bloqueará su acceso inmediatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea
              value={bulkEmailsInput}
              onChange={e => setBulkEmailsInput(e.target.value)}
              placeholder={'juan@empresa.com\nmaria@empresa.com\ncarlos@empresa.com'}
              rows={6}
              className="font-mono text-xs"
            />

            {bulkMatchedUsers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {bulkMatchedUsers.filter(m => m.user).length} usuarios encontrados
                </p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {bulkMatchedUsers.map(({ email, user }) => (
                    <div key={email} className={cn('flex items-center gap-2 text-xs px-2 py-1 rounded', user ? 'bg-orange-50 text-orange-700' : 'bg-muted text-muted-foreground line-through')}>
                      {user ? <UserX className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                      <span>{email}</span>
                      {!user && <span className="ml-auto text-[10px]">no encontrado</span>}
                      {user && <span className="ml-auto font-medium">{user.nombre}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeactivateOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleBulkDeactivate}
              disabled={deactivating || bulkMatchedUsers.filter(m => m.user).length === 0}
            >
              {deactivating
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <UserX className="h-4 w-4 mr-2" />
              }
              Desactivar {bulkMatchedUsers.filter(m => m.user).length} usuarios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite user dialog ────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={v => { setInviteOpen(v); if (!v) setInviteForm({ email: '', rol: 'seller', assignedKiosko: '', producto: '' }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Invitar usuario</DialogTitle>
            <DialogDescription>
              El usuario recibirá acceso al ingresar con este email. Si ya existe en la plataforma, actualiza su perfil directamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                placeholder="usuario@empresa.com"
                value={inviteForm.email}
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={inviteForm.rol} onValueChange={v => setInviteForm(f => ({ ...f, rol: v as UserRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Producto asignado <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Select value={inviteForm.producto || '__none__'} onValueChange={v => {
                const newProducto = v === '__none__' ? '' : v;
                const stillValid = kioscos.some(k => k.active && k.productIds?.includes(newProducto) && k.name === inviteForm.assignedKiosko);
                setInviteForm(f => ({ ...f, producto: newProducto, assignedKiosko: stillValid ? f.assignedKiosko : '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="Sin producto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin producto</SelectItem>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(() => {
              const productKioscos = kioscos.filter(k => k.active && (inviteForm.producto ? k.productIds?.includes(inviteForm.producto) : false));
              if (!inviteForm.producto || productKioscos.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <Label>Hub / Kiosko <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                  <Combobox
                    options={productKioscos.map(k => ({ value: k.name, label: k.name, description: k.location }))}
                    value={inviteForm.assignedKiosko}
                    onChange={v => setInviteForm(f => ({ ...f, assignedKiosko: v }))}
                    placeholder="Seleccionar kiosko…"
                    searchPlaceholder="Buscar kiosko…"
                    emptyLabel="No hay kioscos para este producto"
                  />
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteForm.email.trim()} className="gap-2">
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Invitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reactivate confirm ────────────────────────────────────────────── */}
      <AlertDialog open={!!reactivatingUser} onOpenChange={() => setReactivatingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reactivar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{reactivatingUser?.nombre || reactivatingUser?.email}</strong> recuperará acceso completo a la plataforma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => reactivatingUser && handleReactivate(reactivatingUser)}>
              Reactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
