'use client';

/**
 * Editores de "quién recibe el aviso del Pulso" por Slack. Viven dentro de
 * Gestión del Pulso → Slack para que toda la configuración esté en un solo lugar.
 *
 * - Canales y personas extra son parte de la configuración de Slack y se guardan
 *   con el botón "Guardar" de la pestaña (componentes controlados).
 * - El Slack ID de cada usuario es un dato de su perfil y se guarda al momento.
 */

import { useState } from 'react';
import { updateUserProfile } from '@/lib/firestore-service';
import type { SlackChannel, SlackDirectRecipient, UserProfile, UserRole } from '@/lib/types-scalable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const newId = () => Math.random().toString(36).slice(2, 10);

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  trainer: 'Capacitador',
  seller: 'Vendedor',
};

// ── Slack ID de cada usuario ───────────────────────────────────────────────

export function UserSlackIdsEditor({ users, currentUid, onUpdated }: {
  users: UserProfile[];
  currentUid?: string;
  onUpdated: (uid: string, slackId: string | undefined) => void;
}) {
  const [filter, setFilter] = useState<'vendedores' | 'sin_id' | 'todos'>('vendedores');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState(30);

  const isSeller = (u: UserProfile) => u.rol === 'seller' && u.active !== false;
  const visible = users
    .filter(u => u.uid === currentUid
      || (filter === 'todos' ? true : filter === 'sin_id' ? isSeller(u) && !u.slackId?.trim() : isSeller(u)))
    .filter(u => !search || `${u.nombre} ${u.email}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.uid === currentUid ? -1 : b.uid === currentUid ? 1 : (a.nombre || '').localeCompare(b.nombre || '')));

  const save = async (u: UserProfile) => {
    const trimmed = value.trim();
    setSaving(true);
    try {
      await updateUserProfile(u.uid, { slackId: trimmed || undefined });
      onUpdated(u.uid, trimmed || undefined);
      setEditing(null);
      toast({ title: 'Slack ID guardado', description: u.nombre });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo guardar el Slack ID' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['vendedores', 'Vendedores'],
          ['sin_id', 'Sin Slack ID'],
          ['todos', 'Todos los usuarios'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn('text-xs px-2.5 py-1 rounded-full border', filter === key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
          >
            {label}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8 text-xs" placeholder="Buscar nombre o correo" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border divide-y max-h-80 overflow-y-auto">
        {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nadie en esta lista.</p>}
        {visible.slice(0, limit).map(u => (
          <div key={u.uid} className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {u.nombre || u.email}
                {u.uid === currentUid && <span className="ml-1.5 text-[10px] font-semibold text-primary">(tú · recibes las pruebas)</span>}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {ROLE_LABEL[u.rol] ?? u.rol}{u.active === false ? ' · desactivado' : ''} · {u.email}
              </p>
            </div>
            {editing === u.uid ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  autoFocus
                  className="h-8 w-36 font-mono text-xs"
                  placeholder="U01234567"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') save(u); if (e.key === 'Escape') setEditing(null); }}
                />
                <Button size="icon" className="h-8 w-8" onClick={() => save(u)} disabled={saving} aria-label="Guardar">
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)} aria-label="Cancelar">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => { setEditing(u.uid); setValue(u.slackId ?? ''); }}
                className="flex items-center gap-1.5 shrink-0 text-xs rounded-md px-2 py-1 hover:bg-muted"
              >
                {u.slackId?.trim()
                  ? <code className="font-mono">{u.slackId}</code>
                  : <span className="text-amber-700">Agregar Slack ID</span>}
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        ))}
        {visible.length > limit && (
          <button className="w-full text-xs text-primary py-2 hover:underline" onClick={() => setLimit(l => l + 30)}>
            Mostrar más ({visible.length - limit})
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        El Slack ID está en el perfil de Slack de cada persona → ⋮ → «Copiar ID de miembro» (empieza con U). Se guarda al momento.
      </p>
    </div>
  );
}

// ── Canales ────────────────────────────────────────────────────────────────

export function ChannelsEditor({ channels, onChange }: {
  channels: SlackChannel[];
  onChange: (channels: SlackChannel[]) => void;
}) {
  const [channelId, setChannelId] = useState('');
  const [channelName, setChannelName] = useState('');

  const add = () => {
    const id = channelId.trim();
    const name = channelName.trim();
    if (!id || !name) {
      toast({ variant: 'destructive', title: 'Escribe el ID y el nombre del canal' });
      return;
    }
    onChange([...channels, { id: newId(), channelId: id, channelName: name.startsWith('#') ? name : `#${name}`, active: true }]);
    setChannelId('');
    setChannelName('');
  };

  return (
    <div className="space-y-3">
      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin canales. El aviso solo llegará por mensaje directo.</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {channels.map(ch => (
            <div key={ch.id} className="flex items-center gap-3 px-3 py-2">
              <Switch
                checked={ch.active}
                onCheckedChange={v => onChange(channels.map(c => c.id === ch.id ? { ...c, active: v } : c))}
                aria-label={`Enviar a ${ch.channelName}`}
              />
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium truncate', !ch.active && 'text-muted-foreground line-through')}>{ch.channelName}</p>
                <code className="text-[11px] text-muted-foreground font-mono">{ch.channelId}</code>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(channels.filter(c => c.id !== ch.id))} aria-label="Quitar canal">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Nombre (ej. #conocimiento)" value={channelName} onChange={e => setChannelName(e.target.value)} />
        <Input placeholder="ID del canal (ej. C01234567)" className="font-mono" value={channelId} onChange={e => setChannelId(e.target.value)} />
        <Button variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1.5" /> Agregar</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        El ID está en Slack → detalles del canal (abajo de todo). Recuerda invitar al bot al canal.
      </p>
    </div>
  );
}

// ── Personas extra ─────────────────────────────────────────────────────────

export function ExtraRecipientsEditor({ recipients, onChange }: {
  recipients: SlackDirectRecipient[];
  onChange: (recipients: SlackDirectRecipient[]) => void;
}) {
  const [slackUserId, setSlackUserId] = useState('');
  const [displayName, setDisplayName] = useState('');

  const add = () => {
    const id = slackUserId.trim();
    const name = displayName.trim();
    if (!id || !name) {
      toast({ variant: 'destructive', title: 'Escribe el nombre y el Slack ID' });
      return;
    }
    onChange([...recipients, { id: newId(), slackUserId: id, displayName: name }]);
    setSlackUserId('');
    setDisplayName('');
  };

  return (
    <div className="space-y-3">
      {recipients.length > 0 && (
        <div className="rounded-lg border divide-y">
          {recipients.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.displayName}</p>
                <code className="text-[11px] text-muted-foreground font-mono">{r.slackUserId}</code>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(recipients.filter(x => x.id !== r.id))} aria-label="Quitar">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Nombre (ej. Líder Norte)" value={displayName} onChange={e => setDisplayName(e.target.value)} />
        <Input placeholder="Slack ID (ej. U01234567)" className="font-mono" value={slackUserId} onChange={e => setSlackUserId(e.target.value)} />
        <Button variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1.5" /> Agregar</Button>
      </div>
    </div>
  );
}
