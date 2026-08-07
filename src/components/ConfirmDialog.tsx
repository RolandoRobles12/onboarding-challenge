'use client';

import { useCallback, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Texto del botón que confirma. Default: "Eliminar". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Si es true (default) el botón se pinta como acción destructiva. */
  destructive?: boolean;
}

/**
 * Diálogo de confirmación compartido del panel de admin.
 *
 * Existían tres formas distintas de confirmar un borrado: este AlertDialog,
 * el `confirm()` nativo del navegador (que se ve ajeno a la app y en móvil es
 * fácil de descartar por accidente) y estados inline hechos a mano. Este hook
 * unifica las tres en una sola experiencia.
 *
 * Uso:
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   if (!await confirm({ title: '¿Eliminar el producto "X"?' })) return;
 *   ...
 *   return <>{dialog}...</>;
 */
export function useConfirm() {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => setState({ options, resolve }));
  }, []);

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const opts = state?.options;
  const dialog = (
    <AlertDialog open={!!state} onOpenChange={open => { if (!open) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description && (
            <AlertDialogDescription>{opts.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {opts?.cancelLabel ?? 'Cancelar'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={opts?.destructive === false
              ? undefined
              : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
          >
            {opts?.confirmLabel ?? 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
