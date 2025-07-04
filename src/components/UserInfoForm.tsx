'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Rocket } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { avatarComponents, defaultAvatar } from '@/lib/avatars';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  fullName: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  employeeId: z.string().min(1, { message: 'El número de colaborador es requerido.' }),
  assignedKiosk: z.string().min(2, { message: 'El kiosco asignado es requerido.' }),
  trainingKiosk: z.string().optional(),
  avatar: z.string().default(defaultAvatar),
});

type UserInfoFormValues = z.infer<typeof formSchema>;

export function UserInfoForm({ quizType }: { quizType: string }) {
  const router = useRouter();
  const form = useForm<UserInfoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
      employeeId: '',
      assignedKiosk: '',
      trainingKiosk: '',
      avatar: defaultAvatar,
    },
  });

  function onSubmit(values: UserInfoFormValues) {
    const params = new URLSearchParams({
      quizType,
      fullName: values.fullName,
      employeeId: values.employeeId,
      assignedKiosk: values.assignedKiosk,
      avatar: values.avatar,
    });
    if (values.trainingKiosk) {
      params.set('trainingKiosk', values.trainingKiosk);
    }
    router.push(`/${quizType}/quiz?${params.toString()}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre completo</FormLabel>
              <FormControl>
                <Input placeholder="Ej. Ana García" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="employeeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de colaborador</FormLabel>
              <FormControl>
                <Input placeholder="Ej. 12345" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="assignedKiosk"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kiosco asignado</FormLabel>
              <FormControl>
                <Input placeholder="Ej. Plaza Central" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trainingKiosk"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kiosco de capacitación (Opcional)</FormLabel>
              <FormControl>
                <Input placeholder="Ej. Oficina Principal" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="avatar"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Elige tu explorador</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex justify-around pt-4"
                >
                  {Object.entries(avatarComponents).map(([key, Icon]) => (
                    <FormItem key={key}>
                      <FormControl>
                        <RadioGroupItem value={key} id={key} className="sr-only" />
                      </FormControl>
                      <FormLabel
                        htmlFor={key}
                        className={cn(
                          'cursor-pointer rounded-full p-3 border-2 transition-all hover:bg-accent/50',
                          field.value === key ? 'border-primary bg-primary/10 scale-110' : 'border-transparent'
                        )}
                      >
                        <Icon className="h-12 w-12 text-muted-foreground group-hover:text-foreground" />
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" size="lg">
          <Rocket className="mr-2" />
          Comenzar AvivaQuest
        </Button>
      </form>
    </Form>
  );
}
