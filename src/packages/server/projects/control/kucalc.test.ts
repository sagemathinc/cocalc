import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import init, { getProject } from "@cocalc/server/projects/control";
import { uuid } from "@cocalc/util/misc";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

// hardcoded in projects/control/kucalc.ts
const EXPECTED_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;

describe("kucalc", () => {
  init("kucalc");

  const id = uuid();
  const project = getProject(id);

  test("scheduled copy/date", async () => {
    const in1minute = new Date(Date.now() + 60 * 1000);
    const id2 = uuid();
    const copyID = await project.copyPath({
      path: "file.md",
      target_path: "file2.md",
      target_project_id: id2,
      scheduled: in1minute,
    });

    const pool = getPool();
    const data = (
      await pool.query("SELECT * from copy_paths WHERE id=$1", [copyID])
    ).rows[0];

    expect(data.id).toEqual(copyID);
    expect(data.expire.getTime() / 1000).toBeCloseTo(
      (in1minute.getTime() + EXPECTED_EXPIRATION_MS) / 1000,
      0,
    );
    expect(data.scheduled.getTime() / 1000).toBeCloseTo(
      in1minute.getTime() / 1000,
      1,
    );
    expect(data.source_path).toEqual("file.md");
    expect(data.target_path).toEqual("file2.md");
    expect(data.target_project_id).toEqual(id2);
    expect(data.time.getTime()).toBeLessThan(data.scheduled.getTime());
  });

  // in this test, we also don't specify a sepearte project
  test("scheduled copy/string", async () => {
    const in1minute: string = new Date(Date.now() + 60 * 1000).toISOString();
    const copyID = await project.copyPath({
      path: "file.md",
      scheduled: in1minute,
    });

    // this mimics database::copy_path.status(...)
    const pool = getPool();
    const data = (
      await pool.query("SELECT * from copy_paths WHERE id=$1", [copyID])
    ).rows[0];

    const in1minuteDate = new Date(in1minute);
    expect(data.id).toEqual(copyID);
    expect(data.expire.getTime() / 1000).toBeCloseTo(
      (in1minuteDate.getTime() + EXPECTED_EXPIRATION_MS) / 1000,
    );
    expect(data.scheduled.getTime() / 1000).toBeCloseTo(
      in1minuteDate.getTime() / 1000,
    );
    expect(data.source_path).toEqual("file.md");
    expect(data.target_path).toEqual("file.md");
    expect(data.target_project_id).toEqual(id);
    expect(data.time.getTime()).toBeLessThan(data.scheduled.getTime());
  });

  test("immediate copy_path", async () => {
    const id2 = uuid();
    const copyID = await project.copyPath({
      path: "file.md",
      target_path: "file2.md",
      target_project_id: id2,
      overwrite_newer: true,
      delete_missing: true,
      backup: true,
      wait_until_done: false,
    });

    // this mimics database::copy_path.status(...)
    const pool = getPool();
    const data = (
      await pool.query("SELECT * from copy_paths WHERE id=$1", [copyID])
    ).rows[0];

    expect(data.id).toEqual(copyID);
    expect(data.expire.getTime() / 1000).toBeCloseTo(
      (Date.now() + EXPECTED_EXPIRATION_MS) / 1000,
      1,
    );
    expect(data.scheduled).toBeNull();
    expect(data.source_path).toEqual("file.md");
    expect(data.target_path).toEqual("file2.md");
    expect(data.target_project_id).toEqual(id2);
    expect(data.time.getTime()).toBeLessThanOrEqual(Date.now());
    expect(data.backup).toBe(true);
    expect(data.delete_missing).toBe(true);
    expect(data.overwrite_newer).toBe(true);
    expect(data.public).toBeNull();
  });
});
