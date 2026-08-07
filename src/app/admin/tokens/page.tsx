'use client';

import { toast } from '@/hooks/use-toast';

/**
 * /admin/tokens
 * Panel para gestionar tokens de integración (API keys) de la organización.
 * Los tokens se guardan en Firestore y se usan en el servidor como alternativa
 * a las variables de entorno.
 */

import { useEffect, useState } from 'react';
import { getOrgTokens, saveOrgToken, deleteOrgToken } from '@/lib/firestore-service';
import type { OrgTokenConfig } from '@/lib/types-scalable';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Plus, Pencil, Trash2, Eye, EyeOff, Save, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lista de tokens conocidos del sistema
const KNOWN_TOKENS: { key: string; label: string; description: string }[] = [
  {
    key: 'slack_bot_token',
    label: 'Slack Bot Token',
    description: 'Token del bot de Slack (xoxb-...). Se usa para enviar notificaciones del Pulso de Conocimiento.',
  },
];

function maskToken(value: string): string {
  if (!value || value.length < 8) return '••••••••';
  return value.slice(0, 6) + '••••••••' + value.slice(-4);
}

interface TokenRowProps {
  token: OrgTokenConfig;
  onEdit: (token: OrgTokenConfig) => void;
  onDelete: (key: string) => void;
}

function TokenRow({ token, onEdit, onDelete }: TokenRowProps) {
  const [visible, setVisible] = useState(false);
  const known = KNOWN_TOKENS.find(k => k.key === token.key);

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
      <div className="mt-0.5 p-2 rounded-md bg-primary/10">
        <KeyRound className="h-4 w-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{token.label}</p>
          <Badge variant="outline" className="font-mono text-xs">{token.key}</Badge>
        </div>
        {known && (
          <p className="text-xs text-muted-foreground mt-0.5">{known.description}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
            {visible ? token.value : maskToken(token.value)}
          </code>
          <button
            onClick={() => setVisible(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={visible ? 'Ocultar' : 'Mostrar'}
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        {token.updatedAt && (
          <p className="text-xs text-muted-foreground mt-1">
            Actualizado por {token.updatedBy}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => onEdit(token)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(token.key)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function TokensPage() {
  const { profile } = useAuth();
  const [tokens, setTokens] = useState<OrgTokenConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<OrgTokenConfig | null>(null);
  const [formKey, setFormKey] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formValue, setFormValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Delete confirm
  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const data = await getOrgTokens();
      setTokens(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const openNew = (preset?: { key: string; label: string }) => {
    setEditingToken(null);
    setFormKey(preset?.key ?? '');
    setFormLabel(preset?.label ?? '');
    setFormValue('');
    setShowValue(false);
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (token: OrgTokenConfig) => {
    setEditingToken(token);
    setFormKey(token.key);
    setFormLabel(token.label);
    setFormValue(token.value);
    setShowValue(false);
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formKey.trim() || !formLabel.trim() || !formValue.trim()) {
      setError('Todos los campos son obligatorios.');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(formKey)) {
      setError('La clave solo puede contener letras minúsculas, números y guiones bajos.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveOrgToken(formKey.trim(), formLabel.trim(), formValue.trim(), profile?.email ?? 'admin');
      setDialogOpen(false);
      await loadTokens();
      toast({ title: 'Token guardado' });
    } catch (err) {
      console.error(err);
      setError('Error al guardar el token. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    try {
      await deleteOrgToken(key);
      setDeleteKey(null);
      await loadTokens();
      toast({ title: 'Token eliminado' });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'No se pudo eliminar el token' });
    }
  };

  const configuredKeys = new Set(tokens.map(t => t.key));
  const missingKnown = KNOWN_TOKENS.filter(k => !configuredKeys.has(k.key));

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tokens de Integración</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona las API keys y tokens necesarios para las integraciones del sistema.
            Los valores se almacenan en Firestore y se leen en tiempo de ejecución.
          </p>
        </div>
        <Button onClick={() => openNew()}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo token
        </Button>
      </div>

      {/* Tokens faltantes (acceso rápido) */}
      {missingKnown.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Tokens pendientes de configurar
            </CardTitle>
            <CardDescription className="text-amber-700 dark:text-amber-500">
              Los siguientes tokens del sistema aún no han sido configurados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {missingKnown.map(k => (
              <div
                key={k.key}
                className="flex items-center justify-between p-3 rounded-md bg-white/60 dark:bg-black/20 border border-amber-200 dark:border-amber-800"
              >
                <div>
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">{k.description}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => openNew({ key: k.key, label: k.label })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Configurar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Token list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tokens configurados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Cargando...</p>
          ) : tokens.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <KeyRound className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay tokens configurados.</p>
              <p className="text-xs">Usa el botón &quot;Nuevo token&quot; para agregar uno.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map(t => (
                <TokenRow
                  key={t.key}
                  token={t}
                  onEdit={openEdit}
                  onDelete={k => setDeleteKey(k)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">¿Cómo funciona?</p>
          <p>
            Los tokens se leen directamente desde Firestore en las rutas del servidor.
            Si el token no está configurado aquí, el sistema intentará leer la variable
            de entorno correspondiente como respaldo.
          </p>
          <p className="pt-1 font-medium">Variables de entorno equivalentes:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><code className="bg-muted px-1 rounded">slack_bot_token</code> → <code className="bg-muted px-1 rounded">SLACK_BOT_TOKEN</code></li>
          </ul>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingToken ? 'Editar token' : 'Nuevo token'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="token-key">Clave identificadora</Label>
              <Input
                id="token-key"
                placeholder="ej: slack_bot_token"
                value={formKey}
                onChange={e => setFormKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                disabled={!!editingToken}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Solo letras minúsculas, números y guiones bajos. No se puede cambiar después.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="token-label">Nombre</Label>
              <Input
                id="token-label"
                placeholder="ej: Slack Bot Token"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="token-value">Valor del token</Label>
              <div className="relative">
                <Input
                  id="token-value"
                  type={showValue ? 'text' : 'password'}
                  placeholder="xoxb-..."
                  value={formValue}
                  onChange={e => setFormValue(e.target.value)}
                  className={cn('pr-10 font-mono text-sm', !showValue && 'tracking-wider')}
                />
                <button
                  type="button"
                  onClick={() => setShowValue(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteKey} onOpenChange={() => setDeleteKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar token?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Esta acción eliminará el token{' '}
            <code className="font-mono bg-muted px-1 rounded">{deleteKey}</code> de Firestore.
            Si el sistema necesita este token, deberá estar configurado como variable de entorno
            o volver a agregarse aquí.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteKey(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteKey && handleDelete(deleteKey)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
