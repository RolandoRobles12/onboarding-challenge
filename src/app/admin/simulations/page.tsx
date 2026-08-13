'use client';

/**
 * Editor de simulaciones por nodos.
 *
 * Un módulo es un grafo de capturas reales de una herramienta. Cada captura
 * tiene zonas dibujadas encima, y cada zona puede llevar a otra captura —
 * incluidas las zonas equivocadas, que es lo que permite que el ejercicio se
 * sienta como usar la herramienta y no como adivinar dónde tocar.
 *
 * El editor revisa el módulo antes de guardarlo (`findModuleIssues`): sin eso
 * es muy fácil publicar un ejercicio donde el vendedor queda atorado sin salida
 * y sin entender por qué.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import {
  getAllSimModules, createSimModule, updateSimModule, deleteSimModule, getSimAttempts,
} from '@/lib/firestore-service';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  DEFAULT_MAX_WRONG_TAPS, findExpectedPath, findModuleIssues, normalizeHotspots,
} from '@/lib/types-simulation';
import type {
  SimAttempt, SimModule, SimNode, SimHotspot, SimHotspotKind,
} from '@/lib/types-simulation';
import {
  Plus, Trash2, ExternalLink, Upload, MousePointerClick, CheckSquare, Type, ArrowLeft,
  Loader2, AlertTriangle, Flag, BarChart3, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Valor del selector de destino de una zona. */
function destinationValue(hotspot: SimHotspot): string {
  return hotspot.goToNodeId || hotspot.nextNodeId || (hotspot.endsModule ? '__end__' : '__none__');
}

function destinationLabel(hotspot: SimHotspot, nodeLabel: (id?: string) => string): string {
  const target = hotspot.goToNodeId || hotspot.nextNodeId;
  if (target) return `Va a ${nodeLabel(target).toLowerCase()}`;
  if (hotspot.endsModule) return 'Termina el módulo';
  return hotspot.kind === 'text' ? 'Sólo se llena, no avanza' : 'No pasa nada';
}

function genId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const EMPTY_DRAFT = {
  title: '',
  instructions: '',
  startNodeId: '',
  active: true,
  maxWrongTaps: DEFAULT_MAX_WRONG_TAPS,
  allowBack: true,
  nodes: [] as SimNode[],
};

type Draft = typeof EMPTY_DRAFT;

export default function SimulationsAdminPage() {
  const [modules, setModules] = useState<SimModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [attemptsFor, setAttemptsFor] = useState<SimModule | null>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setModules(await getAllSimModules());
    setLoading(false);
  }

  function openNew() {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, nodes: [] });
    setView('builder');
  }

  function openEdit(m: SimModule) {
    setEditingId(m.id);
    setDraft({
      title: m.title,
      instructions: m.instructions,
      startNodeId: m.startNodeId,
      active: m.active,
      maxWrongTaps: m.maxWrongTaps ?? DEFAULT_MAX_WRONG_TAPS,
      allowBack: m.allowBack !== false,
      nodes: normalizeHotspots(m.nodes),
    });
    setView('builder');
  }

  async function handleDelete(m: SimModule) {
    if (!await confirm({
      title: `¿Eliminar "${m.title}"?`,
      description: 'Se borran también las capturas subidas. Esta acción no se puede deshacer.',
    })) return;

    await deleteSimModule(m.id);
    // Sin esto las capturas se quedan en Storage para siempre, sin dueño.
    if (storage) {
      await Promise.all(m.nodes.filter(n => n.imagePath).map(node =>
        deleteObject(ref(storage!, node.imagePath!)).catch(error =>
          console.error('No se pudo borrar la captura:', node.imagePath, error)
        )
      ));
    }
    toast({ title: 'Módulo eliminado' });
    load();
  }

  async function handleSave(): Promise<boolean> {
    if (!draft.title.trim()) {
      toast({ variant: 'destructive', title: 'Ponle un título al módulo' });
      return false;
    }
    const startNodeId = draft.startNodeId || draft.nodes[0]?.id || '';
    const { errors } = findModuleIssues({ nodes: draft.nodes, startNodeId });
    if (errors.length > 0) {
      toast({ variant: 'destructive', title: 'El módulo todavía no se puede jugar', description: errors[0] });
      return false;
    }

    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        instructions: draft.instructions.trim(),
        startNodeId,
        active: draft.active,
        maxWrongTaps: draft.maxWrongTaps,
        allowBack: draft.allowBack,
        nodes: draft.nodes,
      };
      if (editingId) {
        await updateSimModule(editingId, payload);
      } else {
        const id = await createSimModule(payload);
        setEditingId(id);
      }
      toast({ title: 'Módulo guardado' });
      load();
      return true;
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'No se pudo guardar el módulo' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (view === 'builder') {
    return (
      <>
        <Builder
          draft={draft}
          setDraft={setDraft}
          moduleId={editingId}
          saving={saving}
          onSave={handleSave}
          onBack={() => setView('list')}
          confirm={confirm}
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulaciones</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Ejercicios donde el vendedor opera una herramienta real navegando capturas de pantalla.
            Las zonas equivocadas también pueden llevar a otra pantalla: así el ejercicio se siente
            como usar la herramienta y no como adivinar.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nuevo módulo</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : modules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Todavía no hay módulos de simulación. Crea el primero para probar el patrón.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(m => {
            const issues = findModuleIssues(m);
            const expected = findExpectedPath(m);
            return (
              <Card key={m.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{m.title}</CardTitle>
                    <Badge variant={m.active ? 'default' : 'secondary'}>{m.active ? 'Activo' : 'Inactivo'}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{m.instructions || 'Sin instrucciones'}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{m.nodes.length} pantalla{m.nodes.length === 1 ? '' : 's'}</span>
                    {expected && <span>· ruta de {expected.screens} paso{expected.screens === 1 ? '' : 's'}</span>}
                  </div>
                  {issues.errors.length > 0 && (
                    <p className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {issues.errors[0]}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(m)}>Editar</Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/simulations/${m.id}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Probar
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAttemptsFor(m)}>
                      <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Intentos
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(m)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AttemptsDialog module={attemptsFor} onClose={() => setAttemptsFor(null)} />
      {dialog}
    </div>
  );
}

// ─── Builder ────────────────────────────────────────────────────────────────

function Builder({
  draft, setDraft, moduleId, saving, onSave, onBack, confirm,
}: {
  draft: Draft;
  setDraft: (d: Draft | ((prev: Draft) => Draft)) => void;
  moduleId: string | null;
  saving: boolean;
  onSave: () => Promise<boolean>;
  onBack: () => void;
  confirm: (options: { title: string; description?: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(draft.nodes[0]?.id ?? null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Carpeta de Storage de este módulo. Mientras no se guarda no hay id real,
   * así que se usa uno temporal y se cambia al definitivo en cuanto existe.
   */
  const storageIdRef = useRef(moduleId || genId());
  useEffect(() => {
    if (moduleId) storageIdRef.current = moduleId;
  }, [moduleId]);

  useUnsavedChanges(dirty);

  const activeNode = draft.nodes.find(n => n.id === activeNodeId) || null;
  const selectedHotspot = activeNode?.hotspots.find(h => h.id === selectedHotspotId) || null;

  const startNodeId = draft.startNodeId || draft.nodes[0]?.id || '';
  const issues = useMemo(
    () => findModuleIssues({ nodes: draft.nodes, startNodeId }),
    [draft.nodes, startNodeId]
  );
  const expected = useMemo(
    () => findExpectedPath({ nodes: draft.nodes, startNodeId }),
    [draft.nodes, startNodeId]
  );

  function update(updater: (prev: Draft) => Draft) {
    setDirty(true);
    setDraft(updater);
  }

  function updateNode(nodeId: string, patch: Partial<SimNode>) {
    update(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n) }));
  }

  function addHotspot(nodeId: string, hotspot: SimHotspot) {
    update(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, hotspots: [...n.hotspots, hotspot] } : n),
    }));
    setSelectedHotspotId(hotspot.id);
  }

  function updateHotspot(nodeId: string, hotspotId: string, patch: Partial<SimHotspot>) {
    update(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id !== nodeId ? n : {
        ...n,
        hotspots: n.hotspots.map(h => h.id === hotspotId ? { ...h, ...patch } : h),
      }),
    }));
  }

  function deleteHotspot(nodeId: string, hotspotId: string) {
    update(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId
        ? { ...n, hotspots: n.hotspots.filter(h => h.id !== hotspotId) }
        : n),
    }));
    setSelectedHotspotId(null);
  }

  function deleteNode(nodeId: string) {
    update(prev => {
      const nodes = prev.nodes
        .filter(n => n.id !== nodeId)
        .map(n => ({
          ...n,
          hotspots: n.hotspots.map(h => (h.goToNodeId === nodeId || h.nextNodeId === nodeId)
            ? { ...h, goToNodeId: undefined, nextNodeId: undefined }
            : h),
        }));
      return { ...prev, nodes, startNodeId: prev.startNodeId === nodeId ? (nodes[0]?.id || '') : prev.startNodeId };
    });
    if (activeNodeId === nodeId) setActiveNodeId(null);
  }

  async function handleUpload(file: File) {
    if (!storage) { toast({ variant: 'destructive', title: 'Storage no configurado' }); return; }
    setUploading(true);
    const path = `simulations/${storageIdRef.current}/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on(
      'state_changed',
      () => {},
      error => {
        console.error('Error al subir la captura:', error);
        toast({ variant: 'destructive', title: 'Error al subir la captura' });
        setUploading(false);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        const newNode: SimNode = { id: genId(), imageUrl: url, imagePath: path, hotspots: [] };
        update(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode],
          startNodeId: prev.startNodeId || newNode.id,
        }));
        setActiveNodeId(newNode.id);
        setSelectedHotspotId(null);
        setUploading(false);
      }
    );
  }

  async function handleSave() {
    const ok = await onSave();
    if (ok) setDirty(false);
  }

  async function handleBack() {
    if (dirty && !await confirm({
      title: 'Tienes cambios sin guardar',
      description: 'Si sales ahora se pierden.',
      confirmLabel: 'Salir sin guardar',
    })) return;
    onBack();
  }

  const nodeLabel = (id?: string) => {
    if (!id) return '— No lleva a ningún lado —';
    const index = draft.nodes.findIndex(n => n.id === id);
    return index >= 0 ? `Pantalla ${index + 1}` : 'Pantalla eliminada';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleBack}><ArrowLeft className="h-4 w-4 mr-1.5" />Volver</Button>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">Sin guardar</span>}
          {moduleId && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/simulations/${moduleId}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Probar
              </a>
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Guardar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Título</Label>
            <Input
              value={draft.title}
              onChange={e => update(prev => ({ ...prev, title: e.target.value }))}
              placeholder='Ej. "Agrega la vista Mis negocios en HubSpot"'
            />
          </div>
          <div className="flex items-center gap-2 md:justify-end">
            <Label htmlFor="active-switch">Activo</Label>
            <Switch
              id="active-switch"
              checked={draft.active}
              onCheckedChange={c => update(prev => ({ ...prev, active: c }))}
            />
          </div>
          <div className="md:col-span-3 space-y-1.5">
            <Label>Instrucciones para el vendedor</Label>
            <Textarea
              value={draft.instructions}
              onChange={e => update(prev => ({ ...prev, instructions: e.target.value }))}
              placeholder='Ej. "Abre HubSpot y añade la vista Mis negocios a los Deals."'
              rows={2}
            />
          </div>
          {draft.nodes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Pantalla inicial</Label>
              <Select
                value={startNodeId}
                onValueChange={v => update(prev => ({ ...prev, startNodeId: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {draft.nodes.map((n, i) => <SelectItem key={n.id} value={n.id}>Pantalla {i + 1}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Errores permitidos para aprobar</Label>
            <Input
              type="number"
              min={0}
              value={draft.maxWrongTaps}
              onChange={e => update(prev => ({ ...prev, maxWrongTaps: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </div>
          <div className="flex items-center gap-2 md:justify-end">
            <Label htmlFor="back-switch">Puede regresar</Label>
            <Switch
              id="back-switch"
              checked={draft.allowBack}
              onCheckedChange={c => update(prev => ({ ...prev, allowBack: c }))}
            />
          </div>
        </CardContent>
      </Card>

      {(issues.errors.length > 0 || issues.warnings.length > 0) && (
        <Card className={cn(issues.errors.length > 0 ? 'border-destructive/50' : 'border-amber-500/50')}>
          <CardContent className="pt-6 space-y-2">
            {issues.errors.map((issue, i) => (
              <p key={`e${i}`} className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{issue}
              </p>
            ))}
            {issues.warnings.map((issue, i) => (
              <p key={`w${i}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />{issue}
              </p>
            ))}
            {expected && (
              <p className="text-xs text-muted-foreground pt-1">
                Ruta esperada: {expected.nodes.map(id => nodeLabel(id)).join(' → ')}
                {' '}({expected.screens} paso{expected.screens === 1 ? '' : 's'}).
                {expected.screens < draft.nodes.length && ' Las demás pantallas quedan fuera de la ruta.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_340px] gap-4">
        {/* Lista de pantallas */}
        <Card className="h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Pantallas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {draft.nodes.map((n, i) => (
              <button
                key={n.id}
                onClick={() => { setActiveNodeId(n.id); setSelectedHotspotId(null); }}
                className={cn(
                  'w-full flex items-center gap-2 rounded-md border p-1.5 text-left text-xs hover:bg-accent',
                  activeNodeId === n.id && 'ring-2 ring-primary'
                )}
              >
                <img src={n.imageUrl} alt="" className="h-10 w-10 rounded object-cover border shrink-0" />
                <span className="flex-1 truncate">
                  Pantalla {i + 1}
                  {n.id === startNodeId && <span className="text-muted-foreground"> · inicio</span>}
                </span>
                {n.isSuccess
                  ? <Flag className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  : <span className="text-muted-foreground">{n.hotspots.length}z</span>}
              </button>
            ))}
            <input
              ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
            />
            <Button variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Agregar pantalla
            </Button>
          </CardContent>
        </Card>

        {/* Lienzo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {activeNode ? 'Arrastra sobre la imagen para dibujar una zona' : 'Selecciona o agrega una pantalla'}
            </CardTitle>
            {activeNode && (
              <CardDescription className="text-xs">
                Toca una zona para editarla, o arrástrala para moverla.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {activeNode ? (
              <NodeCanvas
                node={activeNode}
                selectedHotspotId={selectedHotspotId}
                onSelectHotspot={setSelectedHotspotId}
                onMoveHotspot={(id, xPct, yPct) => updateHotspot(activeNode.id, id, { xPct, yPct })}
                onCreateHotspot={rect => addHotspot(activeNode.id, {
                  id: genId(),
                  label: `Zona ${activeNode.hotspots.length + 1}`,
                  kind: 'hotspot',
                  isCorrect: activeNode.hotspots.every(h => !(h.kind === 'hotspot' && h.isCorrect)),
                  endsModule: false,
                  ...rect,
                })}
              />
            ) : (
              <div className="aspect-[9/16] max-w-xs mx-auto rounded-lg border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                Sin pantalla seleccionada
              </div>
            )}

            {activeNode && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Objetivo de este paso (lo ve el vendedor)</Label>
                  <Input
                    value={activeNode.goal || ''}
                    onChange={e => updateNode(activeNode.id, { goal: e.target.value })}
                    placeholder='Ej. "Abre el menú de vistas"'
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pista (sólo si la pide)</Label>
                  <Input
                    value={activeNode.hint || ''}
                    onChange={e => updateNode(activeNode.id, { hint: e.target.value })}
                    placeholder='Ej. "Está arriba a la derecha, junto al buscador"'
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="success-node"
                    checked={!!activeNode.isSuccess}
                    onCheckedChange={c => updateNode(activeNode.id, { isSuccess: !!c })}
                  />
                  <Label htmlFor="success-node" className="text-xs font-normal">
                    Pantalla final: llegar aquí completa el módulo
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nota interna (no la ve el vendedor)</Label>
                  <Textarea
                    value={activeNode.note || ''}
                    onChange={e => updateNode(activeNode.id, { note: e.target.value })}
                    rows={2}
                    className="text-xs"
                  />
                </div>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteNode(activeNode.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />Eliminar esta pantalla
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inspector de zonas */}
        <Card className="h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Zonas de la pantalla</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!activeNode ? (
              <p className="text-xs text-muted-foreground">Selecciona una pantalla primero.</p>
            ) : activeNode.hotspots.length === 0 ? (
              <p className="text-xs text-muted-foreground">Arrastra sobre la imagen para dibujar la primera zona.</p>
            ) : (
              <div className="space-y-1.5">
                {activeNode.hotspots.map(h => (
                  <button
                    key={h.id}
                    onClick={() => setSelectedHotspotId(h.id)}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-md border p-1.5 text-left text-xs hover:bg-accent',
                      selectedHotspotId === h.id && 'ring-2 ring-primary'
                    )}
                  >
                    {h.kind === 'checkbox' ? <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                      : h.kind === 'text' ? <Type className="h-3.5 w-3.5 shrink-0" />
                      : <MousePointerClick className="h-3.5 w-3.5 shrink-0" />}
                    <span className="flex-1 truncate">{h.label}</span>
                    {h.kind === 'hotspot' && h.isCorrect && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">paso</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selectedHotspot && activeNode && (
              <div className="space-y-3 border-t pt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Etiqueta</Label>
                  <Input
                    value={selectedHotspot.label}
                    onChange={e => updateHotspot(activeNode.id, selectedHotspot.id, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de zona</Label>
                  <Select
                    value={selectedHotspot.kind}
                    onValueChange={(v: SimHotspotKind) => updateHotspot(activeNode.id, selectedHotspot.id, { kind: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotspot">Zona táctil (se toca)</SelectItem>
                      <SelectItem value="checkbox">Casilla (marcar / desmarcar)</SelectItem>
                      <SelectItem value="text">Campo de texto (escribir)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedHotspot.kind === 'text' ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Respuestas válidas (una por línea)</Label>
                      <LinesTextarea
                        key={selectedHotspot.id}
                        lines={selectedHotspot.validAnswers || []}
                        onChangeLines={validAnswers => updateHotspot(activeNode.id, selectedHotspot.id, { validAnswers })}
                        rows={3}
                        className="text-xs"
                        placeholder={'15000\n$15,000'}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        No distingue mayúsculas, acentos ni espacios de más.
                        {(selectedHotspot.validAnswers || []).length === 0 && ' Si lo dejas vacío, la respuesta se guarda pero la revisa un capacitador.'}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Texto guía dentro del campo (opcional)</Label>
                      <Input
                        value={selectedHotspot.placeholder || ''}
                        onChange={e => updateHotspot(activeNode.id, selectedHotspot.id, { placeholder: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="correct-check"
                      checked={selectedHotspot.isCorrect}
                      onCheckedChange={c => updateHotspot(activeNode.id, selectedHotspot.id, { isCorrect: !!c })}
                    />
                    <Label htmlFor="correct-check" className="text-xs font-normal">
                      {selectedHotspot.kind === 'checkbox' ? 'Debe quedar marcada' : 'Es el paso esperado aquí'}
                    </Label>
                  </div>
                )}

                {selectedHotspot.kind !== 'checkbox' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {selectedHotspot.kind === 'text' ? 'Al confirmar lo que escriba' : 'Al tocarla'}
                    </Label>
                    <Select
                      value={destinationValue(selectedHotspot)}
                      onValueChange={v => updateHotspot(activeNode.id, selectedHotspot.id, {
                        goToNodeId: v === '__none__' || v === '__end__' ? undefined : v,
                        nextNodeId: undefined,
                        endsModule: v === '__end__',
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue>{destinationLabel(selectedHotspot, nodeLabel)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {selectedHotspot.kind === 'text' ? 'Sólo se llena, no avanza' : 'No pasa nada'}
                        </SelectItem>
                        <SelectItem value="__end__">Termina el módulo</SelectItem>
                        {draft.nodes.filter(n => n.id !== activeNode.id).map(n => (
                          <SelectItem key={n.id} value={n.id}>Va a {nodeLabel(n.id).toLowerCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedHotspot.kind === 'text'
                        ? 'Si la conectas, el vendedor escribe y presiona Listo para avanzar. Si la dejas en "sólo se llena", ' +
                          'necesitas otra zona en esta pantalla —el botón de la captura— que lleve a la siguiente.'
                        : selectedHotspot.isCorrect
                        ? 'Elige a qué pantalla lleva este paso, o si con él termina el módulo.'
                        : 'Conéctala a la pantalla que saldría de verdad al tocar aquí: así el error se siente como en la herramienta real.'}
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Retroalimentación al tocar (opcional)</Label>
                  <Textarea
                    value={selectedHotspot.feedback || ''}
                    onChange={e => updateHotspot(activeNode.id, selectedHotspot.id, { feedback: e.target.value })}
                    rows={2}
                    className="text-xs"
                  />
                </div>

                {selectedHotspot.kind === 'hotspot' && selectedHotspot.isCorrect && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pista de esta zona (sólo si la pide)</Label>
                    <Input
                      value={selectedHotspot.hint || ''}
                      onChange={e => updateHotspot(activeNode.id, selectedHotspot.id, { hint: e.target.value })}
                    />
                  </div>
                )}

                <div className="grid grid-cols-4 gap-1.5">
                  {(['xPct', 'yPct', 'wPct', 'hPct'] as const).map(k => (
                    <div key={k} className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{k}</Label>
                      <Input
                        type="number" step={0.5} value={Math.round(selectedHotspot[k] * 10) / 10}
                        onChange={e => updateHotspot(activeNode.id, selectedHotspot.id, { [k]: Number(e.target.value) })}
                        className="h-7 text-xs px-1.5"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost" size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => deleteHotspot(activeNode.id, selectedHotspot.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />Eliminar zona
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Textarea de "una opción por línea".
 *
 * Guarda el texto crudo mientras se escribe. Antes se parseaba en cada tecla y
 * se volvía a unir con join('\n'): al presionar Enter, la línea vacía recién
 * creada se filtraba y el cursor rebotaba a la línea anterior, así que era
 * imposible capturar una segunda respuesta válida.
 */
function LinesTextarea({
  lines, onChangeLines, ...props
}: {
  lines: string[];
  onChangeLines: (lines: string[]) => void;
} & Omit<React.ComponentProps<typeof Textarea>, 'value' | 'onChange'>) {
  const [raw, setRaw] = useState(() => lines.join('\n'));

  return (
    <Textarea
      {...props}
      value={raw}
      onChange={e => {
        setRaw(e.target.value);
        onChangeLines(e.target.value.split('\n').map(s => s.trim()).filter(Boolean));
      }}
    />
  );
}

// ─── Lienzo de una pantalla: dibuja, selecciona y mueve zonas ────────────────

function NodeCanvas({
  node, selectedHotspotId, onSelectHotspot, onCreateHotspot, onMoveHotspot,
}: {
  node: SimNode;
  selectedHotspotId: string | null;
  onSelectHotspot: (id: string | null) => void;
  onCreateHotspot: (rect: { xPct: number; yPct: number; wPct: number; hPct: number }) => void;
  onMoveHotspot: (hotspotId: string, xPct: number, yPct: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draw, setDraw] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  function pctFromEvent(e: React.PointerEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function hitTest(x: number, y: number): SimHotspot | null {
    for (let i = node.hotspots.length - 1; i >= 0; i--) {
      const h = node.hotspots[i];
      if (x >= h.xPct && x <= h.xPct + h.wPct && y >= h.yPct && y <= h.yPct + h.hPct) return h;
    }
    return null;
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = pctFromEvent(e);
    const hit = hitTest(x, y);

    // Sobre una zona existente: seleccionar y mover, no dibujar encima.
    if (hit) {
      onSelectHotspot(hit.id);
      dragRef.current = { id: hit.id, offsetX: x - hit.xPct, offsetY: y - hit.yPct };
      return;
    }
    onSelectHotspot(null);
    setDraw({ x0: x, y0: y, x1: x, y1: y });
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (drag) {
      const { x, y } = pctFromEvent(e);
      const hotspot = node.hotspots.find(h => h.id === drag.id);
      if (!hotspot) return;
      onMoveHotspot(
        drag.id,
        Math.min(100 - hotspot.wPct, Math.max(0, x - drag.offsetX)),
        Math.min(100 - hotspot.hPct, Math.max(0, y - drag.offsetY)),
      );
      return;
    }
    if (!draw) return;
    const { x, y } = pctFromEvent(e);
    setDraw(prev => prev ? { ...prev, x1: x, y1: y } : prev);
  }

  function handlePointerUp() {
    dragRef.current = null;
    if (!draw) return;
    const xPct = Math.min(draw.x0, draw.x1);
    const yPct = Math.min(draw.y0, draw.y1);
    const wPct = Math.abs(draw.x1 - draw.x0);
    const hPct = Math.abs(draw.y1 - draw.y0);
    setDraw(null);
    if (wPct < 1.5 || hPct < 1.5) return; // arrastre demasiado pequeño: lo ignoramos
    onCreateHotspot({ xPct, yPct, wPct, hPct });
  }

  return (
    <div
      ref={containerRef}
      className="relative inline-block max-w-full select-none touch-none rounded-lg overflow-hidden border mx-auto"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <img src={node.imageUrl} alt="" className="block max-w-full h-auto max-h-[70vh]" draggable={false} />
      {node.hotspots.map(h => (
        <div
          key={h.id}
          className={cn(
            'absolute border-2 rounded-sm cursor-move',
            h.kind === 'checkbox' ? 'border-emerald-500 bg-emerald-500/20'
              : h.kind === 'text' ? 'border-amber-500 bg-amber-500/20'
              : h.isCorrect ? 'border-sky-500 bg-sky-500/25'
              : 'border-neutral-400 bg-neutral-400/20',
            selectedHotspotId === h.id && 'ring-2 ring-offset-1 ring-primary'
          )}
          style={{ left: `${h.xPct}%`, top: `${h.yPct}%`, width: `${h.wPct}%`, height: `${h.hPct}%` }}
        />
      ))}
      {draw && (
        <div
          className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
          style={{
            left: `${Math.min(draw.x0, draw.x1)}%`,
            top: `${Math.min(draw.y0, draw.y1)}%`,
            width: `${Math.abs(draw.x1 - draw.x0)}%`,
            height: `${Math.abs(draw.y1 - draw.y0)}%`,
          }}
        />
      )}
    </div>
  );
}

// ─── Intentos ────────────────────────────────────────────────────────────────

function AttemptsDialog({ module, onClose }: { module: SimModule | null; onClose: () => void }) {
  const [attempts, setAttempts] = useState<SimAttempt[] | null>(null);

  useEffect(() => {
    if (!module) { setAttempts(null); return; }
    let active = true;
    setAttempts(null);
    getSimAttempts(module.id).then(result => { if (active) setAttempts(result); });
    return () => { active = false; };
  }, [module]);

  const nodeLabel = (nodeId?: string) => {
    if (!module || !nodeId) return '—';
    const index = module.nodes.findIndex(n => n.id === nodeId);
    return index >= 0 ? `Pantalla ${index + 1}` : 'Pantalla eliminada';
  };

  return (
    <Dialog open={!!module} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Intentos · {module?.title}</DialogTitle>
          <DialogDescription>
            Los intentos se registran desde que empiezan, así que aquí también aparece quién se
            quedó a la mitad y en qué pantalla.
          </DialogDescription>
        </DialogHeader>

        {attempts === null ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : attempts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Todavía nadie ha intentado este módulo.</p>
        ) : (
          <div className="space-y-2">
            {attempts.map(attempt => (
              <div key={attempt.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{attempt.userName || attempt.userEmail || 'Sin identificar'}</p>
                    <p className="text-xs text-muted-foreground">
                      {attempt.state === 'in_progress' ? `En curso · ${nodeLabel(attempt.lastNodeId)}`
                        : attempt.state === 'abandoned' ? `Abandonado en ${nodeLabel(attempt.lastNodeId)}`
                        : `Terminado · ${attempt.stepsTaken} paso${attempt.stepsTaken === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <Badge variant={
                    attempt.outcome === 'passed' ? 'default'
                      : attempt.outcome === 'failed' ? 'destructive'
                      : 'secondary'
                  }>
                    {attempt.outcome === 'passed' ? 'Aprobado'
                      : attempt.outcome === 'failed' ? 'Para repasar'
                      : attempt.outcome === 'pending_review' ? 'Por revisar'
                      : attempt.state === 'in_progress' ? 'En curso' : 'Sin terminar'}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{attempt.wrongTaps} error{attempt.wrongTaps === 1 ? '' : 'es'}</span>
                  <span>{attempt.hintsUsed} pista{attempt.hintsUsed === 1 ? '' : 's'}</span>
                  {attempt.durationMs ? <span>{Math.round(attempt.durationMs / 1000)}s</span> : null}
                  {attempt.needsManualReview && <span className="text-amber-600">respuestas abiertas por revisar</span>}
                </div>
                {attempt.textAnswers && Object.keys(attempt.textAnswers).length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {Object.entries(attempt.textAnswers).map(([hotspotId, value]) => (
                      <p key={hotspotId} className="text-xs">
                        <span className="text-muted-foreground">
                          {module?.nodes.flatMap(n => n.hotspots).find(h => h.id === hotspotId)?.label || 'Campo'}:
                        </span>{' '}
                        {value}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
