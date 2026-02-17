'use client';

import { useState, useEffect } from 'react';
import { getCertificateConfig, saveCertificateConfig } from '@/lib/firestore-service';
import { DEFAULT_CERTIFICATE_CONFIG } from '@/lib/types-scalable';
import type { CertificateConfig } from '@/lib/types-scalable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Certificate } from '@/components/Certificate';
import { LayoutTemplate, Save, RotateCcw } from 'lucide-react';

type EditableConfig = Omit<CertificateConfig, 'organizationId' | 'updatedAt'>;

const PRESET_THEMES: Array<{ label: string; bgColorStart: string; bgColorEnd: string }> = [
  { label: 'Aviva Verde',   bgColorStart: '#0a6b3e', bgColorEnd: '#1aaa64' },
  { label: 'Azul Marino',   bgColorStart: '#0a2d6b', bgColorEnd: '#1a6aaa' },
  { label: 'Violeta',       bgColorStart: '#4a0a6b', bgColorEnd: '#8a1aaa' },
  { label: 'Rojo Corporativo', bgColorStart: '#6b0a0a', bgColorEnd: '#aa2a1a' },
  { label: 'Gris Elegante', bgColorStart: '#2a2a2a', bgColorEnd: '#4a4a4a' },
  { label: 'Dorado',        bgColorStart: '#6b4a0a', bgColorEnd: '#aa841a' },
];

export default function CertificateTemplatePage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<EditableConfig>({ ...DEFAULT_CERTIFICATE_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    getCertificateConfig().then(c => {
      const { organizationId: _o, updatedAt: _u, ...rest } = c;
      setConfig(rest);
      setLoading(false);
    });
  }, []);

  function set<K extends keyof EditableConfig>(key: K, value: EditableConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveCertificateConfig(config);
      toast({ title: 'Plantilla guardada', description: 'Los cambios se aplicarán en los próximos certificados.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setConfig({ ...DEFAULT_CERTIFICATE_CONFIG });
    toast({ title: 'Valores restaurados', description: 'Los valores por defecto han sido restaurados. Guarda para aplicarlos.' });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse bg-muted" />)}
      </div>
    );
  }

  // Mock data for preview
  const previewSigners = [
    { name: 'María González', position: 'Directora de Capacitación' },
    { name: 'Carlos López', position: 'Gerente Regional' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutTemplate className="h-6 w-6" /> Plantilla de Certificado
          </h1>
          <p className="text-muted-foreground">
            Personaliza los textos, colores y elementos visuales del certificado
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Restaurar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Editor ── */}
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
                  value={config.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="CERTIFICADO DE PARTICIPACIÓN"
                />
                <p className="text-xs text-muted-foreground">Se muestra en mayúsculas debajo del subtítulo</p>
              </div>
              <div className="space-y-1.5">
                <Label>Subtítulo</Label>
                <Input
                  value={config.subtitle}
                  onChange={e => set('subtitle', e.target.value)}
                  placeholder="Desafío Aviva"
                />
                <p className="text-xs text-muted-foreground">Texto pequeño sobre el título (ej. nombre del programa)</p>
              </div>
              <div className="space-y-1.5">
                <Label>Prefijo del cuerpo</Label>
                <Input
                  value={config.bodyPrefix}
                  onChange={e => set('bodyPrefix', e.target.value)}
                  placeholder="Este certificado se otorga a"
                />
                <p className="text-xs text-muted-foreground">Texto que aparece justo antes del nombre del participante</p>
              </div>
              <div className="space-y-1.5">
                <Label>Sufijo del cuerpo</Label>
                <Input
                  value={config.bodySuffix}
                  onChange={e => set('bodySuffix', e.target.value)}
                  placeholder="Por haber completado exitosamente el módulo de"
                />
                <p className="text-xs text-muted-foreground">
                  Texto después del nombre. El nombre del módulo y la puntuación se agregan automáticamente.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Visual */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Elementos visuales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Mostrar logo Aviva</p>
                    <p className="text-xs text-muted-foreground">Logo en la esquina superior izquierda</p>
                  </div>
                  <Switch checked={config.showLogo} onCheckedChange={v => set('showLogo', v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Mostrar mascota jaguar</p>
                    <p className="text-xs text-muted-foreground">Jaguar decorativo en la zona derecha</p>
                  </div>
                  <Switch checked={config.showMascot} onCheckedChange={v => set('showMascot', v)} />
                </div>
              </div>

              {/* Color theme presets */}
              <div className="space-y-2">
                <Label>Tema de color</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_THEMES.map(theme => (
                    <button
                      key={theme.label}
                      onClick={() => {
                        set('bgColorStart', theme.bgColorStart);
                        set('bgColorEnd', theme.bgColorEnd);
                      }}
                      className="relative rounded-lg overflow-hidden h-12 border-2 transition-all hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, ${theme.bgColorStart}, ${theme.bgColorEnd})`,
                        borderColor:
                          config.bgColorStart === theme.bgColorStart
                            ? 'white'
                            : 'transparent',
                        boxShadow:
                          config.bgColorStart === theme.bgColorStart
                            ? '0 0 0 2px #000, 0 0 0 4px white'
                            : 'none',
                      }}
                      title={theme.label}
                    >
                      <span className="text-white text-[10px] font-medium drop-shadow">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom colors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Color inicial (personalizado)</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={config.bgColorStart}
                      onChange={e => set('bgColorStart', e.target.value)}
                      className="h-9 w-12 rounded border cursor-pointer"
                    />
                    <Input
                      value={config.bgColorStart}
                      onChange={e => set('bgColorStart', e.target.value)}
                      className="font-mono text-sm"
                      maxLength={7}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Color final (personalizado)</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={config.bgColorEnd}
                      onChange={e => set('bgColorEnd', e.target.value)}
                      className="h-9 w-12 rounded border cursor-pointer"
                    />
                    <Input
                      value={config.bgColorEnd}
                      onChange={e => set('bgColorEnd', e.target.value)}
                      className="font-mono text-sm"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Live Preview ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Vista previa en tiempo real</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(p => !p)}>
              {showPreview ? 'Ocultar' : 'Mostrar'}
            </Button>
          </div>

          {showPreview && (
            <div className="rounded-xl overflow-hidden border shadow-sm">
              <Certificate
                fullName="Juan Pérez García"
                quizTitle="Jaguar Aviva Crédito"
                score={18}
                totalQuestions={20}
                date={new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                signers={previewSigners}
                config={config}
              />
            </div>
          )}

          {!showPreview && (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                Vista previa oculta. Haz clic en "Mostrar" para verla.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
