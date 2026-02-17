'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getAllCertificateSigners,
  createCertificateSigner,
  updateCertificateSigner,
  deleteCertificateSigner,
} from '@/lib/firestore-service';
import type { CertificateSigner } from '@/lib/types-scalable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PenLine, Plus, Pencil, Trash2, GripVertical, UserCheck } from 'lucide-react';

const DEFAULT_FORM = { name: '', position: '' };

export default function CertificateSignersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [signers, setSigners] = useState<CertificateSigner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingSigner, setEditingSigner] = useState<CertificateSigner | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const data = await getAllCertificateSigners();
    setSigners(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openDialog(signer?: CertificateSigner) {
    if (signer) {
      setEditingSigner(signer);
      setForm({ name: signer.name, position: signer.position });
    } else {
      setEditingSigner(null);
      setForm(DEFAULT_FORM);
    }
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.position.trim()) {
      toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Completa el nombre y el cargo.' });
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      if (editingSigner) {
        await updateCertificateSigner(editingSigner.id, {
          name: form.name.trim(),
          position: form.position.trim(),
        });
        toast({ title: 'Firmante actualizado' });
      } else {
        await createCertificateSigner(
          {
            organizationId: 'aviva-credito',
            name: form.name.trim(),
            position: form.position.trim(),
            active: true,
            order: signers.length,
            createdBy: user.uid,
          },
          user.uid
        );
        toast({ title: 'Firmante creado' });
      }
      setDialogOpen(false);
      await load();
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteCertificateSigner(deleteId);
      toast({ title: 'Firmante eliminado' });
      await load();
    } catch {
      toast({ variant: 'destructive', title: 'Error al eliminar' });
    } finally {
      setDeleteId(null);
    }
  }

  async function toggleActive(signer: CertificateSigner) {
    try {
      await updateCertificateSigner(signer.id, { active: !signer.active });
      await load();
    } catch {
      toast({ variant: 'destructive', title: 'Error al actualizar' });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PenLine className="h-6 w-6" /> Firmantes de Certificado
          </h1>
          <p className="text-muted-foreground">
            Configura quién firma los certificados y con qué cargo aparece
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo firmante
        </Button>
      </div>

      {/* Info card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="py-4 flex gap-3 items-start">
          <UserCheck className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">¿Cómo funcionan los firmantes?</p>
            <p className="mt-0.5 text-blue-700">
              Crea aquí las personas que firmarán los certificados (nombre + cargo).
              Luego, en <strong>Rutas del Jaguar Aviva</strong>, selecciona hasta 3 firmantes
              para cada paso de tipo "Certificado".
            </p>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Card key={i} className="h-20 animate-pulse bg-muted" />)}
        </div>
      ) : signers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <PenLine className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-40" />
            <p className="text-muted-foreground font-medium">No hay firmantes configurados</p>
            <p className="text-sm text-muted-foreground mt-1">
              Agrega el primer firmante para poder asignarlo a los certificados
            </p>
            <Button className="mt-4" onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" /> Crear primer firmante
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {signers.map((signer) => (
            <Card key={signer.id} className={signer.active ? '' : 'opacity-50'}>
              <CardContent className="py-3 flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

                {/* Avatar inicial */}
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {signer.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{signer.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{signer.position}</p>
                </div>

                <Badge variant={signer.active ? 'default' : 'secondary'} className="shrink-0">
                  {signer.active ? 'Activo' : 'Inactivo'}
                </Badge>

                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleActive(signer)}
                    title={signer.active ? 'Desactivar' : 'Activar'}
                  >
                    <UserCheck className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openDialog(signer)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(signer.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview */}
      {signers.filter(s => s.active).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa en certificado</CardTitle>
            <CardDescription>Así aparecen los firmantes activos al pie del certificado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-8 flex-wrap">
              {signers.filter(s => s.active).slice(0, 3).map(signer => (
                <div key={signer.id} className="text-center min-w-[120px]">
                  <div className="border-t-2 border-foreground pt-2 mt-8">
                    <p className="font-semibold text-sm">{signer.name}</p>
                    <p className="text-xs text-muted-foreground">{signer.position}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSigner ? 'Editar firmante' : 'Nuevo firmante'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre completo</Label>
              <Input
                id="name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. María González"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">Cargo / Título</Label>
              <Input
                id="position"
                value={form.position}
                onChange={e => setForm({ ...form, position: e.target.value })}
                placeholder="Ej. Directora de Capacitación"
              />
            </div>

            {/* Preview */}
            {(form.name || form.position) && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-3">Vista previa:</p>
                <div className="text-center inline-block min-w-[120px]">
                  <div className="border-t-2 border-foreground pt-2 mt-4">
                    <p className="font-semibold text-sm">{form.name || 'Nombre'}</p>
                    <p className="text-xs text-muted-foreground">{form.position || 'Cargo'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingSigner ? 'Guardar cambios' : 'Crear firmante'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar firmante?</AlertDialogTitle>
            <AlertDialogDescription>
              El firmante será desactivado y ya no aparecerá en los certificados nuevos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
