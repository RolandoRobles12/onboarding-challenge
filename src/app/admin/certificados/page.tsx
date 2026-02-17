'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getAllCertificateSigners,
  createCertificateSigner,
  updateCertificateSigner,
  deleteCertificateSigner,
  getCertificateConfig,
  saveCertificateConfig,
} from '@/lib/firestore-service';
import type { CertificateSigner } from '@/lib/types-scalable';
import { DEFAULT_CERTIFICATE_CONFIG } from '@/lib/types-scalable';
import type { CertificateConfig } from '@/lib/types-scalable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { useToast } from '@/hooks/use-toast';
import { Certificate } from '@/components/Certificate';
import {
  Award,
  PenLine,
  LayoutTemplate,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  UserCheck,
  Save,
  RotateCcw,
  Upload,
  X,
  ImageIcon,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
const DEFAULT_SIGNER_FORM = { name: '', position: '' };
type EditableConfig = Omit<CertificateConfig, 'organizationId' | 'updatedAt'>;

/** 4 opciones de color para el certificado */
const CERT_COLORS = [
  { label: 'Mint claro',   value: '#b0f5cd' },
  { label: 'Verde medio',  value: '#16b877' },
  { label: 'Verde oscuro', value: '#026149' },
  { label: 'Blanco',       value: '#FFFFFF' },
];

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CertificadosPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Signers state ──────────────────────────────────────────────────────────
  const [signers, setSigners] = useState<CertificateSigner[]>([]);
  const [loadingSigners, setLoadingSigners] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingSigner, setEditingSigner] = useState<CertificateSigner | null>(null);
  const [signerForm, setSignerForm] = useState(DEFAULT_SIGNER_FORM);
  const [savingSigner, setSavingSigner] = useState(false);

  // ── Template state ─────────────────────────────────────────────────────────
  const [certConfig, setCertConfig] = useState<EditableConfig>({ ...DEFAULT_CERTIFICATE_CONFIG });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadSigners();
    getCertificateConfig()
      .then(c => {
        const { organizationId: _o, updatedAt: _u, ...rest } = c;
        setCertConfig(rest);
      })
      .finally(() => setLoadingConfig(false));
  }, []);

  // ── Signers helpers ────────────────────────────────────────────────────────
  async function loadSigners() {
    setLoadingSigners(true);
    const data = await getAllCertificateSigners();
    setSigners(data);
    setLoadingSigners(false);
  }

  function openSignerDialog(signer?: CertificateSigner) {
    if (signer) {
      setEditingSigner(signer);
      setSignerForm({ name: signer.name, position: signer.position });
    } else {
      setEditingSigner(null);
      setSignerForm(DEFAULT_SIGNER_FORM);
    }
    setDialogOpen(true);
  }

  async function handleSaveSigner() {
    if (!signerForm.name.trim() || !signerForm.position.trim()) {
      toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Completa el nombre y el cargo.' });
      return;
    }
    if (!user) return;
    setSavingSigner(true);
    try {
      if (editingSigner) {
        await updateCertificateSigner(editingSigner.id, {
          name: signerForm.name.trim(),
          position: signerForm.position.trim(),
        });
        toast({ title: 'Firmante actualizado' });
      } else {
        await createCertificateSigner(
          {
            organizationId: 'aviva-credito',
            name: signerForm.name.trim(),
            position: signerForm.position.trim(),
            active: true,
            order: signers.length,
            createdBy: user.uid,
          },
          user.uid
        );
        toast({ title: 'Firmante creado' });
      }
      setDialogOpen(false);
      await loadSigners();
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSavingSigner(false);
    }
  }

  async function handleDeleteSigner() {
    if (!deleteId) return;
    try {
      await deleteCertificateSigner(deleteId);
      toast({ title: 'Firmante eliminado' });
      await loadSigners();
    } catch {
      toast({ variant: 'destructive', title: 'Error al eliminar' });
    } finally {
      setDeleteId(null);
    }
  }

  async function toggleActive(signer: CertificateSigner) {
    try {
      await updateCertificateSigner(signer.id, { active: !signer.active });
      await loadSigners();
    } catch {
      toast({ variant: 'destructive', title: 'Error al actualizar' });
    }
  }

  // ── Template helpers ───────────────────────────────────────────────────────
  function setConfigField<K extends keyof EditableConfig>(key: K, value: EditableConfig[K]) {
    setCertConfig(prev => ({ ...prev, [key]: value }));
  }

  /** Convierte un archivo a base64 data-URL y lo guarda en el campo indicado */
  function handleImageUpload(field: 'logoUrl' | 'mascotUrl', file: File | undefined) {
    if (!file) return;
    const maxMB = 2;
    if (file.size > maxMB * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Imagen demasiado grande', description: `Máximo ${maxMB} MB.` });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string;
      setConfigField(field, result);
      // Al subir una imagen, habilitar el campo correspondiente
      if (field === 'logoUrl') setConfigField('showLogo', true);
      if (field === 'mascotUrl') setConfigField('showMascot', true);
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      await saveCertificateConfig(certConfig);
      toast({ title: 'Plantilla guardada', description: 'Los cambios se aplicarán en los próximos certificados.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSavingConfig(false);
    }
  }

  function handleResetConfig() {
    setCertConfig({ ...DEFAULT_CERTIFICATE_CONFIG });
    toast({ title: 'Valores restaurados', description: 'Guarda para aplicarlos.' });
  }

  const previewSigners = signers.filter(s => s.active).slice(0, 3).map(s => ({ name: s.name, position: s.position }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="h-6 w-6" /> Certificados
        </h1>
        <p className="text-muted-foreground">
          Administra los firmantes y la plantilla visual de los certificados
        </p>
      </div>

      <Tabs defaultValue="firmantes">
        <TabsList className="mb-4">
          <TabsTrigger value="firmantes" className="gap-2">
            <PenLine className="h-4 w-4" /> Firmantes
          </TabsTrigger>
          <TabsTrigger value="plantilla" className="gap-2">
            <LayoutTemplate className="h-4 w-4" /> Plantilla
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════
            TAB: FIRMANTES
        ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="firmantes" className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">Firmantes de certificado</h2>
              <p className="text-sm text-muted-foreground">
                Configura quién firma los certificados y con qué cargo aparece
              </p>
            </div>
            <Button onClick={() => openSignerDialog()}>
              <Plus className="h-4 w-4 mr-2" /> Nuevo firmante
            </Button>
          </div>

          {/* Info */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="py-4 flex gap-3 items-start">
              <UserCheck className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">¿Cómo funcionan los firmantes?</p>
                <p className="mt-0.5 text-blue-700">
                  Crea las personas que firmarán los certificados (nombre + cargo).
                  Luego, en <strong>Rutas del Jaguar Aviva</strong>, selecciona hasta 3
                  firmantes para cada paso de tipo "Certificado".
                </p>
              </div>
            </CardContent>
          </Card>

          {/* List */}
          {loadingSigners ? (
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
                <Button className="mt-4" onClick={() => openSignerDialog()}>
                  <Plus className="h-4 w-4 mr-2" /> Crear primer firmante
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {signers.map(signer => (
                <Card key={signer.id} className={signer.active ? '' : 'opacity-50'}>
                  <CardContent className="py-3 flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
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
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(signer)} title={signer.active ? 'Desactivar' : 'Activar'}>
                        <UserCheck className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openSignerDialog(signer)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(signer.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Signer preview at footer of certificate */}
          {signers.filter(s => s.active).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vista previa de firmantes</CardTitle>
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
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════
            TAB: PLANTILLA
        ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="plantilla">
          {loadingConfig ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse bg-muted" />)}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Plantilla actions */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Plantilla visual</h2>
                  <p className="text-sm text-muted-foreground">
                    Personaliza los textos, colores y elementos visuales del certificado
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleResetConfig} className="gap-2">
                    <RotateCcw className="h-4 w-4" /> Restaurar
                  </Button>
                  <Button onClick={handleSaveConfig} disabled={savingConfig} className="gap-2">
                    <Save className="h-4 w-4" />
                    {savingConfig ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Editor */}
                <div className="space-y-5">

                  {/* Textos */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Textos del certificado</CardTitle>
                      <CardDescription>Edita los textos que aparecen en el certificado</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Título principal</Label>
                        <Input
                          value={certConfig.title}
                          onChange={e => setConfigField('title', e.target.value)}
                          placeholder="CERTIFICADO DE PARTICIPACIÓN"
                        />
                        <p className="text-xs text-muted-foreground">Se muestra en mayúsculas debajo del subtítulo</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Subtítulo</Label>
                        <Input
                          value={certConfig.subtitle}
                          onChange={e => setConfigField('subtitle', e.target.value)}
                          placeholder="Desafío Aviva"
                        />
                        <p className="text-xs text-muted-foreground">Texto pequeño sobre el título (ej. nombre del programa)</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Prefijo del cuerpo</Label>
                        <Input
                          value={certConfig.bodyPrefix}
                          onChange={e => setConfigField('bodyPrefix', e.target.value)}
                          placeholder="Este certificado se otorga a"
                        />
                        <p className="text-xs text-muted-foreground">Texto que aparece antes del nombre del participante</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Sufijo del cuerpo</Label>
                        <Input
                          value={certConfig.bodySuffix}
                          onChange={e => setConfigField('bodySuffix', e.target.value)}
                          placeholder="Por haber completado exitosamente el módulo de"
                        />
                        <p className="text-xs text-muted-foreground">
                          Texto después del nombre. El módulo y la puntuación se agregan automáticamente.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Color de fondo */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Color de fondo</CardTitle>
                      <CardDescription>Elige uno de los 4 colores oficiales</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {CERT_COLORS.map(c => {
                          const isSelected = certConfig.bgColorStart === c.value;
                          return (
                            <button
                              key={c.value}
                              onClick={() => {
                                setConfigField('bgColorStart', c.value);
                                setConfigField('bgColorEnd', c.value);
                              }}
                              className="flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all hover:scale-105"
                              style={{
                                borderColor: isSelected ? '#026149' : 'transparent',
                                boxShadow: isSelected ? '0 0 0 2px #026149' : '0 0 0 1px #e5e7eb',
                              }}
                            >
                              <div
                                className="h-12 w-full rounded-lg"
                                style={{
                                  background: c.value,
                                  border: c.value === '#FFFFFF' ? '1px solid #d1d5db' : 'none',
                                }}
                              />
                              <span className="text-xs font-medium text-center leading-tight">{c.label}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{c.value}</span>
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Imágenes */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Imágenes del certificado</CardTitle>
                      <CardDescription>Sube tu propio logo y tu mascota. Máximo 2 MB por imagen (PNG, JPG, SVG)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">

                      {/* Logo */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Logo</p>
                            <p className="text-xs text-muted-foreground">Aparece en la esquina superior izquierda</p>
                          </div>
                          <Switch checked={certConfig.showLogo} onCheckedChange={v => setConfigField('showLogo', v)} />
                        </div>
                        {certConfig.showLogo && (
                          <div className="flex items-center gap-3 flex-wrap">
                            {certConfig.logoUrl ? (
                              <div className="relative">
                                <img
                                  src={certConfig.logoUrl}
                                  alt="Logo"
                                  className="h-12 w-auto rounded border object-contain bg-muted/30 p-1"
                                  style={{ maxWidth: '160px' }}
                                />
                                <button
                                  onClick={() => setConfigField('logoUrl', undefined)}
                                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                                  title="Quitar imagen"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="h-12 w-28 rounded border border-dashed flex items-center justify-center bg-muted/20">
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleImageUpload('logoUrl', e.target.files?.[0])}
                              />
                              <span className="inline-flex items-center gap-1.5 text-sm font-medium border rounded-md px-3 py-1.5 hover:bg-muted transition-colors">
                                <Upload className="h-4 w-4" />
                                {certConfig.logoUrl ? 'Cambiar imagen' : 'Subir logo'}
                              </span>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Mascota */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Mascota / imagen decorativa</p>
                            <p className="text-xs text-muted-foreground">Aparece en la zona derecha del certificado</p>
                          </div>
                          <Switch checked={certConfig.showMascot} onCheckedChange={v => setConfigField('showMascot', v)} />
                        </div>
                        {certConfig.showMascot && (
                          <div className="flex items-center gap-3 flex-wrap">
                            {certConfig.mascotUrl ? (
                              <div className="relative">
                                <img
                                  src={certConfig.mascotUrl}
                                  alt="Mascota"
                                  className="h-16 w-auto rounded border object-contain bg-muted/30 p-1"
                                  style={{ maxWidth: '80px' }}
                                />
                                <button
                                  onClick={() => setConfigField('mascotUrl', undefined)}
                                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                                  title="Quitar imagen"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="h-16 w-12 rounded border border-dashed flex items-center justify-center bg-muted/20">
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleImageUpload('mascotUrl', e.target.files?.[0])}
                              />
                              <span className="inline-flex items-center gap-1.5 text-sm font-medium border rounded-md px-3 py-1.5 hover:bg-muted transition-colors">
                                <Upload className="h-4 w-4" />
                                {certConfig.mascotUrl ? 'Cambiar imagen' : 'Subir mascota'}
                              </span>
                            </label>
                          </div>
                        )}
                        {certConfig.showMascot && !certConfig.mascotUrl && (
                          <p className="text-xs text-muted-foreground">Si no subes una imagen, se usará el jaguar predeterminado.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Live preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Vista previa en tiempo real</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowPreview(p => !p)}>
                      {showPreview ? 'Ocultar' : 'Mostrar'}
                    </Button>
                  </div>

                  {showPreview ? (
                    <div className="rounded-xl overflow-hidden border shadow-sm">
                      <Certificate
                        fullName="Juan Pérez García"
                        quizTitle="Jaguar Aviva Crédito"
                        score={18}
                        totalQuestions={20}
                        date={new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                        signers={previewSigners.length > 0 ? previewSigners : undefined}
                        config={certConfig}
                      />
                    </div>
                  ) : (
                    <Card className="border-dashed">
                      <CardContent className="py-10 text-center text-muted-foreground text-sm">
                        Vista previa oculta. Haz clic en "Mostrar" para verla.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit signer Dialog ──────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSigner ? 'Editar firmante' : 'Nuevo firmante'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="signer-name">Nombre completo</Label>
              <Input
                id="signer-name"
                value={signerForm.name}
                onChange={e => setSignerForm({ ...signerForm, name: e.target.value })}
                placeholder="Ej. María González"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signer-position">Cargo / Título</Label>
              <Input
                id="signer-position"
                value={signerForm.position}
                onChange={e => setSignerForm({ ...signerForm, position: e.target.value })}
                placeholder="Ej. Directora de Capacitación"
              />
            </div>
            {(signerForm.name || signerForm.position) && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-3">Vista previa:</p>
                <div className="text-center inline-block min-w-[120px]">
                  <div className="border-t-2 border-foreground pt-2 mt-4">
                    <p className="font-semibold text-sm">{signerForm.name || 'Nombre'}</p>
                    <p className="text-xs text-muted-foreground">{signerForm.position || 'Cargo'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveSigner} disabled={savingSigner}>
              {savingSigner ? 'Guardando...' : editingSigner ? 'Guardar cambios' : 'Crear firmante'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────────────── */}
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
              onClick={handleDeleteSigner}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
