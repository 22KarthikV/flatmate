/**
 * Registers the service worker in production only (it would fight hot reload in dev).
 * Returns null when skipped or unsupported.
 */
export async function registerServiceWorker(
  nav: { serviceWorker?: ServiceWorkerContainer } | undefined,
  isProduction: boolean,
): Promise<ServiceWorkerRegistration | null> {
  if (!isProduction || !nav?.serviceWorker) return null;

  try {
    return await nav.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}
