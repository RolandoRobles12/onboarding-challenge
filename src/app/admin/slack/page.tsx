'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getSlackConfig, saveSlackConfig, updateUserProfile, getAllUsers } from '@/lib/firestore-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  MessageSquare,
  Users,
  Hash,
  Plus,
  Trash2,
  Save,
  Search,
  Pencil,
  X,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserProfile, SlackNotificationConfig, SlackChannel } from '@/lib/types-scalable';

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Slack Users Tab ──────────────────────────────────────────────────────────

function SlackUsersTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [savedUid, setSavedUid] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar los usuarios.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.nombre?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  function startEdit(user: UserProfile) {
    setEditingUid(user.uid);
    setEditValue(user.slackId ?? '');
    setSavedUid(null);
  }

  function cancelEdit() {
    setEditingUid(null);
    setEditValue('');
  }

  async function saveSlackId(user: UserProfile) {
    const trimmed = editValue.trim();
    setSavingUid(user.uid);
    try {
      await updateUserProfile(user.uid, { slackId: trimmed || undefined });
      setUsers((prev) =>
        prev.map((u) => (u.uid === user.uid ? { ...u, slackId: trimmed || undefined } : u))
      );
      setEditingUid(null);
      setEditValue('');
      setSavedUid(user.uid);
      setTimeout(() => setSavedUid(null), 2000);
      toast({ title: 'Guardado', description: `Slack ID de ${user.nombre} actualizado.` });
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar el Slack ID.', variant: 'destructive' });
    } finally {
      setSavingUid(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Usuarios y sus Slack IDs
        </CardTitle>
        <CardDescription>
          Asocia el Slack ID de cada usuario para que reciba notificaciones directas. El formato es U01234567.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Header row */}
        <div className="hidden sm:grid sm:grid-cols-[2fr_2fr_1fr_2fr_auto] gap-3 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
          <span>Nombre</span>
          <span>Email</span>
          <span>Producto</span>
          <span>Slack ID</span>
          <span />
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid sm:grid-cols-[2fr_2fr_1fr_2fr_auto] gap-3 px-3 py-3 rounded-lg border">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* User rows */}
        {!loading && filteredUsers.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No se encontraron usuarios.
          </div>
        )}

        {!loading && (
          <div className="space-y-1">
            {filteredUsers.map((user) => {
              const isEditing = editingUid === user.uid;
              const isSaving = savingUid === user.uid;
              const justSaved = savedUid === user.uid;

              return (
                <div
                  key={user.uid}
                  className={cn(
                    'grid gap-3 px-3 py-3 rounded-lg border transition-colors',
                    'grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_2fr_auto]',
                    isEditing ? 'bg-muted/50 border-primary/30' : 'hover:bg-muted/30'
                  )}
                >
                  {/* Nombre */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{user.nombre}</span>
                    {!user.active && (
                      <Badge variant="secondary" className="text-xs shrink-0">Inactivo</Badge>
                    )}
                  </div>

                  {/* Email */}
                  <div className="flex items-center min-w-0">
                    <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                  </div>

                  {/* Producto */}
                  <div className="flex items-center">
                    {user.producto ? (
                      <Badge variant="outline" className="text-xs truncate max-w-[120px]">
                        {user.producto}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Slack ID — editable */}
                  <div className="flex items-center min-w-0">
                    {isEditing ? (
                      <Input
                        className="h-8 text-sm font-mono"
                        placeholder="U01234567"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSlackId(user);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                      />
                    ) : user.slackId ? (
                      <div className="flex items-center gap-1.5">
                        {justSaved && <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{user.slackId}</code>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-xs text-muted-foreground">Sin ID</Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 justify-end sm:justify-start">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={cancelEdit}
                          disabled={isSaving}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 px-3"
                          onClick={() => saveSlackId(user)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <span className="text-xs">Guardando...</span>
                          ) : (
                            <>
                              <Save className="h-3.5 w-3.5 mr-1" />
                              <span className="text-xs">Guardar</span>
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Slack Channels Tab ───────────────────────────────────────────────────────

interface ChannelsTabProps {
  userId: string;
}

function SlackChannelsTab({ userId }: ChannelsTabProps) {
  const [config, setConfig] = useState<SlackNotificationConfig | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New channel form
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newVertical, setNewVertical] = useState('');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSlackConfig();
      setConfig(data);
      setChannels(data?.channels ?? []);
    } catch {
      toast({ title: 'Error', description: 'No se pudo cargar la configuración de Slack.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  function deleteChannel(id: string) {
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }

  function addChannel() {
    const channelId = newChannelId.trim();
    const channelName = newChannelName.trim();
    if (!channelId || !channelName) {
      toast({ title: 'Campos requeridos', description: 'El ID y el nombre del canal son obligatorios.', variant: 'destructive' });
      return;
    }
    const newChannel: SlackChannel = {
      id: generateId(),
      channelId,
      channelName,
      vertical: newVertical.trim() || undefined,
      active: true,
    };
    setChannels((prev) => [...prev, newChannel]);
    setNewChannelId('');
    setNewChannelName('');
    setNewVertical('');
  }

  async function saveChannels() {
    setSaving(true);
    try {
      const configToSave: Omit<SlackNotificationConfig, 'organizationId' | 'updatedAt'> = {
        active: config?.active ?? false,
        sendAt: config?.sendAt ?? '08:00',
        closeAt: config?.closeAt ?? '12:00',
        appUrl: config?.appUrl ?? '',
        messageTemplate: config?.messageTemplate ?? '',
        channels,
        directRecipients: config?.directRecipients ?? [],
        updatedBy: userId,
      };
      await saveSlackConfig(configToSave, userId);
      toast({ title: 'Guardado', description: 'Los canales de Slack han sido actualizados.' });
      await loadConfig();
    } catch {
      toast({ title: 'Error', description: 'No se pudieron guardar los canales.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Channel list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Canales configurados
          </CardTitle>
          <CardDescription>
            Los mensajes del Knowledge Pulse se envían a estos canales. El campo "Vertical" filtra por producto (vacío = todos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Header */}
          <div className="hidden sm:grid sm:grid-cols-[2fr_2fr_2fr_auto] gap-3 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
            <span>Channel ID</span>
            <span>Nombre</span>
            <span>Vertical</span>
            <span />
          </div>

          {/* Loading */}
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid sm:grid-cols-[2fr_2fr_2fr_auto] gap-3 px-3 py-3 rounded-lg border">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              ))}
            </div>
          )}

          {!loading && channels.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No hay canales configurados. Agrega uno abajo.
            </div>
          )}

          {!loading && channels.map((ch) => (
            <div
              key={ch.id}
              className="grid gap-3 px-3 py-3 rounded-lg border hover:bg-muted/30 transition-colors grid-cols-1 sm:grid-cols-[2fr_2fr_2fr_auto]"
            >
              <div className="flex items-center min-w-0">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate">{ch.channelId}</code>
              </div>
              <div className="flex items-center min-w-0">
                <span className="text-sm font-medium truncate">{ch.channelName}</span>
              </div>
              <div className="flex items-center min-w-0">
                {ch.vertical ? (
                  <Badge variant="outline" className="text-xs truncate max-w-[140px]">{ch.vertical}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Todos</span>
                )}
              </div>
              <div className="flex items-center justify-end sm:justify-start">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteChannel(ch.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Save button */}
          {!loading && (
            <div className="flex justify-end pt-2">
              <Button onClick={saveChannels} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar canales'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add channel form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Agregar canal
          </CardTitle>
          <CardDescription>
            Añade un nuevo canal de Slack. El Channel ID lo encuentras en la URL del canal o en las propiedades del canal (ej: C01234567).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-channel-id">Channel ID *</Label>
              <Input
                id="new-channel-id"
                placeholder="C01234567"
                className="font-mono"
                value={newChannelId}
                onChange={(e) => setNewChannelId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-channel-name">Nombre del canal *</Label>
              <Input
                id="new-channel-name"
                placeholder="#conocimiento-diario"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-vertical">Vertical (opcional)</Label>
              <Input
                id="new-vertical"
                placeholder="Ej: Aviva Tu Compra"
                value={newVertical}
                onChange={(e) => setNewVertical(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={addChannel}
              disabled={loading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar canal
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SlackAdminPage() {
  const { profile } = useAuth();
  const userId = profile?.uid ?? '';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <MessageSquare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuración Slack</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los Slack IDs de usuarios y los canales de notificación del Knowledge Pulse.
          </p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-4">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuarios Slack
          </TabsTrigger>
          <TabsTrigger value="channels" className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Canales Slack
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <SlackUsersTab />
        </TabsContent>

        <TabsContent value="channels">
          <SlackChannelsTab userId={userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
