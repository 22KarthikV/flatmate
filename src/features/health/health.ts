import { logger } from "@/lib/logger";

export type CheckStatus = { status: "ok" } | { status: "down" };

export interface HealthResult {
  status: "ok" | "unhealthy";
  httpStatus: 200 | 503;
  checks: Record<string, CheckStatus>;
}

type Check = () => Promise<void>;

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Runs named checks in parallel. A failing or hanging check marks the service unhealthy (503).
 * Error details go to the log, never into the public response.
 */
export async function runHealthChecks(
  checks: Record<string, Check>,
  { timeoutMs = 3000 }: { timeoutMs?: number } = {},
): Promise<HealthResult> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]): Promise<[string, CheckStatus]> => {
      try {
        await withTimeout(check(), timeoutMs);
        return [name, { status: "ok" }];
      } catch (error) {
        logger.error("health.check_failed", { check: name, error });
        return [name, { status: "down" }];
      }
    }),
  );

  const results = Object.fromEntries(entries);
  const healthy = entries.every(([, result]) => result.status === "ok");
  return {
    status: healthy ? "ok" : "unhealthy",
    httpStatus: healthy ? 200 : 503,
    checks: results,
  };
}
