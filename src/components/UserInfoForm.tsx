'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Rocket } from 'lucide-react';
import { avatarData, defaultAvatar } from '@/lib/avatars';
import { cn } from '@/lib/utils';
import { getOnboardingFields } from '@/lib/firestore-service';
import type { OnboardingField } from '@/lib/types-scalable';

export function UserInfoForm({ quizType }: { quizType: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<OnboardingField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [avatar, setAvatar] = useState(defaultAvatar);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getOnboardingFields()
      .then((loaded) => {
        setFields(loaded);
        const initial: Record<string, string> = {};
        loaded.forEach((f) => { initial[f.fieldKey] = ''; });
        setValues(initial);
      })
      .catch(console.error)
      .finally(() => setLoadingFields(false));
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.required && !values[field.fieldKey]?.trim()) {
        newErrors[field.fieldKey] = `${field.label} es requerido.`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const params = new URLSearchParams({ quizType, avatar });
    fields.forEach((field) => {
      if (values[field.fieldKey]) {
        params.set(field.fieldKey, values[field.fieldKey]);
      }
    });
    router.push(`/${quizType}/quiz?${params.toString()}`);
  };

  const setValue = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  if (loadingFields) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {fields.length > 0 && (
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
          {fields.map((field) => (
            <div
              key={field.id}
              className={field.fieldType === 'textarea' ? 'md:col-span-2' : ''}
            >
              <Label className="text-accent mb-1.5 block">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>

              {(field.fieldType === 'text' || field.fieldType === 'number' || field.fieldType === 'date') && (
                <Input
                  type={field.fieldType}
                  placeholder={field.placeholder}
                  value={values[field.fieldKey] || ''}
                  onChange={(e) => setValue(field.fieldKey, e.target.value)}
                  className="bg-muted"
                />
              )}

              {field.fieldType === 'textarea' && (
                <Textarea
                  placeholder={field.placeholder}
                  value={values[field.fieldKey] || ''}
                  onChange={(e) => setValue(field.fieldKey, e.target.value)}
                  className="bg-muted"
                />
              )}

              {field.fieldType === 'select' && (
                <Select
                  value={values[field.fieldKey] || ''}
                  onValueChange={(val) => setValue(field.fieldKey, val)}
                >
                  <SelectTrigger className="bg-muted">
                    <SelectValue placeholder={field.placeholder || `Selecciona ${field.label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options || []).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {errors[field.fieldKey] && (
                <p className="text-sm text-destructive mt-1">{errors[field.fieldKey]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Avatar selector */}
      <div>
        <Label className="text-accent font-medium block mb-2">Elige tu explorador</Label>
        <RadioGroup
          value={avatar}
          onValueChange={setAvatar}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {Object.entries(avatarData).map(([key, { name, Icon }]) => (
            <div key={key}>
              <RadioGroupItem value={key} id={`avatar-${key}`} className="sr-only" />
              <Label
                htmlFor={`avatar-${key}`}
                className={cn(
                  'cursor-pointer rounded-lg p-4 border transition-colors w-full flex flex-col items-center justify-center gap-3 aspect-square h-full',
                  'hover:border-primary',
                  avatar === key ? 'border-primary bg-card border-2' : 'border-border bg-card'
                )}
              >
                <div className={cn(
                  'rounded-full p-3 transition-colors',
                  avatar === key ? 'bg-primary/10' : 'bg-muted'
                )}>
                  <Icon className={cn(
                    'h-8 w-8 transition-colors',
                    avatar === key ? 'text-primary' : 'text-muted-foreground'
                  )} />
                </div>
                <span className="font-semibold text-center text-sm text-accent">{name}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <Button type="submit" className="w-full rounded-lg" size="lg">
        <Rocket className="mr-2" />
        Comenzar Desafío
      </Button>
    </form>
  );
}
