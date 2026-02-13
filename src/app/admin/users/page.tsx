'use client';

import { useState, useEffect, useMemo } from 'react';
import { useProducts } from '@/hooks/use-firestore';
import { getAllUsers, updateUserProfile, addToWhitelist, getWhitelistEntries, deleteWhitelistEntry } from '@/lib/firestore-service';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users, Search, UserCog, ShieldCheck, Mail, Plus, Trash2,
  Loader2, RefreshCw, CheckCircle, Clock, UserX
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserProfile, UserRole, WhitelistEntry } from '@/lib/types-scalable';
import { Skeleton } from '@/components/ui/skeleton';

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  trainer: 'Trainer',
  seller: 'Vendedor',
};

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-700 border-red-200',
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  trainer: 'bg-blue-100 text-blue-700 border-blue-200',
  seller: 'bg-green-100 text-green-700 border-green-200',
};

export default function UsersPage() {
  const { profile: currentUser } = useAuth();
  const { products } = useProducts();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWL, setLoadingWL] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');

  // Edit role dialog
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('seller');
  const [savingRole, setSavingRole] = useState(false);

  // Whitelist add dialog
  const [addWLOpen, setAddWLOpen] = useState(false);
  const [wlForm, setWLForm] = useState({ email: '', role: 'seller' as UserRole, kiosko: '', productId: '' });
  const [savingWL, setSavingWL] = useState(false);

  // Delete whitelist
  const [deletingWL, setDeletingWL] = useState<WhitelistEntry | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (err: any) {
      toast({ title: 'Error al cargar usuarios', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchWhitelist = async () => {
    setLoadingWL(true);
    try {
      const data = await getWhitelistEntries();
      setWhitelist(data);
    } catch (err: any) {
      toast({ title: 'Error al cargar whitelist', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingWL(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchWhitelist();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.nombre?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === 'all' || u.rol === filterRole;
      return matchSearch && matchRole;
    });
  }, [users, search, filterRole]);

  const handleEditRole = (user: UserProfile) => {
    setEditingUser(user);
    setNewRole(user.rol);
  };

  const handleSaveRole = async () => {
    if (!editingUser) return;
    setSavingRole(true);
    try {
      await updateUserProfile(editingUser.uid, { rol: newRole });
      setUsers((prev) => prev.map((u) => (u.uid === editingUser.uid ? { ...u, rol: newRole } : u)));
      toast({ title: 'Rol actualizado correctamente' });
      setEditingUser(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingRole(false);
    }
  };

  const handleAddWhitelist = async () => {
    if (!wlForm.email.trim()) {
      toast({ title: 'El email es obligatorio', variant: 'destructive' });
      return;
    }
    setSavingWL(true);
    try {
      await addToWhitelist({
        organizationId: 'aviva-credito',
        email: wlForm.email.trim().toLowerCase(),
        role: wlForm.role,
        assignedKiosko: wlForm.kiosko || undefined,
        assignedProductId: wlForm.productId || undefined,
        addedBy: currentUser?.uid || '',
        expiresAt: undefined,
      } as any);
      await fetchWhitelist();
      toast({ title: '✅ Email agregado a la whitelist' });
      setAddWLOpen(false);
      setWLForm({ email: '', role: 'seller', kiosko: '', productId: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingWL(false);
    }
  };

  const handleDeleteWL = async (entry: WhitelistEntry) => {
    try {
      await deleteWhitelistEntry(entry.id);
      setWhitelist((prev) => prev.filter((w) => w.id !== entry.id));
      toast({ title: 'Entrada eliminada de la whitelist' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingWL(null);
    }
  };

  const roleCounts = useMemo(() => {
    return users.reduce(
      (acc, u) => {
        acc[u.rol] = (acc[u.rol] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [users]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground mt-1">Gestiona usuarios registrados y accesos</p>
        </div>
        <Button variant="outline" onClick={() => { fetchUsers(); fetchWhitelist(); }} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
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

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" /> Usuarios ({users.length})
          </TabsTrigger>
          <TabsTrigger value="whitelist" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Whitelist ({whitelist.length})
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4 mt-4">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <UserX className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No se encontraron usuarios</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <Card key={user.uid} className="hover:border-primary/30 transition-colors">
                  <CardContent className="flex items-center gap-4 py-3 px-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-semibold">
                      {(user.nombre || user.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{user.nombre || '(sin nombre)'}</p>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full border font-medium', ROLE_COLORS[user.rol])}>
                          {ROLE_LABELS[user.rol]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      {user.producto && (
                        <p className="text-xs text-muted-foreground">
                          Producto: {products.find((p) => p.id === user.producto)?.name || user.producto}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditRole(user)}
                      className="gap-1 flex-shrink-0"
                      disabled={user.uid === currentUser?.uid}
                    >
                      <UserCog className="h-3.5 w-3.5" /> Rol
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Whitelist Tab */}
        <TabsContent value="whitelist" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddWLOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Agregar Email
            </Button>
          </div>

          {loadingWL ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : whitelist.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No hay entradas en la whitelist</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {whitelist.map((entry) => (
                <Card key={entry.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="flex items-center gap-4 py-3 px-4">
                    <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{entry.email}</p>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full border font-medium', ROLE_COLORS[entry.role])}>
                          {ROLE_LABELS[entry.role]}
                        </span>
                        {entry.used ? (
                          <span className="text-xs flex items-center gap-0.5 text-green-600">
                            <CheckCircle className="h-3 w-3" /> Usado
                          </span>
                        ) : (
                          <span className="text-xs flex items-center gap-0.5 text-muted-foreground">
                            <Clock className="h-3 w-3" /> Pendiente
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        {entry.assignedKiosko && <span>Kiosko: {entry.assignedKiosko}</span>}
                        {entry.assignedProductId && (
                          <span>Producto: {products.find((p) => p.id === entry.assignedProductId)?.name || entry.assignedProductId}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:text-destructive flex-shrink-0"
                      onClick={() => setDeletingWL(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Rol</DialogTitle>
            <DialogDescription>
              Cambia el rol de <strong>{editingUser?.nombre || editingUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Nuevo Rol</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={handleSaveRole} disabled={savingRole}>
              {savingRole ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Whitelist Dialog */}
      <Dialog open={addWLOpen} onOpenChange={setAddWLOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar a Whitelist</DialogTitle>
            <DialogDescription>
              El usuario podrá registrarse con este email y se le asignará el rol indicado automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={wlForm.email}
                onChange={(e) => setWLForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="usuario@empresa.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Rol</Label>
              <Select value={wlForm.role} onValueChange={(v) => setWLForm((p) => ({ ...p, role: v as UserRole }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kiosko (opcional)</Label>
                <Input
                  value={wlForm.kiosko}
                  onChange={(e) => setWLForm((p) => ({ ...p, kiosko: e.target.value }))}
                  placeholder="Ej: CDMX-01"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Producto (opcional)</Label>
                <Select value={wlForm.productId} onValueChange={(v) => setWLForm((p) => ({ ...p, productId: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin asignar</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddWLOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddWhitelist} disabled={savingWL} className="gap-2">
              {savingWL ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Whitelist Confirm */}
      <AlertDialog open={!!deletingWL} onOpenChange={() => setDeletingWL(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar de la whitelist?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deletingWL?.email}</strong> de la whitelist. El usuario no podrá registrarse con este email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingWL && handleDeleteWL(deletingWL)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
