// tests/cancel.test.js
//
// Integration tests for EPMCDMETST-109: automated coverage for the "Cancel
// a pending leave request" story (EPMCDMETST-105) and its subtasks
// EPMCDMETST-106 (frontend), EPMCDMETST-107 (backend) and EPMCDMETST-108
// (database), all of which were already implemented in commit 2184433 on
// this branch. This file adds the missing automated test coverage.
//
// These tests drive the real Express app over HTTP (via supertest), using
// session cookies for the seeded EMP001 (Employee) and MGR001 (Manager)
// accounts plus a second, test-local employee (EMP002) seeded here for the
// authorization checks, and a real (but isolated/temporary) SQLite database
// created by the app's own schema/seed logic in database/db.js. No
// app/route/model code is mocked out.

const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const request = require('supertest');

// Point the app at a fresh, temporary SQLite file for this test run instead
// of the real database/database.db (must be set before database/db.js is
// first required, which happens as soon as ../server is required below).
const testDbPath = path.join(
  os.tmpdir(),
  "leave-management-cancel-test-" + process.pid + "-" + Date.now() + ".db"
);
process.env.DB_PATH = testDbPath;

const app = require('../server');
const db = require('../database/db');
const leaveModel = require('../models/leaveModel');

const EMPLOYEE_CREDENTIALS = { employeeId: 'EMP001', password: 'password123' };
const OTHER_EMPLOYEE_CREDENTIALS = { employeeId: 'EMP002', password: 'password123' };
const MANAGER_CREDENTIALS = { employeeId: 'MGR001', password: 'password123' };

// Seed a second employee (not created by database/db.js) so the
// authorization tests have someone other than EMP001 to log in as.
beforeAll(() => {
  const existing = db.prepare('SELECT id FROM employees WHERE employeeId = ?').get('EMP002');
  if (!existing) {
    const hashedPassword = bcrypt.hashSync('password123', 10);
    db.prepare(
      "INSERT INTO employees (employeeId, name, password, role) VALUES (?, ?, ?, 'Employee')"
    ).run('EMP002', 'Alex Colleague', hashedPassword);
  }
});

// Logs a fresh supertest agent (which persists cookies across requests) in
// as the given user and returns it.
async function loginAs(credentials) {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send(credentials).expect(302);
  return agent;
}

// Submits a leave application as the currently logged-in agent/employee and
// returns the id of the newly created (Pending) leave request.
async function applyLeave(agent, employeeId, overrides = {}) {
  const payload = Object.assign(
    {
      employeeId,
      leaveType: 'Casual',
      fromDate: '2026-09-01',
      toDate: '2026-09-02',
      reason: 'Family event',
    },
    overrides
  );
  await agent.post('/apply-leave').type('form').send(payload).expect(302);

  const leaves = leaveModel.getLeavesByEmployeeId(employeeId);
  return leaves[0].id; // most recent, per ORDER BY id DESC
}

afterAll(() => {
  // Close the SQLite connection first: on Windows an open file handle
  // cannot be unlinked, which would otherwise leave temp DB files behind.
  db.close();

  // Best-effort cleanup of the temporary test database files.
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try {
      fs.unlinkSync(testDbPath + suffix);
    } catch (err) {
      // ignore if it never existed
    }
  }
});

describe('Cancel a pending leave request (EPMCDMETST-105/106/107/108/109)', () => {
  // --- AC1: Pending requests show a Cancel action -------------------------
  describe('GET /leave-status (Cancel action visibility)', () => {
    it('shows a Cancel form for a Pending leave request', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Pending cancel visibility check',
      });

      const res = await employeeAgent.get('/leave-status').expect(200);

      expect(res.text).toContain('Pending cancel visibility check');
      expect(res.text).toContain('/leave-requests/' + leaveId + '/cancel');
    });

    // --- AC3: Approved/Rejected requests do NOT show a Cancel action ------
    it('does not show a Cancel form for an Approved leave request', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Approved no-cancel check',
      });

      const managerAgent = await loginAs(MANAGER_CREDENTIALS);
      await managerAgent.post('/leave-requests/' + leaveId + '/approve').type('form').send({}).expect(302);

      const res = await employeeAgent.get('/leave-status').expect(200);

      expect(res.text).not.toContain('action="/leave-requests/' + leaveId + '/cancel"');
    });

    it('does not show a Cancel form for a Rejected leave request', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Rejected no-cancel check',
      });

      const managerAgent = await loginAs(MANAGER_CREDENTIALS);
      await managerAgent
        .post('/leave-requests/' + leaveId + '/reject')
        .type('form')
        .send({ rejectionReason: 'Not enough notice' })
        .expect(302);

      const res = await employeeAgent.get('/leave-status').expect(200);
      expect(res.text).not.toContain('action="/leave-requests/' + leaveId + '/cancel"');
    });
  });

  // --- AC2: Cancel a Pending request ---------------------------------------
  describe('POST /leave-requests/:id/cancel (happy path)', () => {
    it('sets status to Cancelled and keeps the request visible in the list', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Cancel happy path check',
      });

      await employeeAgent
        .post('/leave-requests/' + leaveId + '/cancel')
        .type('form')
        .send({})
        .expect(302)
        .expect('Location', '/leave-status');

      const updated = leaveModel.getLeaveById(leaveId);
      expect(updated.status).toBe('Cancelled');
      expect(updated.cancelledAt).toBeTruthy();

      // Still present (not deleted) when re-fetched / re-rendered.
      const statusPage = await employeeAgent.get('/leave-status').expect(200);
      expect(statusPage.text).toContain('Cancel happy path check');
      expect(statusPage.text).toContain('Cancelled');
      // And no longer offers a cancel action of its own.
      expect(statusPage.text).not.toContain('action="/leave-requests/' + leaveId + '/cancel"');
    });
  });

  // --- Edge cases -----------------------------------------------------------
  describe('Edge cases', () => {
    it('refuses to cancel an already-Approved request and leaves it unchanged', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Cancel-after-approve refusal check',
      });

      const managerAgent = await loginAs(MANAGER_CREDENTIALS);
      await managerAgent.post('/leave-requests/' + leaveId + '/approve').type('form').send({}).expect(302);

      await employeeAgent
        .post('/leave-requests/' + leaveId + '/cancel')
        .type('form')
        .send({})
        .expect(302)
        .expect('Location', '/leave-status');

      const unchanged = leaveModel.getLeaveById(leaveId);
      expect(unchanged.status).toBe('Approved');

      // Flash error is shown to the employee on the next page render.
      const statusPage = await employeeAgent.get('/leave-status').expect(200);
      expect(statusPage.text).toContain('Only pending leave requests can be cancelled.');
    });

    it('refuses to cancel an already-Rejected request and leaves it unchanged', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Cancel-after-reject refusal check',
      });

      const managerAgent = await loginAs(MANAGER_CREDENTIALS);
      await managerAgent
        .post('/leave-requests/' + leaveId + '/reject')
        .type('form')
        .send({ rejectionReason: 'Team is short-staffed' })
        .expect(302);

      await employeeAgent
        .post('/leave-requests/' + leaveId + '/cancel')
        .type('form')
        .send({})
        .expect(302)
        .expect('Location', '/leave-status');

      const unchanged = leaveModel.getLeaveById(leaveId);
      expect(unchanged.status).toBe('Rejected');

      const statusPage = await employeeAgent.get('/leave-status').expect(200);
      expect(statusPage.text).toContain('Only pending leave requests can be cancelled.');
    });

    it('does not allow a different employee to cancel another employee leave request', async () => {
      const ownerAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(ownerAgent, 'EMP001', {
        reason: 'Cross-employee cancel attempt check',
      });

      const otherAgent = await loginAs(OTHER_EMPLOYEE_CREDENTIALS);
      await otherAgent
        .post('/leave-requests/' + leaveId + '/cancel')
        .type('form')
        .send({})
        .expect(302)
        .expect('Location', '/leave-status');

      const unchanged = leaveModel.getLeaveById(leaveId);
      expect(unchanged.status).toBe('Pending');

      const statusPage = await otherAgent.get('/leave-status').expect(200);
      expect(statusPage.text).toContain('You are not authorized to cancel this leave request.');
    });

    it('redirects an unauthenticated request to /login and does not mutate the record', async () => {
      const ownerAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(ownerAgent, 'EMP001', {
        reason: 'Anonymous cancel attempt check',
      });

      const res = await request(app)
        .post('/leave-requests/' + leaveId + '/cancel')
        .type('form')
        .send({})
        .expect(302);

      expect(res.headers.location).toBe('/login');

      const unchanged = leaveModel.getLeaveById(leaveId);
      expect(unchanged.status).toBe('Pending');
    });

    it('does not crash when cancelling a non-existent leave id, and redirects sensibly', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const nonExistentId = 999999;

      const res = await employeeAgent
        .post('/leave-requests/' + nonExistentId + '/cancel')
        .type('form')
        .send({})
        .expect(302)
        .expect('Location', '/leave-status');

      expect(res.status).toBe(302);

      const statusPage = await employeeAgent.get('/leave-status').expect(200);
      expect(statusPage.text).toContain('Leave request not found.');
    });
  });
});
