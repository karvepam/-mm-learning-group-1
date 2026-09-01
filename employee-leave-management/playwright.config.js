// playwright.config.js
//
// Configuration for the UI-level Playwright suite under tests/e2e/, added
// for EPMCDMETST-109 to cover the "Cancel a pending leave request" story
// (EPMCDMETST-105) end-to-end through a real browser, complementing the
// existing supertest/Jest integration tests in tests/cancel.test.js.
//
// The webServer option boots the real Express app (node server.js) against
// an isolated, temporary SQLite database (via DB_PATH) on a dedicated port,
// so this suite never touches database/database.db.
//
// NOTE: Playwright loads this config file more than once per run (once in
// the main CLI process that manages webServer, and again in each worker
// process that actually executes the spec files), so anything computed at
// module-load time that is supposed to be *shared* between the running
// server and the spec files (like the temp DB path) must be memoised via
// process.env rather than recomputed on every load -- otherwise each load
// would pick a different Date.now()-based path and the worker process would
// end up seeding/reading a different, empty SQLite file than the one the
// actual running server is using.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 4173;

if (!process.env.E2E_DB_PATH) {
  const dbPath = path.join(
    os.tmpdir(),
    'leave-management-e2e-' + process.pid + '-' + Date.now() + '.db'
  );

  // Best-effort cleanup of any stale db from a previous run at this exact
  // path (extremely unlikely given the pid+timestamp, but cheap to guard).
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch (err) {
      // ignore if it doesn't exist
    }
  }

  // Stash it on process.env so subsequent loads of this same config module
  // (in this process or any child process spawned from here, e.g. worker
  // processes and the webServer child) see the exact same path.
  process.env.E2E_DB_PATH = dbPath;
}

const dbPath = process.env.E2E_DB_PATH;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:' + PORT,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:' + PORT + '/login',
    reuseExistingServer: false,
    timeout: 30 * 1000,
    env: Object.assign({}, process.env, {
      DB_PATH: dbPath,
      PORT: String(PORT),
    }),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
