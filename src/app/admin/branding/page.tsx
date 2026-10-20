'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { prepareLogo } from '@/lib/logo-processing';
import { DEFAULT_ACCENT, DEFAULT_PRIMARY } from '@/lib/branding';
import { storage } from '@/lib/firebase';
import { saveBrandingConfig } from '@/lib/firestore-service';
import { useBranding } from '@/context/BrandingContext';
import { AvivaLogo } from '@/components/AvivaLogo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Trash2, Image as ImageIcon, CheckCircle2, Palette, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

function ColorPicker({ label, description, value, defaultValue, onChange, onReset, saving }: {
  label: string;
  description: string;
  value: string;
  defaultValue: string;
  onChange: (hex: string) => void;
  onReset: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onReset} disabled={saving}>
          <RotateCcw className="h-3 w-3" /> Usar default
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value || defaultValue}
          onChange={e => onChange(e.target.value)}
          disabled={saving}
          className="h-10 w-14 rounded-lg border cursor-pointer bg-transparent"
        />
        <span className="text-sm font-mono text-muted-foreground">{(value || defaultValue).toUpperCase()}</span>
      </div>
    </div>
  );
}

type SlotKey = 'logoUrl' | 'iconUrl';

const SLOTS: { key: SlotKey; title: string; description: string; storageFolder: string; maxSize: number }[] = [
  {
    key: 'logoUrl',
    title: 'Logo completo (ícono + wordmark)',
    description: 'Se usa en el login y en los encabezados de página. Sube la versión para fondo oscuro (letras claras): se muestra sobre el color de acento.',
    storageFolder: 'full',
    maxSize: 1200,
  },
  {
    key: 'iconUrl',
    title: 'Ícono / símbolo únicamente',
    description: 'Se usa en espacios reducidos, como el panel de administración. Mejor si es cuadrado.',
    storageFolder: 'icon',
    maxSize: 512,
  },
];

/** Los archivos se suben con nombre único, así que se pueden cachear sin vencimiento. */
const LOGO_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function UploadSlot({ slotKey, title, description, storageFolder, maxSize, currentUrl, accentColor, onUploaded }: {
  slotKey: SlotKey;
  title: string;
  description: string;
  storageFolder: string;
  maxSize: number;
  currentUrl: string | null;
  accentColor: string;
  onUploaded: (key: SlotKey, url: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(true);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !storage) return;
    setError(null);
    setNotice(null);
    setProgress(0);

    // Se quita el fondo sólido, se recorta y se reduce antes de subir.
    let upload: Blob = file;
    let name = file.name;
    try {
      const prepared = await prepareLogo(file, { maxSize, removeSolidBackground: removeBackground });
      if (prepared) {
        upload = prepared.blob;
        name = `${file.name.replace(/\.[^.]+$/, '')}.png`;
        if (prepared.removedBackground) setNotice('Se quitó el fondo sólido de la imagen para que combine con los colores de la plataforma.');
      }
    } catch (err) {
      console.error('No se pudo procesar el logo, se sube tal cual:', err);
    }

    const timestamp = Date.now();
    const storagePath = `branding/${storageFolder}/${timestamp}_${name}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, upload, {
      contentType: upload.type || file.type,
      cacheControl: LOGO_CACHE_CONTROL,
    });

    task.on(
      'state_changed',
      snapshot => setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      err => {
        console.error('Upload error:', err);
        setError('Error al subir el archivo. Intenta de nuevo.');
        setProgress(null);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setProgress(null);
        setSaving(true);
        try {
          await saveBrandingConfig(slotKey === 'logoUrl' ? { logoUrl: url } : { iconUrl: url });
          onUploaded(slotKey, url);
        } catch {
          setError('Se subió el archivo pero no se pudo guardar. Intenta de nuevo.');
        } finally {
          setSaving(false);
        }
      }
    );
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);
    try {
      await saveBrandingConfig(slotKey === 'logoUrl' ? { logoUrl: null } : { iconUrl: null });
      onUploaded(slotKey, null);
    } catch {
      setError('No se pudo quitar el logo. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const busy = progress !== null || saving;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vista previa tal como se muestra: sobre el color de acento (encabezados)
            y en el login, donde va dentro de una placa del color de acento. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="rounded-lg border flex items-center justify-center h-20 p-3" style={{ backgroundColor: accentColor }}>
              {currentUrl
                ? <img src={currentUrl} alt={title} className="max-h-full max-w-full object-contain" />
                : <span className="text-xs text-white/70">Sin logo</span>}
            </div>
            <p className="text-[11px] text-muted-foreground text-center">Encabezados</p>
          </div>
          <div className="space-y-1">
            <div className="rounded-lg border bg-background flex items-center justify-center h-20 p-2">
              {currentUrl
                ? (
                  <div className="rounded-lg h-full flex items-center px-3 py-2" style={{ backgroundColor: accentColor }}>
                    <img src={currentUrl} alt={title} className="max-h-full max-w-full object-contain" />
                  </div>
                )
                : <span className="text-xs text-muted-foreground">Sin logo</span>}
            </div>
            <p className="text-[11px] text-muted-foreground text-center">Login (fondo claro)</p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={removeBackground} onCheckedChange={v => setRemoveBackground(v === true)} disabled={busy} className="mt-0.5" />
          Quitar el fondo sólido al subir (recomendado si el archivo trae un recuadro de color)
        </label>

        {busy && progress !== null && <Progress value={progress} className="h-1.5" />}
        {saving && progress === null && <p className="text-xs text-muted-foreground">Guardando…</p>}
        {error && <p className="text-xs text-destructive font-medium">{error}</p>}
        {notice && !error && <p className="text-xs text-emerald-700">{notice}</p>}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/svg+xml,image/png,image/webp,image/jpeg"
            className="hidden"
            onChange={handleFileChange}
            disabled={busy}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {currentUrl ? 'Reemplazar' : 'Subir imagen'}
          </Button>
          {currentUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={handleRemove}
            >
              <Trash2 className="h-3.5 w-3.5" /> Quitar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BrandingSettingsPage() {
  const { logoUrl, iconUrl, primaryColor, accentColor, loading, refreshBranding } = useBranding();
  const [localUrls, setLocalUrls] = useState<{ logoUrl: string | null; iconUrl: string | null } | null>(null);
  const [savingColors, setSavingColors] = useState(false);

  const urls = localUrls ?? { logoUrl, iconUrl };

  function handleUploaded(key: SlotKey, url: string | null) {
    // Actualización funcional: dos subidas seguidas no deben pisarse.
    setLocalUrls(prev => ({ ...(prev ?? { logoUrl, iconUrl }), [key]: url }));
    refreshBranding({ publish: true });
  }

  async function handleColorChange(key: 'primaryColor' | 'accentColor', hex: string | null) {
    setSavingColors(true);
    try {
      await saveBrandingConfig({ [key]: hex });
      await refreshBranding({ publish: true });
    } finally {
      setSavingColors(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marca</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sube los logos oficiales de Aviva para que se muestren en toda la plataforma (encabezados, login, certificados).
          Mientras no subas un archivo, se usa un logo de respaldo con los colores de marca.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-56 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {SLOTS.map(slot => (
            <UploadSlot
              key={slot.key}
              slotKey={slot.key}
              title={slot.title}
              description={slot.description}
              storageFolder={slot.storageFolder}
              maxSize={slot.maxSize}
              currentUrl={urls[slot.key]}
              accentColor={accentColor || DEFAULT_ACCENT}
              onUploaded={handleUploaded}
            />
          ))}
        </div>
      )}

      {/* Colores de marca */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-1.5">
            <Palette className="h-4 w-4" /> Colores de marca
          </CardTitle>
          <CardDescription className="text-xs">
            Se aplican de inmediato a botones, encabezados y acentos en toda la plataforma (vendedor y admin).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <ColorPicker
            label="Color primario"
            description="Botones, barra de progreso, acentos principales."
            value={primaryColor ?? ''}
            defaultValue={DEFAULT_PRIMARY}
            saving={savingColors}
            onChange={hex => handleColorChange('primaryColor', hex)}
            onReset={() => handleColorChange('primaryColor', null)}
          />
          <ColorPicker
            label="Color de acento"
            description="Encabezados, sidebar del admin, fondos destacados."
            value={accentColor ?? ''}
            defaultValue={DEFAULT_ACCENT}
            saving={savingColors}
            onChange={hex => handleColorChange('accentColor', hex)}
            onReset={() => handleColorChange('accentColor', null)}
          />
        </CardContent>
      </Card>

      {/* Vista previa en contexto real */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4" /> Vista previa en la plataforma
          </CardTitle>
          <CardDescription className="text-xs">Así se verá el logo en el encabezado de la app y en el panel de administración.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ backgroundColor: accentColor || DEFAULT_ACCENT }}>
            <AvivaLogo variant="full" className="h-8 w-auto" />
            <span className="text-white/60 text-xs">Header (vista vendedor)</span>
          </div>
          <div className="rounded-lg px-4 py-3 flex items-center gap-2" style={{ backgroundColor: accentColor || DEFAULT_ACCENT }}>
            <AvivaLogo variant="icon" className="h-8 w-8" />
            <span className="text-white text-sm font-bold">Admin Panel</span>
            <span className="text-white/60 text-xs ml-auto">Sidebar (vista admin)</span>
          </div>
        </CardContent>
      </Card>

      {!loading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className={cn('h-3.5 w-3.5', (urls.logoUrl || urls.iconUrl) ? 'text-emerald-600' : 'text-muted-foreground/50')} />
          {urls.logoUrl || urls.iconUrl ? 'Los cambios se guardan y aplican de inmediato en toda la plataforma.' : 'Aún no se ha subido ningún logo — se está usando el respaldo de marca.'}
        </p>
      )}
    </div>
  );
}
