// tests/approvals.test.js
//
// Integration tests for EPMCDMETST-99: approve/reject flow and employee
// visibility of decisions.
//
// These tests drive the real Express app over HTTP (via supertest), using
// session cookies for the seeded EMP001 (Employee) and MGR001 (Approver)
// accounts, and a real (but isolated/temporary) SQLite database created by
// the app's own schema/seed logic in database/db.js. No app/route/model
// code is mocked out.

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

// Point the app at a fresh, temporary SQLite file for this test run instead
// of the real database/database.db (must be set before database/db.js is
// first required, which happens as soon as ../server is required below).
const testDbPath = path.join(
  os.tmpdir(),
  `leave-management-test-${process.pid}-${Date.now()}.db`
);
process.env.DB_PATH = testDbPath;

const app = require('../server');
const db = require('../database/db');
const leaveModel = require('../models/leaveModel');

const EMPLOYEE_CREDENTIALS = { employeeId: 'EMP001', password: 'password123' };
const APPROVER_CREDENTIALS = { employeeId: 'MGR001', password: 'password123' };

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
  const payload = {
    employeeId,
    leaveType: 'Casual',
    fromDate: '2026-09-01',
    toDate: '2026-09-02',
    reason: 'Family event',
    ...overrides,
  };
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

describe('Approval workflow integration tests (EPMCDMETST-99)', () => {
  // --- AC1: pending list returns Pending requests for the approver -------
  describe('GET /approvals (pending list)', () => {
    it('returns Pending requests for the approver', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Pending list visibility check',
      });

      const approverAgent = await loginAs(APPROVER_CREDENTIALS);
      const res = await approverAgent.get('/approvals').expect(200);

      expect(res.text).toContain('Pending list visibility check');
      expect(res.text).toContain(`/approvals/${leaveId}/decision`);

      const pending = leaveModel.getPendingLeaves();
      expect(pending.some((leave) => leave.id === leaveId)).toBe(true);
      expect(pending.find((leave) => leave.id === leaveId).status).toBe('Pending');
    });
  });

  // --- AC2: approve updates status and is visible to the employee --------
  describe('POST /approvals/:id/decision (approve)', () => {
    it('updates status to Approved and is visible to the employee', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Approve flow check',
      });

      const approverAgent = await loginAs(APPROVER_CREDENTIALS);
      await approverAgent
        .post(`/approvals/${leaveId}/decision`)
        .type('form')
        .send({ decision: 'Approve' })
        .expect(302)
        .expect('Location', '/approvals');

      const updated = leaveModel.getLeavesByEmployeeId('EMP001').find((l) => l.id === leaveId);
      expect(updated.status).toBe('Approved');
      expect(updated.approvedBy).toBe('MGR001');

      // Visible to the employee on their own leave-status page.
      const statusPage = await employeeAgent.get('/leave-status').expect(200);
      expect(statusPage.text).toContain('Approve flow check');
      expect(statusPage.text).toContain('Approved');
    });
  });

  // --- AC3: reject requires a reason, updates status, reason is visible -
  describe('POST /approvals/:id/decision (reject)', () => {
    it('requires a rejection reason', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Reject without reason check',
      });

      const approverAgent = await loginAs(APPROVER_CREDENTIALS);
      await approverAgent
        .post(`/approvals/${leaveId}/decision`)
        .type('form')
        .send({ decision: 'Reject' }) // no rejectionReason
        .expect(302)
        .expect('Location', '/approvals');

      // Rejected without a reason should be refused: the request stays Pending.
      const stillPending = leaveModel.getLeavesByEmployeeId('EMP001').find((l) => l.id === leaveId);
      expect(stillPending.status).toBe('Pending');
      expect(stillPending.rejectionReason).toBeNull();
    });

    it('updates status to Rejected and the reason is visible to the employee', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(employeeAgent, 'EMP001', {
        reason: 'Reject with reason check',
      });

      const approverAgent = await loginAs(APPROVER_CREDENTIALS);
      await approverAgent
        .post(`/approvals/${leaveId}/decision`)
        .type('form')
        .send({ decision: 'Reject', rejectionReason: 'Insufficient notice period' })
        .expect(302)
        .expect('Location', '/approvals');

      const updated = leaveModel.getLeavesByEmployeeId('EMP001').find((l) => l.id === leaveId);
      expect(updated.status).toBe('Rejected');
      expect(updated.rejectionReason).toBe('Insufficient notice period');
      expect(updated.approvedBy).toBe('MGR001');

      // Visible to the employee, including the rejection reason.
      const statusPage = await employeeAgent.get('/leave-status').expect(200);
      expect(statusPage.text).toContain('Reject with reason check');
      expect(statusPage.text).toContain('Rejected');
      expect(statusPage.text).toContain('Insufficient notice period');
    });
  });

  // --- AC4: negative tests for unauthorized access ------------------------
  describe('Unauthorized access to approvals', () => {
    it('does not allow an Employee-role user to view the pending approvals list', async () => {
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);

      const res = await employeeAgent.get('/approvals').expect(302);
      expect(res.headers.location).toBe('/dashboard');
    });

    it('does not allow an Employee-role user to approve a leave request', async () => {
      const requesterAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(requesterAgent, 'EMP001', {
        reason: 'Unauthorized approve attempt check',
      });

      // A second Employee-role user (not the approver) tries to approve it.
      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const res = await employeeAgent
        .post(`/approvals/${leaveId}/decision`)
        .type('form')
        .send({ decision: 'Approve' })
        .expect(302);

      expect(res.headers.location).toBe('/dashboard');

      const unchanged = leaveModel.getLeavesByEmployeeId('EMP001').find((l) => l.id === leaveId);
      expect(unchanged.status).toBe('Pending');
    });

    it('does not allow an Employee-role user to reject a leave request', async () => {
      const requesterAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(requesterAgent, 'EMP001', {
        reason: 'Unauthorized reject attempt check',
      });

      const employeeAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const res = await employeeAgent
        .post(`/approvals/${leaveId}/decision`)
        .type('form')
        .send({ decision: 'Reject', rejectionReason: 'Should not be allowed' })
        .expect(302);

      expect(res.headers.location).toBe('/dashboard');

      const unchanged = leaveModel.getLeavesByEmployeeId('EMP001').find((l) => l.id === leaveId);
      expect(unchanged.status).toBe('Pending');
      expect(unchanged.rejectionReason).toBeNull();
    });

    it('does not allow an unauthenticated request to approve/reject', async () => {
      const requesterAgent = await loginAs(EMPLOYEE_CREDENTIALS);
      const leaveId = await applyLeave(requesterAgent, 'EMP001', {
        reason: 'Anonymous approve attempt check',
      });

      const res = await request(app)
        .post(`/approvals/${leaveId}/decision`)
        .type('form')
        .send({ decision: 'Approve' })
        .expect(302);

      expect(res.headers.location).toBe('/login');

      const unchanged = leaveModel.getLeavesByEmployeeId('EMP001').find((l) => l.id === leaveId);
      expect(unchanged.status).toBe('Pending');
    });
  });
});
