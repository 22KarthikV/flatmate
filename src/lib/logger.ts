export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogRecord = {
  level: LogLevel;
  time: string;
  message: string;
  [field: string]: unknown;
};

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

interface LoggerOptions {
  level: LogLevel;
  sink?: (record: LogRecord) => void;
  now?: () => Date;
  context?: Record<string, unknown>;
}

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|service[-_]?role|private/i;
const MAX_DEPTH = 6;

function sanitize(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[truncated]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : sanitize(inner, seen, depth + 1);
  }
  return out;
}

function consoleSink(record: LogRecord) {
  const line = JSON.stringify(record);
  if (record.level === "error") console.error(line);
  else if (record.level === "warn") console.warn(line);
  else console.log(line);
}

/** Structured JSON logger. Redacts secrets and serialises errors. Safe on server and client. */
export function createLogger({
  level,
  sink = consoleSink,
  now = () => new Date(),
  context = {},
}: LoggerOptions): Logger {
  const emit = (at: LogLevel, message: string, fields: Record<string, unknown> = {}) => {
    if (order[at] < order[level]) return;
    const data = sanitize({ ...context, ...fields }, new WeakSet(), 0) as Record<string, unknown>;
    sink({ level: at, time: now().toISOString(), message, ...data });
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (extra) => createLogger({ level, sink, now, context: { ...context, ...extra } }),
  };
}

function levelFromEnv(value: string | undefined): LogLevel {
  return value && value in order ? (value as LogLevel) : "info";
}

/** App-wide logger. LOG_LEVEL is read on the server; the browser logs at "info". */
export const logger = createLogger({ level: levelFromEnv(process.env.LOG_LEVEL) });
