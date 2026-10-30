import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * E2E runs against a production build (`next build` + `next start`), because the service
 * worker only registers in production and that is what users get.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/offline`, // not /api/health, which also needs the database
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    // A throwaway PUBLIC key so the push card offers "Turn on push". Its private half was never
    // kept, and the tests fake the browser's push service, so nothing is ever sent with it.
    env: {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY:
        "BJs0g8LtHW4iA3cxm-4DQRIIXkdcbBZ7uVo5T828zfxaZupX_zYVTBG4oDFjeRFvt844biMwFcEEoFv2DD30wts",
    },
  },
});
