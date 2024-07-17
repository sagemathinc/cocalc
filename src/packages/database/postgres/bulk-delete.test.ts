/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";
import { bulkDelete } from "./bulk-delete";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("bulk delete", () => {
  test("deleting projects", async () => {
    const p = getPool();
    const project_id = uuid();
    const N = 100000;

    // extra entry, which has to remain
    const other = uuid();
    await p.query(
      "INSERT INTO project_log (id, project_id, time) VALUES($1::UUID, $2::UUID, $3::TIMESTAMP)",
      [other, uuid(), new Date()],
    );

    await p.query(
      `INSERT INTO project_log (id, project_id, time)
      SELECT gen_random_uuid(), $1::UUID, NOW() - interval '1 second' * g.n
      FROM generate_series(1, $2) AS g(n)`,
      [project_id, N],
    );

    const num1 = await p.query(
      "SELECT COUNT(*)::INT as num FROM project_log WHERE project_id = $1",
      [project_id],
    );
    expect(num1.rows[0].num).toEqual(N);

    const res = await bulkDelete({
      table: "project_log",
      field: "project_id",
      value: project_id,
    });

    // if this ever fails, the "ret.rowCount" value is inaccurate.
    // This must be replaced by "RETURNING 1" in the the query and a "SELECT COUNT(*) ..." and so.
    // (and not only here, but everywhere in the code base)
    expect(res.rowsDeleted).toEqual(N);
    expect(res.durationS).toBeGreaterThan(0.1);
    expect(res.totalPgTimeS).toBeGreaterThan(0.1);
    expect(res.totalWaitS).toBeGreaterThan(0.1);
    expect((res.totalPgTimeS * 10) / res.totalWaitS).toBeGreaterThan(0.5);

    const num2 = await p.query(
      "SELECT COUNT(*)::INT as num FROM project_log WHERE project_id = $1",
      [project_id],
    );
    expect(num2.rows[0].num).toEqual(0);

    const otherRes = await p.query("SELECT * FROM project_log WHERE id = $1", [
      other,
    ]);
    expect(otherRes.rows[0].id).toEqual(other);
  }, 10000);
});
