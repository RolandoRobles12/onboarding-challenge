'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { saveBrandingConfig } from '@/lib/firestore-service';
import { useBranding } from '@/context/BrandingContext';
import { AvivaLogo } from '@/components/AvivaLogo';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Trash2, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type SlotKey = 'logoUrl' | 'iconUrl';

const SLOTS: { key: SlotKey; title: string; description: string; storageFolder: string }[] = [
  {
    key: 'logoUrl',
    title: 'Logo completo (ícono + wordmark)',
    description: 'Se usa en pantallas grandes: login, encabezados de página, certificados. Preferible en SVG o PNG con fondo transparente.',
    storageFolder: 'full',
  },
  {
    key: 'iconUrl',
    title: 'Ícono / símbolo únicamente',
    description: 'Se usa en espacios reducidos, como el panel de administración. Preferible en SVG o PNG cuadrado con fondo transparente.',
    storageFolder: 'icon',
  },
];

function UploadSlot({ slotKey, title, description, storageFolder, currentUrl, onUploaded }: {
  slotKey: SlotKey;
  title: string;
  description: string;
  storageFolder: string;
  currentUrl: string | null;
  onUploaded: (key: SlotKey, url: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !storage) return;
    setError(null);
    setProgress(0);

    const timestamp = Date.now();
    const storagePath = `branding/${storageFolder}/${timestamp}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

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
        {/* Preview en fondo claro y oscuro, según reglas de contraste de la guía */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-white flex items-center justify-center h-20 p-3">
            {currentUrl
              ? <img src={currentUrl} alt={title} className="max-h-full max-w-full object-contain" />
              : <span className="text-xs text-muted-foreground">Sin logo — fondo claro</span>}
          </div>
          <div className="rounded-lg border flex items-center justify-center h-20 p-3" style={{ backgroundColor: '#074739' }}>
            {currentUrl
              ? <img src={currentUrl} alt={title} className="max-h-full max-w-full object-contain" />
              : <span className="text-xs text-white/70">Sin logo — fondo oscuro</span>}
          </div>
        </div>

        {busy && progress !== null && <Progress value={progress} className="h-1.5" />}
        {saving && progress === null && <p className="text-xs text-muted-foreground">Guardando…</p>}
        {error && <p className="text-xs text-destructive font-medium">{error}</p>}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/svg+xml,image/png,image/webp"
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
  const { logoUrl, iconUrl, loading, refreshBranding } = useBranding();
  const [localUrls, setLocalUrls] = useState<{ logoUrl: string | null; iconUrl: string | null } | null>(null);

  const urls = localUrls ?? { logoUrl, iconUrl };

  function handleUploaded(key: SlotKey, url: string | null) {
    setLocalUrls({ ...urls, [key]: url });
    refreshBranding();
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
              currentUrl={urls[slot.key]}
              onUploaded={handleUploaded}
            />
          ))}
        </div>
      )}

      {/* Vista previa en contexto real */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4" /> Vista previa en la plataforma
          </CardTitle>
          <CardDescription className="text-xs">Así se verá el logo en el encabezado de la app y en el panel de administración.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#074739' }}>
            <AvivaLogo variant="full" className="h-8 w-auto" />
            <span className="text-white/60 text-xs">Header (vista vendedor)</span>
          </div>
          <div className="rounded-lg px-4 py-3 flex items-center gap-2" style={{ backgroundColor: '#074739' }}>
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
