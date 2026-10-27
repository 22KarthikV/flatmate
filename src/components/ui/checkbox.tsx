"use client";

import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useId, type ComponentProps } from "react";

import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<
  ComponentProps<typeof CheckboxPrimitive.Root>,
  "children"
> {
  label: string;
}

export function Checkbox({ label, id, className, ...props }: CheckboxProps) {
  const generated = useId();
  const checkboxId = id ?? generated;

  return (
    <div className="flex min-h-11 items-center gap-3">
      <CheckboxPrimitive.Root
        id={checkboxId}
        className={cn(
          "border-ink data-[state=checked]:bg-ink flex size-6 shrink-0 items-center justify-center border bg-transparent transition-colors duration-150",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <svg viewBox="0 0 16 16" className="text-paper size-4" fill="none" aria-hidden="true">
            <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={checkboxId} className="cursor-pointer text-base leading-6 select-none">
        {label}
      </label>
    </div>
  );
}
