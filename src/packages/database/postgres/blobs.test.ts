import { sha1 } from "@cocalc/backend/misc_node";
import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await testCleanup();
});

describe("test archiving and unarchiving syncstrings with no edit history", () => {
  const project_id = uuid();
  const path = "a.txt";
  const string_id = sha1(`${project_id}${path}`);
  const path2 = "a2.txt";
  const string_id2 = sha1(`${project_id}${path2}`);
  const pool = getPool();

  it("creates two syncstrings", async () => {
    await pool.query(
      "INSERT INTO syncstrings(string_id,project_id,path) VALUES($1,$2,$3)",
      [string_id, project_id, path],
    );
    await pool.query(
      "INSERT INTO syncstrings(string_id,project_id,path) VALUES($1,$2,$3)",
      [string_id2, project_id, path2],
    );
  });

  it("archives their history", async () => {
    const d = db();
    await d.archivePatches({ string_id });
    await d.archivePatches({ string_id: string_id2 });
    const { rows } = await pool.query(
      "SELECT archived from syncstrings WHERE string_id=$1 OR string_id=$2",
      [string_id, string_id2],
    );
    expect(rows[0].archived.length).toBe(36);
    expect(rows[1].archived.length).toBe(36);
  });
});

describe("test archiving and unarchiving two syncstrings with nontrivial but equal edit histories", () => {
  const project_id = uuid();
  const path = "a.txt";
  const string_id = sha1(`${project_id}${path}`);
  const path2 = "a2.txt";
  const string_id2 = sha1(`${project_id}${path2}`);
  const patch = "fake patch";
  const time = new Date();
  const pool = getPool();

  it("creates two syncstrings", async () => {
    await pool.query(
      "INSERT INTO syncstrings(string_id,project_id,path) VALUES($1,$2,$3)",
      [string_id, project_id, path],
    );
    await pool.query(
      "INSERT INTO syncstrings(string_id,project_id,path) VALUES($1,$2,$3)",
      [string_id2, project_id, path2],
    );
    await pool.query(
      "INSERT INTO patches(string_id,time,patch,is_snapshot) VALUES($1,$2,$3,false)",
      [string_id, time, patch],
    );
    await pool.query(
      "INSERT INTO patches(string_id,time,patch,is_snapshot) VALUES($1,$2,$3,false)",
      [string_id2, time, patch],
    );
  });

  it("archives their history", async () => {
    const d = db();
    await d.archivePatches({ string_id });
    await d.archivePatches({ string_id: string_id2 });
    const { rows } = await pool.query(
      "SELECT archived from syncstrings WHERE string_id=$1 OR string_id=$2",
      [string_id, string_id2],
    );
    expect(rows[0].archived.length).toBe(36);
    expect(rows[1].archived.length).toBe(36);
    const { rows: rows2 } = await pool.query(
      "SELECT count(*) AS count from patches where string_id=$1 OR string_id=$2",
      [string_id, string_id2],
    );
    expect(rows2[0].count).toBe("0");
  });
});
