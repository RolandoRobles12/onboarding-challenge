'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/use-firestore';
import { getKioscos, createKiosko, updateKiosko, deleteKiosko } from '@/lib/firestore-service';
import type { Kiosko } from '@/lib/types-scalable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Store, Plus, Pencil, Trash2, Loader2, Search, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function KioscosPage() {
  const { profile } = useAuth();
  const { products } = useProducts();
  const { toast } = useToast();

  const [kioscos, setKioscos] = useState<Kiosko[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Kiosko | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<{ name: string; location: string; productIds: string[] }>({
    name: '',
    location: '',
    productIds: [],
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const productMap = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products],
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await getKioscos();
      setKioscos(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return kioscos;
    return kioscos.filter(k =>
      k.name.toLowerCase().includes(q) ||
      k.location?.toLowerCase().includes(q)
    );
  }, [kioscos, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', location: '', productIds: [] });
    setDialogOpen(true);
  };

  const openEdit = (k: Kiosko) => {
    setEditingId(k.id);
    setForm({ name: k.name, location: k.location ?? '', productIds: k.productIds ?? [] });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !profile) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim() || undefined,
        productIds: form.productIds,
        active: true,
      };
      if (editingId) {
        await updateKiosko(editingId, payload);
        toast({ title: 'Kiosko actualizado' });
      } else {
        await createKiosko({ ...payload, active: true }, profile.uid);
        toast({ title: 'Kiosko creado' });
      }
      setDialogOpen(false);
      load();
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (k: Kiosko) => {
    try {
      await updateKiosko(k.id, { active: !k.active });
      setKioscos(prev => prev.map(x => x.id === k.id ? { ...x, active: !k.active } : x));
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteKiosko(deleteTarget.id);
      toast({ title: 'Kiosko eliminado' });
      setDeleteTarget(null);
      load();
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const toggleProduct = (pid: string) => {
    setForm(f => ({
      ...f,
      productIds: f.productIds.includes(pid)
        ? f.productIds.filter(x => x !== pid)
        : [...f.productIds, pid],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" /> Kioscos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Administra los puntos de venta y los productos disponibles en cada uno.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Nuevo kiosko
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar kiosco…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? 'Sin resultados' : 'No hay kioscos registrados'}</p>
          {!search && (
            <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Crear el primero
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(k => (
            <Card key={k.id} className={cn('transition-opacity', !k.active && 'opacity-60')}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{k.name}</span>
                    {!k.active && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactivo</Badge>
                    )}
                    {k.location && (
                      <span className="text-xs text-muted-foreground">{k.location}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {(k.productIds ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">Sin productos asignados</span>
                    ) : (
                      k.productIds.map(pid => {
                        const p = productMap[pid];
                        return p ? (
                          <Badge
                            key={pid}
                            variant="outline"
                            className="text-[11px] gap-1"
                            style={{ borderColor: p.color, color: p.color }}
                          >
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                            {p.name}
                          </Badge>
                        ) : null;
                      })
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => handleToggleActive(k)}
                    title={k.active ? 'Desactivar' : 'Activar'}
                  >
                    {k.active
                      ? <ToggleRight className="h-4 w-4 text-green-600" />
                      : <ToggleLeft className="h-4 w-4" />
                    }
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(k)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(k)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar kiosko' : 'Nuevo kiosko'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Modifica el nombre, ubicación y productos de este kiosko.'
                : 'Registra un nuevo punto de venta con sus productos disponibles.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Ej: 0001 Chalco"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Formato sugerido: número de 4 dígitos + nombre de zona.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Ubicación <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input
                placeholder="Ej: Plaza Las Américas, Ecatepec"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Productos disponibles</Label>
              {products.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay productos registrados.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {products.map(p => {
                    const checked = form.productIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProduct(p.id)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all text-left',
                          checked
                            ? 'border-primary/50 bg-primary/5 font-medium'
                            : 'border-border hover:bg-muted/50',
                        )}
                      >
                        <span
                          className="h-3 w-3 rounded-full shrink-0 border-2"
                          style={{
                            backgroundColor: checked ? p.color : 'transparent',
                            borderColor: p.color,
                          }}
                        />
                        <span className="truncate">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? 'Guardar cambios' : 'Crear kiosko'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar kiosko?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong> permanentemente.
              Los usuarios con este kiosko asignado no se verán afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
