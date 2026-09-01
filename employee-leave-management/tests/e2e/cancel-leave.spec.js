// tests/e2e/cancel-leave.spec.js
//
// UI-level Playwright coverage for EPMCDMETST-109: browser-driven end-to-end
// tests for the "Cancel a pending leave request" story (EPMCDMETST-105).
//
// These tests drive a real Chromium browser against the running Express app
// (started by playwright.config.js webServer option, pointed at an
// isolated temporary SQLite database) and exercise the same acceptance
// criteria that tests/cancel.test.js already covers at the HTTP layer via
// supertest, but here through actual page navigation, form filling and the
// native confirm() dialog -- no supertest/direct HTTP calls are used.

const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { test, expect } = require('@playwright/test');

const EMPLOYEE = { employeeId: 'EMP001', password: 'password123' };
const OTHER_EMPLOYEE = { employeeId: 'EMP002', password: 'password123' };
const MANAGER = { employeeId: 'MGR001', password: 'password123' };

// The app (started by playwright's webServer) seeds EMP001/MGR001 itself,
// but there is no seeded second employee. Seed one directly in the same
// SQLite file the running server is using (its path is shared via
// process.env.E2E_DB_PATH by playwright.config.js) -- the same approach
// tests/cancel.test.js uses for its cross-employee authorization checks --
// so the cross-employee UI scenario below has someone other than EMP001 to
// log in as.
test.beforeAll(() => {
  const dbPath = process.env.E2E_DB_PATH;
  if (!dbPath) {
    throw new Error('E2E_DB_PATH was not set by playwright.config.js');
  }
  const db = new Database(dbPath);
  try {
    const existing = db
      .prepare('SELECT id FROM employees WHERE employeeId = ?')
      .get(OTHER_EMPLOYEE.employeeId);
    if (!existing) {
      const hashedPassword = bcrypt.hashSync(OTHER_EMPLOYEE.password, 10);
      db.prepare(
        "INSERT INTO employees (employeeId, name, password, role) VALUES (?, ?, ?, 'Employee')"
      ).run(OTHER_EMPLOYEE.employeeId, 'Alex Colleague', hashedPassword);
    }
  } finally {
    db.close();
  }
});

// --- Helpers ---------------------------------------------------------------

async function login(page, credentials) {
  await page.goto('/login');
  await page.fill('#employeeId', credentials.employeeId);
  await page.fill('#password', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
}

async function applyLeave(page, reason) {
  await page.goto('/apply-leave');
  await page.selectOption('#leaveType', 'Casual');
  await page.fill('#fromDate', '2026-09-01');
  await page.fill('#toDate', '2026-09-02');
  await page.fill('#reason', reason);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/leave-status');
}

// Locates the <tr> in the leave-status/manager-pending table whose Reason
// cell contains the given (unique, test-generated) reason text.
function rowForReason(page, reason) {
  return page.locator('tr', { has: page.getByText(reason, { exact: true }) });
}

function uniqueReason(label) {
  return 'PW ' + label + ' ' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

// --- Tests -------------------------------------------------------------------

test.describe('Cancel a pending leave request - UI (EPMCDMETST-105)', () => {
  test('AC1: a Pending leave request shows a Cancel action on /leave-status', async ({ page }) => {
    await login(page, EMPLOYEE);
    const reason = uniqueReason('AC1 pending shows cancel');
    await applyLeave(page, reason);

    const row = rowForReason(page, reason);
    await expect(row).toBeVisible();
    await expect(row.locator('.status-badge:not(.status-updated)')).toHaveText('Pending');

    const cancelForm = row.locator('form[action$="/cancel"]');
    await expect(cancelForm).toHaveCount(1);
    await expect(cancelForm.locator('button')).toHaveText('Cancel');
  });

  test('AC2: confirming Cancel marks the request Cancelled and removes the Cancel action, while staying visible', async ({ page }) => {
    await login(page, EMPLOYEE);
    const reason = uniqueReason('AC2 cancel happy path');
    await applyLeave(page, reason);

    const row = rowForReason(page, reason);
    await expect(row.locator('form[action$="/cancel"]')).toHaveCount(1);

    page.once('dialog', (dialog) => {
      expect(dialog.type()).toBe('confirm');
      dialog.accept();
    });
    await row.locator('form[action$="/cancel"] button').click();
    await page.waitForURL('**/leave-status');

    const updatedRow = rowForReason(page, reason);
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow.locator('.status-badge:not(.status-updated)')).toHaveText('Cancelled');
    await expect(updatedRow.locator('form[action$="/cancel"]')).toHaveCount(0);
  });

  test('AC2 (dismiss): dismissing the confirm dialog leaves the request Pending with the Cancel action intact', async ({ page }) => {
    await login(page, EMPLOYEE);
    const reason = uniqueReason('AC2 cancel dismissed');
    await applyLeave(page, reason);

    const row = rowForReason(page, reason);
    page.once('dialog', (dialog) => dialog.dismiss());
    await row.locator('form[action$="/cancel"] button').click();

    // No navigation should occur since the confirm() was dismissed; give the
    // (non-)navigation a brief moment to settle, then re-check in place.
    await page.waitForTimeout(300);
    const stillRow = rowForReason(page, reason);
    await expect(stillRow.locator('.status-badge:not(.status-updated)')).toHaveText('Pending');
    await expect(stillRow.locator('form[action$="/cancel"]')).toHaveCount(1);
  });

  test('AC3: an Approved leave request does not show a Cancel action', async ({ page, browser }) => {
    await login(page, EMPLOYEE);
    const reason = uniqueReason('AC3 approved no cancel');
    await applyLeave(page, reason);

    const managerContext = await browser.newContext();
    try {
      const managerPage = await managerContext.newPage();
      await login(managerPage, MANAGER);
      await managerPage.goto('/manager/leave-requests');

      const managerRow = rowForReason(managerPage, reason);
      await managerRow.locator('form[action$="/approve"] button').click();
      await managerPage.waitForURL('**/manager/leave-requests');
    } finally {
      await managerContext.close();
    }

    await page.goto('/leave-status');
    const row = rowForReason(page, reason);
    await expect(row.locator('.status-badge:not(.status-updated)')).toHaveText('Approved');
    await expect(row.locator('form[action$="/cancel"]')).toHaveCount(0);
  });

  test('AC3: a Rejected leave request does not show a Cancel action', async ({ page, browser }) => {
    await login(page, EMPLOYEE);
    const reason = uniqueReason('AC3 rejected no cancel');
    await applyLeave(page, reason);

    const managerContext = await browser.newContext();
    try {
      const managerPage = await managerContext.newPage();
      await login(managerPage, MANAGER);
      await managerPage.goto('/manager/leave-requests');

      const managerRow = rowForReason(managerPage, reason);
      await managerRow.locator('input[name="rejectionReason"]').fill('Not enough notice');
      await managerRow.locator('form.reject-form button').click();
      await managerPage.waitForURL('**/manager/leave-requests');
    } finally {
      await managerContext.close();
    }

    await page.goto('/leave-status');
    const row = rowForReason(page, reason);
    await expect(row.locator('.status-badge:not(.status-updated)')).toHaveText('Rejected');
    await expect(row.locator('form[action$="/cancel"]')).toHaveCount(0);
  });

  test('Cross-employee: EMP002 cannot see EMP001 pending leave request (or its Cancel action) on their own leave-status page', async ({ page, browser }) => {
    const ownerContext = await browser.newContext();
    const reason = uniqueReason('cross-employee visibility');
    try {
      const ownerPage = await ownerContext.newPage();
      await login(ownerPage, EMPLOYEE);
      await applyLeave(ownerPage, reason);
    } finally {
      await ownerContext.close();
    }

    // Log in as the *other* employee, in this test's own page/session, and
    // confirm EMP001's pending request (and therefore its Cancel action) is
    // simply absent from EMP002's own leave-status view.
    await login(page, OTHER_EMPLOYEE);
    await page.goto('/leave-status');
    await expect(page.getByText(reason, { exact: true })).toHaveCount(0);
  });
});
