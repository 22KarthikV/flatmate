"use client";

import { Toast } from "radix-ui";
import type { ReactNode } from "react";

export interface ToastMessageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider swipeDirection="down" duration={4000}>
      {children}
      <Toast.Viewport className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-4 sm:right-0 sm:left-auto sm:w-96" />
    </Toast.Provider>
  );
}

export function ToastMessage({ open, onOpenChange, title, description }: ToastMessageProps) {
  return (
    <Toast.Root
      open={open}
      onOpenChange={onOpenChange}
      className="border-ink bg-paper border p-4 transition-opacity duration-200 data-[state=closed]:opacity-0"
    >
      <Toast.Title className="label-caps">{title}</Toast.Title>
      {description ? (
        <Toast.Description className="text-muted mt-1 text-sm">{description}</Toast.Description>
      ) : null}
    </Toast.Root>
  );
}
