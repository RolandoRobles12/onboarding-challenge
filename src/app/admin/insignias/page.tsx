'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getAllBadges,
  createBadge,
  updateBadge,
  deleteBadge,
  awardBadge,
  getAllUsers,
} from '@/lib/firestore-service';
import type { Badge, UserProfile } from '@/lib/types-scalable';
import { BadgeDisplay } from '@/components/BadgeDisplay';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge as UiBadge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Medal, Plus, Pencil, Trash2, Gift } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ─── Presets ──────────────────────────────────────────────────────────────────
const EMOJI_PRESETS = ['🏆','⭐','🎯','🔥','💪','🚀','🌟','💎','🥇','🎖️','🎓','🏅','⚡','🦁','🐆','🦊','🌈','🎪','🏋️','🎵'];
const COLOR_PRESETS = [
  { label: 'Aviva Verde',  value: '#0a6b3e' },
  { label: 'Dorado',       value: '#b8860b' },
  { label: 'Azul',         value: '#1a4faa' },
  { label: 'Morado',       value: '#6a1aaa' },
  { label: 'Rojo',         value: '#aa1a1a' },
  { label: 'Naranja',      value: '#cc5500' },
  { label: 'Rosa',         value: '#aa1a6a' },
  { label: 'Marino',       value: '#0a2a4a' },
];

const DEFAULT_FORM = { name: '', description: '', emoji: '🏅', color: '#0a6b3e', category: '' };

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InsigniasPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [badges, setBadges] = useState<Badge[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Badge dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBadge, setEditingBadge] = useState<Badge | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Award dialog
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);
  const [awardBadgeId, setAwardBadgeId] = useState('');
  const [awardUserId, setAwardUserId] = useState('');
  const [awardReason, setAwardReason] = useState('');
  const [awarding, setAwarding] = useState(false);

  useEffect(() => {
    Promise.all([getAllBadges(), getAllUsers()]).then(([b, u]) => {
      setBadges(b);
      setUsers(u);
      setLoading(false);
    });
  }, []);

  async function load() {
    const b = await getAllBadges();
    setBadges(b);
  }

  // ── Badge CRUD ───────────────────────────────────────────────────────────
  function openDialog(badge?: Badge) {
    if (badge) {
      setEditingBadge(badge);
      setForm({ name: badge.name, description: badge.description, emoji: badge.emoji, color: badge.color, category: badge.category ?? '' });
    } else {
      setEditingBadge(null);
      setForm(DEFAULT_FORM);
    }
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.emoji.trim()) {
      toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Completa el nombre y el emoji.' });
      return;
    }
    setSaving(true);
    try {
      if (editingBadge) {
        await updateBadge(editingBadge.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          emoji: form.emoji.trim(),
          color: form.color,
          category: form.category.trim() || undefined,
        });
        toast({ title: 'Insignia actualizada' });
      } else {
        await createBadge({
          organizationId: 'aviva-credito',
          name: form.name.trim(),
          description: form.description.trim(),
          emoji: form.emoji.trim(),
          color: form.color,
          category: form.category.trim() || undefined,
          active: true,
        });
        toast({ title: 'Insignia creada' });
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
      await deleteBadge(deleteId);
      toast({ title: 'Insignia desactivada' });
      await load();
    } catch {
      toast({ variant: 'destructive', title: 'Error' });
    } finally {
      setDeleteId(null);
    }
  }

  // ── Award badge ──────────────────────────────────────────────────────────
  async function handleAward() {
    if (!awardBadgeId || !awardUserId || !user) return;
    const badge = badges.find(b => b.id === awardBadgeId);
    if (!badge) return;
    setAwarding(true);
    try {
      await awardBadge(awardUserId, badge, { awardedBy: user.uid, reason: awardReason.trim() || undefined });
      toast({ title: 'Insignia otorgada', description: `${badge.emoji} ${badge.name} asignada exitosamente.` });
      setAwardDialogOpen(false);
      setAwardBadgeId('');
      setAwardUserId('');
      setAwardReason('');
    } catch {
      toast({ variant: 'destructive', title: 'Error al otorgar insignia' });
    } finally {
      setAwarding(false);
    }
  }

  const activeBadges = badges.filter(b => b.active);
  const inactiveBadges = badges.filter(b => !b.active);

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <Card key={i} className="h-24 animate-pulse bg-muted" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Medal className="h-6 w-6" /> Insignias
          </h1>
          <p className="text-muted-foreground">
            Crea insignias personalizadas para recompensar logros de los participantes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAwardDialogOpen(true)} className="gap-2">
            <Gift className="h-4 w-4" /> Otorgar insignia
          </Button>
          <Button onClick={() => openDialog()} className="gap-2">
            <Plus className="h-4 w-4" /> Nueva insignia
          </Button>
        </div>
      </div>

      {/* Info */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="py-4 flex gap-3 items-start">
          <Medal className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">¿Cómo funcionan las insignias?</p>
            <p className="mt-0.5 text-amber-700">
              Crea insignias aquí y asígnalas a pasos de tipo <strong>"badge"</strong> en las Rutas del Jaguar Aviva,
              o bien otórgalas manualmente desde el botón <strong>"Otorgar insignia"</strong>.
              Los participantes las verán en su perfil.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="activas">
        <TabsList>
          <TabsTrigger value="activas">Activas ({activeBadges.length})</TabsTrigger>
          <TabsTrigger value="inactivas">Inactivas ({inactiveBadges.length})</TabsTrigger>
        </TabsList>

        {/* ── Active badges ── */}
        <TabsContent value="activas" className="mt-4">
          {activeBadges.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Medal className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-40" />
                <p className="text-muted-foreground font-medium">No hay insignias activas</p>
                <Button className="mt-4" onClick={() => openDialog()}>
                  <Plus className="h-4 w-4 mr-2" /> Crear primera insignia
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBadges.map(badge => (
                <BadgeCard key={badge.id} badge={badge} onEdit={() => openDialog(badge)} onDelete={() => setDeleteId(badge.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Inactive badges ── */}
        <TabsContent value="inactivas" className="mt-4">
          {inactiveBadges.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No hay insignias inactivas
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {inactiveBadges.map(badge => (
                <BadgeCard key={badge.id} badge={badge} locked onEdit={() => openDialog(badge)} onDelete={() => setDeleteId(badge.id)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit badge dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBadge ? 'Editar insignia' : 'Nueva insignia'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Preview */}
            <div className="flex justify-center py-2">
              <BadgeDisplay
                name={form.name || 'Vista previa'}
                emoji={form.emoji || '🏅'}
                color={form.color}
                description={form.description}
                size="lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Nombre de la insignia *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Jaguar de Oro" />
            </div>

            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ej. Otorgada por completar el módulo con puntuación perfecta" rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label>Emoji *</Label>
              <div className="space-y-2">
                <Input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} placeholder="🏅" className="text-2xl w-24" maxLength={8} />
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_PRESETS.map(e => (
                    <button
                      key={e}
                      onClick={() => setForm({ ...form, emoji: e })}
                      className={`text-xl p-1 rounded hover:bg-muted transition-colors ${form.emoji === e ? 'bg-muted ring-2 ring-primary' : ''}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Color de fondo</Label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="h-9 w-12 rounded border cursor-pointer" />
                  <Input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="font-mono text-sm" maxLength={7} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setForm({ ...form, color: p.value })}
                      className="h-7 w-7 rounded-full border-2 transition-all hover:scale-110"
                      style={{
                        background: p.value,
                        borderColor: form.color === p.value ? 'white' : 'transparent',
                        boxShadow: form.color === p.value ? '0 0 0 2px #000' : 'none',
                      }}
                      title={p.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Categoría (opcional)</Label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ej. Ventas, Capacitación, Liderazgo" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingBadge ? 'Guardar cambios' : 'Crear insignia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Award badge dialog ── */}
      <Dialog open={awardDialogOpen} onOpenChange={setAwardDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" /> Otorgar insignia
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Preview del badge seleccionado */}
            {awardBadgeId && (() => {
              const b = badges.find(x => x.id === awardBadgeId);
              return b ? (
                <div className="flex justify-center py-1">
                  <BadgeDisplay name={b.name} emoji={b.emoji} color={b.color} description={b.description} size="md" />
                </div>
              ) : null;
            })()}

            <div className="space-y-1.5">
              <Label>Insignia</Label>
              <Select value={awardBadgeId} onValueChange={setAwardBadgeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una insignia…" />
                </SelectTrigger>
                <SelectContent>
                  {activeBadges.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.emoji} {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Participante</Label>
              <Select value={awardUserId} onValueChange={setAwardUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un participante…" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.rol !== 'super_admin' && u.rol !== 'admin').map(u => (
                    <SelectItem key={u.uid} value={u.uid}>
                      {u.nombre} — {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Motivo (opcional)</Label>
              <Input value={awardReason} onChange={e => setAwardReason(e.target.value)} placeholder="Ej. Completó el módulo con calificación perfecta" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAwardDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAward} disabled={awarding || !awardBadgeId || !awardUserId}>
              {awarding ? 'Otorgando...' : 'Otorgar insignia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar insignia?</AlertDialogTitle>
            <AlertDialogDescription>
              La insignia quedará inactiva. Los participantes que ya la ganaron la conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-component: Badge card in list ──────────────────────────────────────────
function BadgeCard({ badge, locked, onEdit, onDelete }: { badge: Badge; locked?: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className={locked ? 'opacity-60' : ''}>
      <CardContent className="py-4 flex items-center gap-4">
        <BadgeDisplay
          emoji={badge.emoji}
          name={badge.name}
          color={badge.color}
          description={badge.description}
          locked={locked}
          size="md"
          showLabel={false}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{badge.name}</p>
            {badge.category && (
              <UiBadge variant="secondary" className="text-[10px] shrink-0">{badge.category}</UiBadge>
            )}
          </div>
          {badge.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{badge.description}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
