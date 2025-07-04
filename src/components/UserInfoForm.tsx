'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Rocket } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { avatarData, defaultAvatar } from '@/lib/avatars';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  fullName: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  employeeId: z.string().min(1, { message: 'El número de colaborador es requerido.' }),
  assignedKiosk: z.string().min(2, { message: 'El kiosco asignado es requerido.' }),
  trainingKiosk: z.string().min(2, { message: 'El kiosco de capacitación es requerido.' }),
  trainerName: z.string().min(3, { message: 'El nombre del capacitador es requerido.' }),
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
      trainerName: '',
      avatar: defaultAvatar,
    },
  });

  function onSubmit(values: UserInfoFormValues) {
    const params = new URLSearchParams({
      quizType,
      fullName: values.fullName,
      employeeId: values.employeeId,
      assignedKiosk: values.assignedKiosk,
      trainingKiosk: values.trainingKiosk,
      trainerName: values.trainerName,
      avatar: values.avatar,
    });
    router.push(`/${quizType}/quiz?${params.toString()}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre completo</FormLabel>
                <FormControl>
                  <Input placeholder="Ej. Fil Castro" {...field} />
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
                  <Input placeholder="Ej. 48_02" {...field} />
                </FormControl>
                <FormDescription>
                  Lo puedes encontrar en Worky → Mi perfil → No. de colaborador.
                </FormDescription>
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
                  <Input placeholder="Ej. Ixtapaluca" {...field} />
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
                <FormLabel>Kiosco de capacitación</FormLabel>
                <FormControl>
                  <Input placeholder="Ej. Chalco" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="trainerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del capacitador</FormLabel>
                <FormControl>
                  <Input placeholder="Ej. Amran Frey" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="avatar"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-lg font-semibold">Elige tu explorador</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4"
                >
                  {Object.entries(avatarData).map(([key, { name, Icon }]) => (
                    <FormItem key={key}>
                      <FormControl>
                        <RadioGroupItem value={key} id={key} className="sr-only" />
                      </FormControl>
                      <FormLabel
                        htmlFor={key}
                        className={cn(
                          'cursor-pointer rounded-lg p-3 border-2 transition-all w-full flex flex-col items-center justify-center gap-3 aspect-square',
                          'hover:bg-card hover:border-primary',
                          field.value === key ? 'border-primary bg-primary/10 ring-2 ring-primary ring-offset-background' : 'border-border bg-card'
                        )}
                      >
                        <div className={cn(
                            "rounded-full p-3 transition-colors",
                            field.value === key ? 'bg-primary/20' : 'bg-muted'
                        )}>
                            <Icon className={cn("h-10 w-10 transition-colors", field.value === key ? 'text-primary' : 'text-muted-foreground')} />
                        </div>
                        <span className="font-semibold text-center text-sm">{name}</span>
                      </FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full rounded-lg" size="lg">
          <Rocket className="mr-2" />
          Comenzar Desafío
        </Button>
      </form>
    </Form>
  );
}
