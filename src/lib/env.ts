import { z } from "zod";

/** Treats empty strings (common in .env files) as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const schema = z.object({
  NODE_ENV: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["development", "test", "production"]).default("development"),
  ),
  LOG_LEVEL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["debug", "info", "warn", "error"]).default("info"),
  ),
  // Optional until the Supabase wiring task makes them required.
  NEXT_PUBLIC_SUPABASE_URL: optional(z.url()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional(z.string().min(1)),
  // The PUBLIC half of the VAPID pair (not secret). Without it push is simply not offered.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional(z.string().regex(/^[A-Za-z0-9_-]{80,100}$/)),
});

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

/**
 * Validates environment variables. Pure: pass any source, so it is trivially testable.
 * Error messages name the variable and the problem, never the value (it may be a secret).
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  throw new EnvError(
    `Invalid environment variables:\n${problems}\nSee .env.example for the expected variables.`,
  );
}

let cached: Env | undefined;

/** Validated environment for server code. Parsed once, on first use. */
export function getEnv(): Env {
  cached ??= parseEnv({
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
  return cached;
}
