'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Rocket } from 'lucide-react';

const formSchema = z.object({
  fullName: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  employeeId: z.string().min(1, { message: 'El número de colaborador es requerido.' }),
  assignedKiosk: z.string().min(2, { message: 'El kiosco asignado es requerido.' }),
  trainingKiosk: z.string().optional(),
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
    },
  });

  function onSubmit(values: UserInfoFormValues) {
    const params = new URLSearchParams({
      quizType,
      fullName: values.fullName,
      employeeId: values.employeeId,
      assignedKiosk: values.assignedKiosk,
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
        <Button type="submit" className="w-full" size="lg">
          <Rocket className="mr-2" />
          Comenzar AvivaQuest
        </Button>
      </form>
    </Form>
  );
}
