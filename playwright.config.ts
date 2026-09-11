import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real production build in real browser engines.
// The API is mocked inside each test (see tests/e2e), so the suite never
// touches arXiv and cannot be rate limited.
//
// Locally: `npm run build` once, then `npm run test:e2e`. The config starts
// `npm run start` for you unless a server is already listening on the port.
// Set PORT (for example PORT=3001) when a dev server already occupies 3000.
const port = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Once the service worker controls the page, requests flow through it and
    // Playwright cannot mock them (WebKit in particular would then call the
    // real arXiv). Blocking it keeps the fake API in charge; the worker itself
    // is checked by hand in a production build, see docs/WORKLOG.md.
    serviceWorkers: "block",
  },
  webServer: {
    command: `npm run start -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  // Three engines cover Chrome and Edge, Firefox, and Safari. The mobile
  // project checks the touch layout the app is really made for.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
});
