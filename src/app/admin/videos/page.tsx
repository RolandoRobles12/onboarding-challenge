'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  getAllVideos, createVideo, updateVideo, deleteVideo, getVideoViews,
  getVideoFolders, createVideoFolder, updateVideoFolder, deleteVideoFolder,
} from '@/lib/firestore-service';
import { useProducts } from '@/hooks/use-firestore';
import { useAuth } from '@/context/AuthContext';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import type { Video, VideoView, VideoFolder } from '@/lib/types-scalable';
import { serverTimestamp } from 'firebase/firestore';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Video as VideoIcon,
  Upload, Link as LinkIcon, X, Users, CheckCircle, Play,
  GripVertical, BarChart2, Folder, FolderPlus, Package, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(s: number) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Empty form state ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '',
  description: '',
  videoUrl: '',
  thumbnailUrl: '',
  duration: 0,
  productId: '',
  folderId: '',
  tags: '',
  active: true,
  order: 0,
};

// ─── Stats modal ──────────────────────────────────────────────────────────────

function StatsModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const [views, setViews] = useState<VideoView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVideoViews(video.id).then(setViews).finally(() => setLoading(false));
  }, [video.id]);

  const completed = views.filter(v => v.completed).length;
  const totalPlays = views.reduce((sum, v) => sum + (v.viewCount ?? 1), 0);
  const avgPct = views.length
    ? Math.round(views.reduce((sum, v) => sum + v.percentWatched, 0) / views.length)
    : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary" />
            Estadísticas: {video.title}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded-xl border p-3">
                <p className="text-2xl font-bold text-primary">{totalPlays}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Reproducciones</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-2xl font-bold text-blue-600">{views.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Usuarios únicos</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-2xl font-bold text-emerald-600">{completed}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Completaron (100%)</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-2xl font-bold text-amber-600">{avgPct}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">Promedio visto</p>
              </div>
            </div>

            {/* Viewer list */}
            {views.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">
                Nadie ha visto este video todavía.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Reproducciones</TableHead>
                      <TableHead className="text-right">% Máximo</TableHead>
                      <TableHead className="text-right">Completó</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {views.map(v => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{v.trainerName || 'Participante'}</p>
                          {v.assignedKiosko && <p className="text-xs text-muted-foreground">{v.assignedKiosko}</p>}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm font-semibold ${(v.viewCount ?? 1) > 1 ? 'text-purple-600' : 'text-muted-foreground'}`}>
                            {v.viewCount ?? 1}×
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-14 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${v.percentWatched}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono w-7 text-right">{v.percentWatched}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {v.completed
                            ? <CheckCircle className="h-4 w-4 text-emerald-500 ml-auto" />
                            : <span className="text-xs text-muted-foreground">No</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Video Form Dialog ─────────────────────────────────────────────────────────

function VideoFormDialog({
  initial,
  maxOrder,
  folders,
  onSave,
  onClose,
}: {
  initial?: Video;
  maxOrder: number;
  folders: VideoFolder[];
  onSave: (data: Omit<Video, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  onClose: () => void;
}) {
  const { products } = useProducts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    order: maxOrder,
    ...(initial
      ? {
          title: initial.title,
          description: initial.description ?? '',
          videoUrl: initial.videoUrl,
          thumbnailUrl: initial.thumbnailUrl ?? '',
          duration: initial.duration,
          productId: initial.productId ?? '',
          folderId: initial.folderId ?? '',
          tags: (initial.tags ?? []).join(', '),
          active: initial.active,
          order: initial.order,
        }
      : {}),
  });
  const [inputMode, setInputMode] = useState<'upload' | 'url'>(form.videoUrl ? 'url' : 'upload');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleChange(field: string, value: string | number | boolean) {
    setForm(p => ({ ...p, [field]: value }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !storage) return;
    setUploadError('');
    setUploadProgress(0);
    const path = `videos/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on(
      'state_changed',
      snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      () => { setUploadError('Error al subir. Intenta de nuevo.'); setUploadProgress(null); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setForm(p => ({ ...p, videoUrl: url }));
        setUploadProgress(null);
        setInputMode('url');
      }
    );
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('El título es obligatorio.'); return; }
    if (!form.videoUrl.trim()) { setError('Debes subir o pegar la URL del video.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        videoUrl: form.videoUrl.trim(),
        thumbnailUrl: form.thumbnailUrl.trim() || undefined,
        duration: Number(form.duration) || 0,
        productId: form.productId || undefined,
        folderId: form.folderId || undefined,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        active: form.active,
        order: Number(form.order) || 0,
      });
      onClose();
    } catch {
      setError('Error al guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar video' : 'Nuevo video'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div>
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder="Ej. Cómo presentar el producto Vida"
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label>Descripción</Label>
            <Textarea
              value={form.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Resumen corto del contenido del video..."
              rows={2}
              className="mt-1 resize-none"
            />
          </div>

          {/* Video file */}
          <div>
            <Label>Video *</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button" variant={inputMode === 'upload' ? 'default' : 'outline'}
                size="sm" onClick={() => setInputMode('upload')}
                className="gap-1"
              >
                <Upload className="h-3.5 w-3.5" /> Subir archivo
              </Button>
              <Button
                type="button" variant={inputMode === 'url' ? 'default' : 'outline'}
                size="sm" onClick={() => setInputMode('url')}
                className="gap-1"
              >
                <LinkIcon className="h-3.5 w-3.5" /> URL externa
              </Button>
            </div>

            {inputMode === 'upload' ? (
              <div className="mt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {form.videoUrl ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 border rounded-lg p-2">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">Video subido</span>
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-6 w-6 ml-auto shrink-0"
                      onClick={() => { setForm(p => ({ ...p, videoUrl: '' })); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : uploadProgress !== null ? (
                  <div className="mt-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{uploadProgress}% subido…</p>
                  </div>
                ) : (
                  <Button
                    type="button" variant="outline"
                    className="mt-2 w-full border-dashed"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" /> Seleccionar video (MP4, WebM, MOV)
                  </Button>
                )}
                {uploadError && <p className="text-xs text-destructive mt-1">{uploadError}</p>}
              </div>
            ) : (
              <Input
                value={form.videoUrl}
                onChange={e => handleChange('videoUrl', e.target.value)}
                placeholder="https://..."
                className="mt-2"
              />
            )}
          </div>

          {/* Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Duración (segundos)</Label>
              <Input
                type="number"
                min={0}
                value={form.duration || ''}
                onChange={e => handleChange('duration', e.target.value)}
                placeholder="Ej. 90"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-0.5">
                {form.duration > 0 ? fmtDuration(Number(form.duration)) : 'Se puede dejar en 0'}
              </p>
            </div>
            <div>
              <Label>Orden</Label>
              <Input
                type="number"
                min={0}
                value={form.order}
                onChange={e => handleChange('order', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Product filter */}
          <div>
            <Label>Filtrar por producto <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Select value={form.productId} onValueChange={v => handleChange('productId', v === '_all' ? '' : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Todos los productos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los productos</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Folder */}
          {folders.length > 0 && (
            <div>
              <Label>Carpeta <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Select value={form.folderId} onValueChange={v => handleChange('folderId', v === '_none' ? '' : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sin carpeta (feed principal)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sin carpeta (feed principal)</SelectItem>
                  {folders.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Thumbnail URL */}
          <div>
            <Label>URL de miniatura <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              value={form.thumbnailUrl}
              onChange={e => handleChange('thumbnailUrl', e.target.value)}
              placeholder="https://… (imagen de portada)"
              className="mt-1"
            />
          </div>

          {/* Tags */}
          <div>
            <Label>Etiquetas <span className="text-muted-foreground font-normal">(separadas por coma)</span></Label>
            <Input
              value={form.tags}
              onChange={e => handleChange('tags', e.target.value)}
              placeholder="ventas, producto, técnica"
              className="mt-1"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.active}
              onCheckedChange={v => handleChange('active', v)}
              id="active-switch"
            />
            <Label htmlFor="active-switch" className="cursor-pointer">
              {form.active ? 'Visible para vendedores' : 'Oculto (borrador)'}
            </Label>
          </div>

          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || uploadProgress !== null}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Folder Form Dialog ────────────────────────────────────────────────────────

function FolderFormDialog({
  initial,
  maxOrder,
  onSave,
  onClose,
}: {
  initial?: VideoFolder;
  maxOrder: number;
  onSave: (data: Omit<VideoFolder, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    order: initial?.order ?? maxOrder,
    active: initial?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    try {
      await onSave({ name: form.name.trim(), description: form.description.trim() || undefined, order: Number(form.order) || 0, active: form.active });
      onClose();
    } catch { setError('Error al guardar.'); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar carpeta' : 'Nueva carpeta'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej. Técnicas de venta" className="mt-1" />
          </div>
          <div>
            <Label>Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="mt-1 resize-none" placeholder="Descripción breve de la carpeta..." />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} id="folder-active" />
            <Label htmlFor="folder-active" className="cursor-pointer">{form.active ? 'Visible' : 'Oculta'}</Label>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminVideosPage() {
  const { user } = useAuth();
  const { products } = useProducts();
  const [videos, setVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<VideoFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [statsVideo, setStatsVideo] = useState<Video | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [editingFolder, setEditingFolder] = useState<VideoFolder | null>(null);
  const [filterProductId, setFilterProductId] = useState<string>('all');
  const [filterFolderId, setFilterFolderId] = useState<string>('all');

  async function load() {
    setLoading(true);
    const [vids, flds] = await Promise.all([getAllVideos(), getVideoFolders()]);
    setVideos(vids);
    setFolders(flds);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(data: Omit<Video, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) {
    if (editing) {
      await updateVideo(editing.id, data);
    } else {
      await createVideo({ ...data, createdBy: user?.uid ?? '' } as any);
    }
    await load();
  }

  async function handleToggle(video: Video) {
    await updateVideo(video.id, { active: !video.active });
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, active: !v.active } : v));
  }

  async function handleDelete(videoId: string) {
    if (!confirm('¿Eliminar este video? Esta acción no se puede deshacer.')) return;
    setDeletingId(videoId);
    await deleteVideo(videoId);
    setVideos(prev => prev.filter(v => v.id !== videoId));
    setDeletingId(null);
  }

  async function handleSaveFolder(data: Omit<VideoFolder, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) {
    if (editingFolder) {
      await updateVideoFolder(editingFolder.id, data);
    } else {
      await createVideoFolder({ ...data, createdBy: user?.uid ?? '' } as any);
    }
    await load();
  }

  async function handleDeleteFolder(folderId: string) {
    if (!confirm('¿Eliminar esta carpeta? Los videos que estén en ella se moverán al feed principal.')) return;
    await deleteVideoFolder(folderId);
    // Move videos in this folder back to no folder
    const videosInFolder = videos.filter(v => v.folderId === folderId);
    await Promise.all(videosInFolder.map(v => updateVideo(v.id, { folderId: undefined })));
    await load();
  }

  const maxOrder = videos.length > 0 ? Math.max(...videos.map(v => v.order)) + 1 : 0;
  const maxFolderOrder = folders.length > 0 ? Math.max(...folders.map(f => f.order)) + 1 : 0;
  const folderMap = Object.fromEntries(folders.map(f => [f.id, f.name]));
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  const filteredVideos = useMemo(() => videos.filter(v => {
    if (filterProductId !== 'all' && (v.productId || '') !== filterProductId) return false;
    if (filterFolderId !== 'all') {
      if (filterFolderId === '__none__') return !v.folderId;
      if (v.folderId !== filterFolderId) return false;
    }
    return true;
  }), [videos, filterProductId, filterFolderId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Videos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sube videos tipo TikTok para los vendedores. Podrás ver quién los vio y cuánto.
          </p>
        </div>
      </div>

      {/* Tabs: Videos | Carpetas */}
      <Tabs defaultValue="videos">
        <TabsList>
          <TabsTrigger value="videos" className="gap-2">
            <VideoIcon className="h-4 w-4" /> Videos
          </TabsTrigger>
          <TabsTrigger value="folders" className="gap-2">
            <Folder className="h-4 w-4" /> Carpetas
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Videos ── */}
        <TabsContent value="videos" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Select value={filterProductId} onValueChange={setFilterProductId}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <Package className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Todos los productos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  <SelectItem value="">Sin producto</SelectItem>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterFolderId} onValueChange={setFilterFolderId}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <Folder className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Todas las carpetas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las carpetas</SelectItem>
                  <SelectItem value="__none__">Sin carpeta</SelectItem>
                  {folders.filter(f => f.active).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(filterProductId !== 'all' || filterFolderId !== 'all') && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1"
                  onClick={() => { setFilterProductId('all'); setFilterFolderId('all'); }}>
                  <X className="h-3 w-3" /> Limpiar filtros
                </Button>
              )}
            </div>
            <Button className="gap-2" onClick={() => { setEditing(null); setShowForm(true); }}>
              <Plus className="h-4 w-4" /> Nuevo video
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : videos.length === 0 ? (
            <Card className="rounded-xl">
              <CardContent className="py-16 text-center">
                <VideoIcon className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-40" />
                <p className="font-semibold text-lg">Aún no hay videos</p>
                <p className="text-muted-foreground text-sm mt-1">Sube el primer video para tu equipo de ventas.</p>
                <Button className="mt-4 gap-2" onClick={() => { setEditing(null); setShowForm(true); }}>
                  <Plus className="h-4 w-4" /> Subir primer video
                </Button>
              </CardContent>
            </Card>
          ) : filteredVideos.length === 0 ? (
            <Card className="rounded-xl">
              <CardContent className="py-10 text-center">
                <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-40" />
                <p className="text-muted-foreground text-sm">Sin videos para los filtros seleccionados.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredVideos.map(v => (
                <Card key={v.id} className={cn('rounded-xl transition-opacity', !v.active && 'opacity-60')}>
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div className="h-12 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {v.thumbnailUrl ? (
                        <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Play className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{v.title}</p>
                        {!v.active && <Badge variant="secondary" className="text-[10px]">Oculto</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {v.duration > 0 && <span className="text-xs text-muted-foreground">{fmtDuration(v.duration)}</span>}
                        {v.folderId && folderMap[v.folderId] && (
                          <Badge variant="outline" className="text-[10px] h-4 gap-1">
                            <Folder className="h-2.5 w-2.5" />{folderMap[v.folderId]}
                          </Badge>
                        )}
                        {v.productId && productMap[v.productId] && (
                          <Badge variant="outline" className="text-[10px] h-4 gap-1" style={{ borderColor: productMap[v.productId].color + '80', color: productMap[v.productId].color }}>
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: productMap[v.productId].color }} />
                            {productMap[v.productId].name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver estadísticas" onClick={() => setStatsVideo(v)}>
                        <BarChart2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title={v.active ? 'Ocultar' : 'Mostrar'} onClick={() => handleToggle(v)}>
                        {v.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(v); setShowForm(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={deletingId === v.id} onClick={() => handleDelete(v.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Carpetas ── */}
        <TabsContent value="folders" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button className="gap-2" onClick={() => { setEditingFolder(null); setShowFolderForm(true); }}>
              <FolderPlus className="h-4 w-4" /> Nueva carpeta
            </Button>
          </div>

          {folders.length === 0 ? (
            <Card className="rounded-xl">
              <CardContent className="py-16 text-center">
                <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-40" />
                <p className="font-semibold text-lg">Sin carpetas</p>
                <p className="text-muted-foreground text-sm mt-1">Crea carpetas para organizar tus videos.</p>
                <Button className="mt-4 gap-2" onClick={() => { setEditingFolder(null); setShowFolderForm(true); }}>
                  <FolderPlus className="h-4 w-4" /> Crear primera carpeta
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {folders.map(f => {
                const count = videos.filter(v => v.folderId === f.id).length;
                return (
                  <Card key={f.id} className={cn('rounded-xl transition-opacity', !f.active && 'opacity-60')}>
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Folder className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">{f.name}</p>
                          {!f.active && <Badge variant="secondary" className="text-[10px]">Oculta</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {count} {count === 1 ? 'video' : 'videos'}{f.description ? ` · ${f.description}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingFolder(f); setShowFolderForm(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteFolder(f.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {showForm && (
        <VideoFormDialog
          initial={editing ?? undefined}
          maxOrder={maxOrder}
          folders={folders}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {showFolderForm && (
        <FolderFormDialog
          initial={editingFolder ?? undefined}
          maxOrder={maxFolderOrder}
          onSave={handleSaveFolder}
          onClose={() => { setShowFolderForm(false); setEditingFolder(null); }}
        />
      )}
      {statsVideo && <StatsModal video={statsVideo} onClose={() => setStatsVideo(null)} />}
    </div>
  );
}
