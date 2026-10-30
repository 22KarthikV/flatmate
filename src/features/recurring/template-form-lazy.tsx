"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

/**
 * The template form carries the validation library and the rent-splitting code, which is a lot
 * for a screen only admins open a few times a year. It loads after the page appears, so every
 * other screen's start-up size stays inside its budget.
 */
const TemplateForm = dynamic(() => import("./template-form").then((m) => m.TemplateForm), {
  ssr: false,
  loading: () => (
    <p role="status" className="text-muted text-sm">
      Loading the form
    </p>
  ),
});

export function TemplateFormLazy(props: ComponentProps<typeof TemplateForm>) {
  return <TemplateForm {...props} />;
}
