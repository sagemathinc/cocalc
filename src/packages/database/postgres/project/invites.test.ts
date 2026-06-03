/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { callback_opts } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "../types";

describe("Project invite methods", () => {
  const database: PostgreSQL = db();
  let pool: any;

  // Wrapper functions
  async function when_sent_project_invite_wrapper(opts: {
    project_id: string;
    to: string;
  }): Promise<Date | number> {
    return callback_opts(database.when_sent_project_invite.bind(database))(
      opts,
    );
  }

  async function sent_project_invite_wrapper(opts: {
    project_id: string;
    to: string;
    error?: string;
  }): Promise<void> {
    return callback_opts(database.sent_project_invite.bind(database))(opts);
  }

  beforeAll(async () => {
    pool = getPool();
    await initEphemeralDatabase();
  });

  afterAll(async () => {
    await testCleanup();
  });

  describe("when_sent_project_invite", () => {
    it("returns 0 when no invite has been sent", async () => {
      const projectId = uuid();
      const email = `test-${Date.now()}@example.com`;

      // Create project
      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const result = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });

      expect(result).toBe(0);
    });

    it("returns timestamp when invite was sent successfully", async () => {
      const projectId = uuid();
      const email = `success-${Date.now()}@example.com`;
      const inviteTime = new Date();

      // Create project with invite
      await pool.query(
        "INSERT INTO projects (project_id, invite) VALUES ($1, $2)",
        [
          projectId,
          JSON.stringify({
            [email]: { time: inviteTime, error: null },
          }),
        ],
      );

      const result = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });

      expect(result).toBeInstanceOf(Date);
      expect((result as Date).getTime()).toBeCloseTo(inviteTime.getTime(), -2); // Within 100ms
    });

    it("returns 0 when invite has an error", async () => {
      const projectId = uuid();
      const email = `error-${Date.now()}@example.com`;

      // Create project with failed invite
      await pool.query(
        "INSERT INTO projects (project_id, invite) VALUES ($1, $2)",
        [
          projectId,
          JSON.stringify({
            [email]: { time: new Date(), error: "SMTP error" },
          }),
        ],
      );

      const result = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });

      expect(result).toBe(0);
    });

    it("handles emails with special characters", async () => {
      const projectId = uuid();
      const email = `test'quote${Date.now()}@example.com`;
      const inviteTime = new Date();

      // Create project with invite containing special chars
      await pool.query(
        "INSERT INTO projects (project_id, invite) VALUES ($1, $2)",
        [
          projectId,
          JSON.stringify({
            [email]: { time: inviteTime },
          }),
        ],
      );

      const result = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });

      expect(result).toBeInstanceOf(Date);
    });

    it("returns 0 for different email address", async () => {
      const projectId = uuid();
      const email1 = `invited-${Date.now()}@example.com`;
      const email2 = `not-invited-${Date.now()}@example.com`;

      // Create project with invite for email1
      await pool.query(
        "INSERT INTO projects (project_id, invite) VALUES ($1, $2)",
        [
          projectId,
          JSON.stringify({
            [email1]: { time: new Date() },
          }),
        ],
      );

      // Query for email2
      const result = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email2,
      });

      expect(result).toBe(0);
    });

    it("handles multiple invites for same project", async () => {
      const projectId = uuid();
      const email1 = `user1-${Date.now()}@example.com`;
      const email2 = `user2-${Date.now()}@example.com`;
      const time1 = new Date(Date.now() - 1000);
      const time2 = new Date();

      // Create project with multiple invites
      await pool.query(
        "INSERT INTO projects (project_id, invite) VALUES ($1, $2)",
        [
          projectId,
          JSON.stringify({
            [email1]: { time: time1 },
            [email2]: { time: time2 },
          }),
        ],
      );

      const result1 = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email1,
      });

      const result2 = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email2,
      });

      expect(result1).toBeInstanceOf(Date);
      expect(result2).toBeInstanceOf(Date);
      expect((result1 as Date).getTime()).toBeCloseTo(time1.getTime(), -2);
      expect((result2 as Date).getTime()).toBeCloseTo(time2.getTime(), -2);
    });
  });

  describe("sent_project_invite", () => {
    it("records a successful invite", async () => {
      const projectId = uuid();
      const email = `record-${Date.now()}@example.com`;

      // Create project
      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      const beforeTime = Date.now();
      await sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });
      const afterTime = Date.now();

      // Verify the invite was recorded
      const { rows } = await pool.query(
        "SELECT invite FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(rows[0].invite).toBeDefined();
      expect(rows[0].invite[email]).toBeDefined();
      expect(rows[0].invite[email].time).toBeDefined();

      const recordedTime = new Date(rows[0].invite[email].time).getTime();
      expect(recordedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(recordedTime).toBeLessThanOrEqual(afterTime);
      expect(rows[0].invite[email].error).toBeUndefined();
    });

    it("records an invite with error", async () => {
      const projectId = uuid();
      const email = `error-record-${Date.now()}@example.com`;
      const errorMsg = "Failed to send email: SMTP timeout";

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      await sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
        error: errorMsg,
      });

      const { rows } = await pool.query(
        "SELECT invite FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(rows[0].invite[email].time).toBeDefined();
      expect(rows[0].invite[email].error).toBe(errorMsg);
    });

    it("updates existing invite", async () => {
      const projectId = uuid();
      const email = `update-${Date.now()}@example.com`;
      const oldTime = new Date(Date.now() - 10000);

      // Create project with old invite
      await pool.query(
        "INSERT INTO projects (project_id, invite) VALUES ($1, $2)",
        [
          projectId,
          JSON.stringify({
            [email]: { time: oldTime, error: "old error" },
          }),
        ],
      );

      // Record new invite
      await sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });

      const { rows } = await pool.query(
        "SELECT invite FROM projects WHERE project_id = $1",
        [projectId],
      );

      const newTime = new Date(rows[0].invite[email].time);
      expect(newTime.getTime()).toBeGreaterThan(oldTime.getTime());
      expect(rows[0].invite[email].error).toBeUndefined();
    });

    it("preserves other invites when adding new one", async () => {
      const projectId = uuid();
      const email1 = `existing-${Date.now()}@example.com`;
      const email2 = `new-${Date.now()}@example.com`;
      const time1 = new Date();

      // Create project with existing invite
      await pool.query(
        "INSERT INTO projects (project_id, invite) VALUES ($1, $2)",
        [
          projectId,
          JSON.stringify({
            [email1]: { time: time1 },
          }),
        ],
      );

      // Add new invite
      await sent_project_invite_wrapper({
        project_id: projectId,
        to: email2,
      });

      const { rows } = await pool.query(
        "SELECT invite FROM projects WHERE project_id = $1",
        [projectId],
      );

      // Both invites should exist
      expect(rows[0].invite[email1]).toBeDefined();
      expect(rows[0].invite[email2]).toBeDefined();
      expect(new Date(rows[0].invite[email1].time).getTime()).toBeCloseTo(
        time1.getTime(),
        -2,
      );
    });

    it("handles emails with special characters", async () => {
      const projectId = uuid();
      const email = `test+plus${Date.now()}@example.com`;

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Should not throw
      await sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });

      const { rows } = await pool.query(
        "SELECT invite FROM projects WHERE project_id = $1",
        [projectId],
      );

      expect(rows[0].invite[email]).toBeDefined();
    });
  });

  describe("Integration: send and check invite", () => {
    it("records invite and then retrieves it correctly", async () => {
      const projectId = uuid();
      const email = `integration-${Date.now()}@example.com`;

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Initially no invite
      let result = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });
      expect(result).toBe(0);

      // Send invite
      await sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });

      // Now invite exists
      result = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).getTime()).toBeCloseTo(Date.now(), -3);
    });

    it("failed invite returns 0 on check", async () => {
      const projectId = uuid();
      const email = `failed-${Date.now()}@example.com`;

      await pool.query("INSERT INTO projects (project_id) VALUES ($1)", [
        projectId,
      ]);

      // Send failed invite
      await sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
        error: "Network error",
      });

      // Check returns 0 because of error
      const result = await when_sent_project_invite_wrapper({
        project_id: projectId,
        to: email,
      });
      expect(result).toBe(0);
    });
  });
});
