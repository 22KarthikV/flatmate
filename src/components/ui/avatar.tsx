"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";

import { cn } from "@/lib/cn";

const tones = ["bg-mate-1", "bg-mate-2", "bg-mate-3", "bg-mate-4", "bg-mate-5"] as const;

export interface AvatarProps {
  name: string;
  /** 1 to 5, one per flatmate. */
  tone: 1 | 2 | 3 | 4 | 5;
  src?: string;
  className?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, tone, src, className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      title={name}
      className={cn("inline-flex size-10 shrink-0 overflow-hidden rounded-full", className)}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback
        className={cn(
          "label-caps flex size-full items-center justify-center text-white",
          tones[tone - 1],
        )}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
