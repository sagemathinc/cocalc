/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import createProject from "@cocalc/server/projects/create";
import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import { test } from "./stop-idle-projects";
const { stopIdleProjects } = test;
import { delay } from "awaiting";
import { before, after } from "@cocalc/server/test";

beforeAll(before, 15000);
afterAll(after);

describe("creates a project, set various parameters, and runs idle project function, it and confirm that things work as intended", () => {
  let project_id;

  const projectsThatGotStopped = new Set<string>([]);
  const stopProject = async (project_id) => {
    projectsThatGotStopped.add(project_id);
  };
  const reset = () => projectsThatGotStopped.clear();
  const pool = getPool();

  afterAll(async () => {
    await pool.query("DELETE FROM projects WHERE project_id=$1", [project_id]);
  });

  it("creates a project", async () => {
    project_id = await createProject({});
    expect(isValidUUID(project_id)).toBe(true);
  });

  it("confirm that our project doesn't get stopped", async () => {
    await stopIdleProjects(stopProject);
    expect(projectsThatGotStopped.has(project_id)).toBe(false);
  });

  it("mock start of our project by setting run_quota, last_edited, and last_started", async () => {
    await pool.query(
      `UPDATE projects SET run_quota='{"network": false, "cpu_limit": 1, "disk_quota": 3000, "privileged": false, "cpu_request": 0.02, "member_host": false, "idle_timeout": 1800, "memory_limit": 1000, "always_running": false, "memory_request": 200}',
      last_edited=NOW(), last_started=NOW(), state='{"state":"running"}' WHERE project_id=$1`,
      [project_id],
    );
    await stopIdleProjects(stopProject);
    expect(projectsThatGotStopped.has(project_id)).toBe(false);
  });

  it("changes our project so that last_edited is an hour ago and last_started is an hour ago, and observe project gets stopped", async () => {
    await pool.query(
      `UPDATE projects SET last_edited=NOW()-interval '1 hour', last_started=NOW()-interval '1 hour' WHERE project_id=$1`,
      [project_id],
    );
    await stopIdleProjects(stopProject);
    while (!projectsThatGotStopped.has(project_id)) {
      await delay(30);
    }
    expect(projectsThatGotStopped.has(project_id)).toBe(true);
  });

  it("changes our project so that last_edited is an hour ago and last_started is a minute ago, and observe project does NOT get stopped", async () => {
    await pool.query(
      `UPDATE projects SET last_edited=NOW()-interval '1 hour', last_started=NOW()-interval '1 minute' WHERE project_id=$1`,
      [project_id],
    );
    reset();
    await stopIdleProjects(stopProject);
    expect(projectsThatGotStopped.has(project_id)).toBe(false);
  });

  it("changes our project so that last_edited is a minute ago and last_started is an hour ago, and observe project does NOT get stopped", async () => {
    await pool.query(
      `UPDATE projects SET last_edited=NOW()-interval '1 minute', last_started=NOW()-interval '1 hour' WHERE project_id=$1`,
      [project_id],
    );
    reset();
    await stopIdleProjects(stopProject);
    expect(projectsThatGotStopped.has(project_id)).toBe(false);
  });

  it("changes our project so that last_edited and last_started are both a month ago, but always_running is true, and observe project does NOT get stopped", async () => {
    await pool.query(
      `UPDATE projects SET run_quota='{"network": false, "cpu_limit": 1, "disk_quota": 3000, "privileged": false, "cpu_request": 0.02, "member_host": false, "idle_timeout": 1800, "memory_limit": 1000, "always_running": true, "memory_request": 200}',
      last_edited=NOW()-interval '1 month', last_started=NOW()-interval '1 month' WHERE project_id=$1`,
      [project_id],
    );
    reset();
    await stopIdleProjects(stopProject);
    expect(projectsThatGotStopped.has(project_id)).toBe(false);
  });

  it("makes it so stopping the project throws an error, and checks that the entire stopIdleProjects does NOT throw an error (it just logs something)", async () => {
    await pool.query(
      `UPDATE projects SET run_quota='{"network": false, "cpu_limit": 1, "disk_quota": 3000, "privileged": false, "cpu_request": 0.02, "member_host": false, "idle_timeout": 1800, "memory_limit": 1000, "always_running": false, "memory_request": 200}',
      last_edited=NOW()-interval '1 month', last_started=NOW()-interval '1 month', state='{"state":"running"}' WHERE project_id=$1`,
      [project_id],
    );
    // first confirm stopProject2 will get called
    reset();
    await stopIdleProjects(stopProject);
    while (!projectsThatGotStopped.has(project_id)) {
      await delay(30);
    }
    expect(projectsThatGotStopped.has(project_id)).toBe(true);
    // now call again with error but doesn't break anything
    const stopProject2 = async (project_id) => {
      await stopProject(project_id);
      throw Error("TEST");
    };
    reset();
    await stopIdleProjects(stopProject2);
    while (!projectsThatGotStopped.has(project_id)) {
      await delay(30);
    }
    expect(projectsThatGotStopped.has(project_id)).toBe(true);
  });
});
