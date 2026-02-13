'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getOnboardingFields, saveSellerOnboardingData } from '@/lib/firestore-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AvivaLogo } from '@/components/AvivaLogo';
import { toast } from '@/hooks/use-toast';
import { ClipboardList, ChevronRight } from 'lucide-react';
import type { OnboardingField } from '@/lib/types-scalable';

interface Props {
  children: React.ReactNode;
}

export default function SellerOnboardingGate({ children }: Props) {
  const { user, profile, refreshProfile } = useAuth();
  const [fields, setFields] = useState<OnboardingField[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    // Only show for sellers who haven't completed onboarding
    if (!profile) return;
    if (profile.rol !== 'seller') {
      setShowForm(false);
      setLoading(false);
      return;
    }
    if (profile.onboardingCompleted) {
      setShowForm(false);
      setLoading(false);
      return;
    }

    // Load dynamic fields
    async function loadFields() {
      try {
        const activeFields = await getOnboardingFields();
        if (activeFields.length === 0) {
          // No fields defined — skip onboarding
          setShowForm(false);
        } else {
          setFields(activeFields);
          // Pre-fill with existing data if any
          const initial: Record<string, string> = {};
          activeFields.forEach(f => {
            initial[f.fieldKey] = profile?.onboardingData?.[f.fieldKey] || '';
          });
          setFormData(initial);
          setShowForm(true);
        }
      } catch (error) {
        console.error('Error loading onboarding fields:', error);
        setShowForm(false);
      } finally {
        setLoading(false);
      }
    }
    loadFields();
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate required fields
    const missing = fields.filter(f => f.required && !formData[f.fieldKey]?.trim());
    if (missing.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Campos requeridos',
        description: `Por favor completa: ${missing.map(f => f.label).join(', ')}`,
      });
      return;
    }

    setSubmitting(true);
    try {
      await saveSellerOnboardingData(user.uid, formData);
      await refreshProfile();
      setShowForm(false);
      toast({ title: '¡Bienvenido!', description: 'Tu información fue registrada correctamente.' });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar tu información. Intenta de nuevo.' });
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: OnboardingField) => {
    const value = formData[field.fieldKey] || '';
    const onChange = (val: string) => setFormData({ ...formData, [field.fieldKey]: val });

    switch (field.fieldType) {
      case 'text':
        return (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || `Ingresa ${field.label.toLowerCase()}`}
            required={field.required}
          />
        );
      case 'textarea':
        return (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || `Ingresa ${field.label.toLowerCase()}`}
            required={field.required}
            rows={3}
          />
        );
      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
          />
        );
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || '0'}
            required={field.required}
          />
        );
      case 'select':
        return (
          <Select value={value} onValueChange={onChange} required={field.required}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || 'Selecciona una opción...'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(opt => (
                <SelectItem key={opt.id} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  if (loading) return <>{children}</>;
  if (!showForm) return <>{children}</>;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-accent text-accent-foreground py-4 px-4">
        <div className="max-w-lg mx-auto flex justify-center">
          <AvivaLogo className="h-12 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-4 pt-8">
        <div className="w-full max-w-lg">
          <Card className="shadow-lg border-primary/20">
            <CardHeader className="text-center pb-2">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <ClipboardList className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl font-headline text-accent">
                ¡Bienvenido, {profile?.nombre?.split(' ')[0] || 'vendedor'}!
              </CardTitle>
              <CardDescription className="text-base mt-1">
                Antes de comenzar, necesitamos algunos datos sobre ti.
                <br />
                Solo se pedirán una vez.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                {fields.map(field => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.fieldKey}>
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {renderField(field)}
                  </div>
                ))}

                <Button
                  type="submit"
                  className="w-full mt-6"
                  size="lg"
                  disabled={submitting}
                >
                  {submitting ? 'Guardando...' : 'Continuar'}
                  {!submitting && <ChevronRight className="ml-2 h-4 w-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
