/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import { bulk_delete } from "./bulk-delete";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("bulk delete", () => {
  test("deleting projects", async () => {
    const p = getPool();
    const project_id = uuid();
    const N = 2000;
    for (let i = 0; i < N; i++) {
      await p.query(
        "INSERT INTO project_log (id, project_id, time) VALUES($1::UUID, $2::UUID, $3::TIMESTAMP)",
        [uuid(), project_id, new Date()],
      );
    }

    const num1 = await p.query(
      "SELECT COUNT(*)::INT as num FROM project_log WHERE project_id = $1",
      [project_id],
    );
    expect(num1.rows[0].num).toEqual(N);

    await bulk_delete({
      table: "project_log",
      field: "project_id",
      value: project_id,
      limit: 100,
    });

    const num2 = await p.query(
      "SELECT COUNT(*)::INT as num FROM project_log WHERE project_id = $1",
      [project_id],
    );
    expect(num2.rows[0].num).toEqual(0);
  });
});
