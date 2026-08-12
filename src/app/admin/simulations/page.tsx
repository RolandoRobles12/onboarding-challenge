'use client';

/**
 * Prototipo: editor de "simulaciones por nodos".
 *
 * Un módulo es una secuencia de capturas reales de una herramienta (HubSpot,
 * Slack, el prototipo de Aviva...). Cada captura tiene zonas dibujadas encima:
 * "hotspot" (solo se toca, avanza a la siguiente pantalla) o "checkbox" (debe
 * quedar marcada o no). El vendedor navega tocando la imagen, igual que en la
 * app real; nosotros calificamos la ruta y el estado final.
 *
 * Standalone a propósito: todavía no se conecta al banco de preguntas, a
 * AssessmentConfig ni a cursos/rutas. Es la prueba antes de integrarlo.
 */

import { useEffect, useRef, useState } from 'react';
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
import { toast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  getAllSimModules, createSimModule, updateSimModule, deleteSimModule,
} from '@/lib/firestore-service';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import type { SimModule, SimNode, SimHotspot, SimHotspotKind } from '@/lib/types-simulation';
import { Plus, Trash2, ExternalLink, Upload, MousePointerClick, CheckSquare, ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const { confirm, dialog } = useConfirm();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setModules(await getAllSimModules());
    setLoading(false);
  }

  function openNew() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setView('builder');
  }

  function openEdit(m: SimModule) {
    setEditingId(m.id);
    setDraft({
      title: m.title,
      instructions: m.instructions,
      startNodeId: m.startNodeId,
      active: m.active,
      nodes: m.nodes,
    });
    setView('builder');
  }

  async function handleDelete(m: SimModule) {
    if (!await confirm({ title: `¿Eliminar "${m.title}"?`, description: 'Esta acción no se puede deshacer.' })) return;
    await deleteSimModule(m.id);
    toast({ title: 'Módulo eliminado' });
    load();
  }

  async function handleSave() {
    if (!draft.title.trim()) {
      toast({ variant: 'destructive', title: 'Ponle un título al módulo' });
      return;
    }
    if (draft.nodes.length === 0) {
      toast({ variant: 'destructive', title: 'Agrega al menos una pantalla' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        instructions: draft.instructions.trim(),
        startNodeId: draft.startNodeId || draft.nodes[0].id,
        active: draft.active,
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
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'No se pudo guardar el módulo' });
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
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulaciones (beta)</h1>
          <p className="text-sm text-muted-foreground">
            Prototipo: ejercicios donde el vendedor navega capturas reales de una herramienta tocando zonas, en vez de responder opción múltiple.
            Todavía no forma parte de cursos ni rutas — pruébalo aquí primero.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nuevo módulo</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : modules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Todavía no hay módulos de simulación. Crea el primero para probar el patrón.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(m => (
            <Card key={m.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{m.title}</CardTitle>
                  <Badge variant={m.active ? 'default' : 'secondary'}>{m.active ? 'Activo' : 'Inactivo'}</Badge>
                </div>
                <CardDescription className="line-clamp-2">{m.instructions || 'Sin instrucciones'}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <p className="text-xs text-muted-foreground">{m.nodes.length} pantalla{m.nodes.length === 1 ? '' : 's'}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(m)}>Editar</Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/simulations/${m.id}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Probar
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(m)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}

// ─── Builder ────────────────────────────────────────────────────────────────

function Builder({
  draft, setDraft, moduleId, saving, onSave, onBack,
}: {
  draft: Draft;
  setDraft: (d: Draft | ((prev: Draft) => Draft)) => void;
  moduleId: string | null;
  saving: boolean;
  onSave: () => void;
  onBack: () => void;
}) {
  const draftIdRef = useRef(moduleId || genId());
  const [activeNodeId, setActiveNodeId] = useState<string | null>(draft.nodes[0]?.id ?? null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeNode = draft.nodes.find(n => n.id === activeNodeId) || null;
  const selectedHotspot = activeNode?.hotspots.find(h => h.id === selectedHotspotId) || null;

  function updateNode(nodeId: string, patch: Partial<SimNode>) {
    setDraft(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, ...patch } : n) }));
  }

  function addHotspot(nodeId: string, hotspot: SimHotspot) {
    setDraft(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, hotspots: [...n.hotspots, hotspot] } : n),
    }));
    setSelectedHotspotId(hotspot.id);
  }

  function updateHotspot(nodeId: string, hotspotId: string, patch: Partial<SimHotspot>) {
    setDraft(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id !== nodeId ? n : {
        ...n,
        hotspots: n.hotspots.map(h => h.id === hotspotId ? { ...h, ...patch } : h),
      }),
    }));
  }

  function deleteHotspot(nodeId: string, hotspotId: string) {
    setDraft(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id !== nodeId ? n : { ...n, hotspots: n.hotspots.filter(h => h.id !== hotspotId) }),
    }));
    setSelectedHotspotId(null);
  }

  function deleteNode(nodeId: string) {
    setDraft(prev => {
      const nodes = prev.nodes
        .filter(n => n.id !== nodeId)
        .map(n => ({ ...n, hotspots: n.hotspots.map(h => h.nextNodeId === nodeId ? { ...h, nextNodeId: undefined } : h) }));
      return { ...prev, nodes, startNodeId: prev.startNodeId === nodeId ? (nodes[0]?.id || '') : prev.startNodeId };
    });
    if (activeNodeId === nodeId) setActiveNodeId(null);
  }

  async function handleUpload(file: File) {
    if (!storage) { toast({ variant: 'destructive', title: 'Storage no configurado' }); return; }
    setUploading(true);
    const path = `simulations/${draftIdRef.current}/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on(
      'state_changed',
      () => {},
      () => { toast({ variant: 'destructive', title: 'Error al subir la captura' }); setUploading(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        const newNode: SimNode = { id: genId(), imageUrl: url, hotspots: [] };
        setDraft(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode],
          startNodeId: prev.startNodeId || newNode.id,
        }));
        setActiveNodeId(newNode.id);
        setUploading(false);
      }
    );
  }

  const nodeLabel = (id?: string) => {
    if (!id) return '— Fin del módulo —';
    const idx = draft.nodes.findIndex(n => n.id === id);
    return idx >= 0 ? `Pantalla ${idx + 1}` : 'Pantalla eliminada';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1.5" />Volver</Button>
        <div className="flex items-center gap-2">
          {moduleId && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/simulations/${moduleId}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Probar
              </a>
            </Button>
          )}
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Guardar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Título</Label>
            <Input value={draft.title} onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))} placeholder='Ej. "Agrega la vista Mis negocios en HubSpot"' />
          </div>
          <div className="flex items-center gap-2 md:justify-end">
            <Label htmlFor="active-switch">Activo</Label>
            <Switch id="active-switch" checked={draft.active} onCheckedChange={c => setDraft(prev => ({ ...prev, active: c }))} />
          </div>
          <div className="md:col-span-3 space-y-1.5">
            <Label>Instrucciones para el vendedor</Label>
            <Textarea
              value={draft.instructions}
              onChange={e => setDraft(prev => ({ ...prev, instructions: e.target.value }))}
              placeholder='Ej. "Abre HubSpot y añade la vista Mis negocios a los Deals."'
              rows={2}
            />
          </div>
          {draft.nodes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Pantalla inicial</Label>
              <Select value={draft.startNodeId || draft.nodes[0].id} onValueChange={v => setDraft(prev => ({ ...prev, startNodeId: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {draft.nodes.map((n, i) => <SelectItem key={n.id} value={n.id}>Pantalla {i + 1}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_320px] gap-4">
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
                <span className="flex-1 truncate">Pantalla {i + 1}</span>
                <span className="text-muted-foreground">{n.hotspots.length}z</span>
              </button>
            ))}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
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
              {activeNode ? 'Dibuja una zona arrastrando sobre la imagen' : 'Selecciona o agrega una pantalla'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeNode ? (
              <NodeCanvas
                node={activeNode}
                selectedHotspotId={selectedHotspotId}
                onSelectHotspot={setSelectedHotspotId}
                onCreateHotspot={rect => addHotspot(activeNode.id, {
                  id: genId(),
                  label: `Zona ${activeNode.hotspots.length + 1}`,
                  kind: 'hotspot',
                  isCorrect: true,
                  ...rect,
                })}
              />
            ) : (
              <div className="aspect-[9/16] max-w-xs mx-auto rounded-lg border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                Sin pantalla seleccionada
              </div>
            )}
            {activeNode && (
              <div className="mt-3 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nota interna (no la ve el vendedor)</Label>
                <Textarea
                  value={activeNode.note || ''}
                  onChange={e => updateNode(activeNode.id, { note: e.target.value })}
                  rows={2}
                  className="text-xs"
                />
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
                    {h.kind === 'checkbox' ? <CheckSquare className="h-3.5 w-3.5 shrink-0" /> : <MousePointerClick className="h-3.5 w-3.5 shrink-0" />}
                    <span className="flex-1 truncate">{h.label}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedHotspot && activeNode && (
              <div className="space-y-3 border-t pt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Etiqueta</Label>
                  <Input value={selectedHotspot.label} onChange={e => updateHotspot(activeNode.id, selectedHotspot.id, { label: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de zona</Label>
                  <Select value={selectedHotspot.kind} onValueChange={(v: SimHotspotKind) => updateHotspot(activeNode.id, selectedHotspot.id, { kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotspot">Zona táctil (avanza al tocar)</SelectItem>
                      <SelectItem value="checkbox">Casilla (marcar / desmarcar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="correct-check"
                    checked={selectedHotspot.isCorrect}
                    onCheckedChange={c => updateHotspot(activeNode.id, selectedHotspot.id, { isCorrect: !!c })}
                  />
                  <Label htmlFor="correct-check" className="text-xs font-normal">
                    {selectedHotspot.kind === 'checkbox' ? 'Debe quedar marcada' : 'Es la zona correcta a tocar'}
                  </Label>
                </div>
                {selectedHotspot.kind === 'hotspot' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Lleva a</Label>
                    <Select
                      value={selectedHotspot.nextNodeId || '__end__'}
                      onValueChange={v => updateHotspot(activeNode.id, selectedHotspot.id, { nextNodeId: v === '__end__' ? undefined : v })}
                    >
                      <SelectTrigger><SelectValue>{nodeLabel(selectedHotspot.nextNodeId)}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__end__">— Fin del módulo —</SelectItem>
                        {draft.nodes.filter(n => n.id !== activeNode.id).map((n, i) => (
                          <SelectItem key={n.id} value={n.id}>{nodeLabel(n.id)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Retroalimentación (opcional)</Label>
                  <Textarea
                    value={selectedHotspot.feedback || ''}
                    onChange={e => updateHotspot(activeNode.id, selectedHotspot.id, { feedback: e.target.value })}
                    rows={2}
                    className="text-xs"
                  />
                </div>
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
                <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" onClick={() => deleteHotspot(activeNode.id, selectedHotspot.id)}>
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

// ─── Lienzo de una pantalla: dibuja y muestra zonas ───────────────────────────

function NodeCanvas({
  node, selectedHotspotId, onSelectHotspot, onCreateHotspot,
}: {
  node: SimNode;
  selectedHotspotId: string | null;
  onSelectHotspot: (id: string | null) => void;
  onCreateHotspot: (rect: { xPct: number; yPct: number; wPct: number; hPct: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draw, setDraw] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  function pctFromEvent(e: React.PointerEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    return { x, y };
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = pctFromEvent(e);
    setDraw({ x0: x, y0: y, x1: x, y1: y });
    onSelectHotspot(null);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draw) return;
    const { x, y } = pctFromEvent(e);
    setDraw(prev => prev ? { ...prev, x1: x, y1: y } : prev);
  }

  function handlePointerUp() {
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
    >
      <img src={node.imageUrl} alt="" className="block max-w-full h-auto max-h-[70vh]" draggable={false} />
      {node.hotspots.map(h => (
        <div
          key={h.id}
          onClick={(e) => { e.stopPropagation(); onSelectHotspot(h.id); }}
          className={cn(
            'absolute border-2 rounded-sm cursor-pointer',
            h.kind === 'checkbox' ? 'border-emerald-500 bg-emerald-500/20' : 'border-sky-500 bg-sky-500/20',
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
