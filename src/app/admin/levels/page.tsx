'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { getLevelsConfig, saveLevelsConfig, type LevelConfig } from '@/lib/firestore-service';
import { Plus, Trash2, Save, GripVertical, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LevelsConfigPage() {
  const [levels, setLevels] = useState<LevelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getLevelsConfig().then(data => {
      setLevels(data.sort((a, b) => a.minXP - b.minXP));
    }).finally(() => setLoading(false));
  }, []);

  function handleChange(index: number, field: keyof LevelConfig, value: string | number) {
    setLevels(prev => prev.map((l, i) => i === index ? { ...l, [field]: field === 'minXP' || field === 'level' ? Number(value) : value } : l));
    setSaved(false);
    setError('');
  }

  function handleAdd() {
    const maxLevel = levels.reduce((m, l) => Math.max(m, l.level), 0);
    const maxXP = levels.reduce((m, l) => Math.max(m, l.minXP), 0);
    setLevels(prev => [...prev, { level: maxLevel + 1, title: 'Nuevo Nivel', emoji: '⭐', minXP: maxXP + 500 }]);
    setSaved(false);
  }

  function handleRemove(index: number) {
    if (levels.length <= 1) return;
    setLevels(prev => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function validate(): string {
    if (levels.length === 0) return 'Debes tener al menos un nivel.';
    const xpValues = levels.map(l => l.minXP);
    const hasDuplicate = xpValues.some((v, i) => xpValues.indexOf(v) !== i);
    if (hasDuplicate) return 'No puede haber dos niveles con el mismo XP mínimo.';
    for (const l of levels) {
      if (!l.title.trim()) return 'Todos los niveles deben tener un título.';
      if (!l.emoji.trim()) return 'Todos los niveles deben tener un emoji.';
      if (l.minXP < 0) return 'El XP mínimo no puede ser negativo.';
    }
    const firstLevel = [...levels].sort((a, b) => a.minXP - b.minXP)[0];
    if (firstLevel.minXP !== 0) return 'El primer nivel (XP más bajo) debe empezar en 0 XP.';
    return '';
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const sorted = [...levels].sort((a, b) => a.minXP - b.minXP).map((l, i) => ({ ...l, level: i + 1 }));
      await saveLevelsConfig(sorted);
      setLevels(sorted);
      setSaved(true);
    } catch {
      setError('Error al guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...levels].sort((a, b) => a.minXP - b.minXP);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Niveles XP</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configura los niveles de experiencia. Los vendedores subirán de nivel a medida que acumulen XP completando evaluaciones y obteniendo insignias.
        </p>
      </div>

      {/* XP Formula info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-3 px-4">
          <p className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Fórmula de XP
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            XP = mejor puntaje por evaluación + (insignias × 75) + (pasos completados × 25)
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((level, index) => (
            <Card key={index} className="rounded-xl border shadow-sm">
              <CardContent className="py-4 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 pt-1 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-xs font-bold text-primary">Nv.{index + 1}</span>
                  </div>

                  <div className="flex-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {/* Emoji */}
                    <div className="col-span-1">
                      <Label className="text-xs">Emoji</Label>
                      <Input
                        value={level.emoji}
                        onChange={e => handleChange(levels.indexOf(level), 'emoji', e.target.value)}
                        className="mt-1 text-center text-lg h-9"
                        maxLength={4}
                      />
                    </div>

                    {/* Title */}
                    <div className="col-span-2 sm:col-span-2">
                      <Label className="text-xs">Nombre del nivel</Label>
                      <Input
                        value={level.title}
                        onChange={e => handleChange(levels.indexOf(level), 'title', e.target.value)}
                        className="mt-1 h-9"
                        placeholder="Ej. Explorador"
                      />
                    </div>

                    {/* Min XP */}
                    <div className="col-span-1">
                      <Label className="text-xs">XP mínimo</Label>
                      <Input
                        type="number"
                        min={0}
                        value={level.minXP}
                        onChange={e => handleChange(levels.indexOf(level), 'minXP', e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('mt-1 h-8 w-8 text-muted-foreground hover:text-destructive', levels.length <= 1 && 'opacity-30 pointer-events-none')}
                    onClick={() => handleRemove(levels.indexOf(level))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" className="w-full gap-2" onClick={handleAdd}>
            <Plus className="h-4 w-4" /> Agregar nivel
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive font-medium">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {saved && <span className="text-sm text-emerald-600 font-medium">✓ Guardado</span>}
      </div>

      {/* Preview */}
      {levels.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Vista previa</CardTitle>
            <CardDescription className="text-xs">Así verán los vendedores los niveles en su perfil</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {sorted.map((l, i) => {
              const next = sorted[i + 1];
              return (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-2xl w-8 text-center">{l.emoji}</span>
                  <div className="flex-1">
                    <p className="font-semibold leading-tight">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.minXP} XP{next ? ` – ${next.minXP - 1} XP` : '+'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">Nv.{i + 1}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
