"use client";

import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

export interface SheetProps {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Bottom sheet on phones, centred panel on larger screens. */
export function Sheet({ trigger, title, description, children }: SheetProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/40 fixed inset-0" />
        <Dialog.Content className="border-line bg-paper fixed inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto border-t p-6 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border">
          <Dialog.Title className="font-display text-2xl">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="text-muted mt-1">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="mt-6">{children}</div>
          <Dialog.Close className="label-caps text-muted mt-6 min-h-11 underline underline-offset-4">
            Close
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
