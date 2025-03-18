/*
Unit test basic functionality of the openFiles distributed key:value
store.  Projects and compute servers use this to know what files
to open so they can fulfill their backend responsibilities:
   - computation
   - save to disk
   - load from disk when file changes

DEVELOPMENT:

pnpm exec jest --watch --forceExit --detectOpenHandles "open-files.test.ts"

*/

import { openFiles as createOpenFiles } from "@cocalc/backend/nats/sync";
import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";

const project_id = "00000000-0000-4000-8000-000000000000";
async function create() {
  return await createOpenFiles(project_id, { noAutosave: true, noCache: true });
}

describe("create open file tracker and do some basic operations", () => {
  let o1, o2;
  let file1 = `${Math.random()}.txt`;
  let file2 = `${Math.random()}.txt`;

  it("creates two open files tracker (tracking same project) and clear them", async () => {
    o1 = await create();
    o2 = await create();
    // ensure caching disable so our sync tests are real
    expect(o1.getDkv() === o2.getDkv()).toBe(false);
    o1.clear();
    await o1.save();
    expect(o1.hasUnsavedChanges()).toBe(false);
    o2.clear();
    await delay(50);
    while (o2.hasUnsavedChanges()) {
      try {
        // expected due to merge conflict and autosave being disabled.
        await o2.save();
      } catch {
        await delay(50);
      }
    }
  });

  it("confirm they are cleared", async () => {
    expect(o1.getAll()).toEqual([]);
    expect(o2.getAll()).toEqual([]);
  });

  it("touch file in one and observe change and timestamp getting assigned by server", async () => {
    // NOTE: if this breaks its due to the above clearing not being done;
    // maybe increase the "await delay(50)" above.
    o1.touch(file1);
    expect(o1.get(file1).time).toBeCloseTo(Date.now(), -3);
  });

  it("touches file in one and observes change by OTHER", async () => {
    o1.touch(file2);
    expect(o1.get(file2)?.path).toBe(file2);
    expect(o2.get(file2)).toBe(undefined);
    o1.save();
    if (o2.get(file2) == null) {
      await once(o2, "change", 250);
      expect(o2.get(file2).path).toBe(file2);
      expect(o2.get(file2).time == null).toBe(false);
    }
  });

  it("get all in o2 sees both file1 and file2", async () => {
    const v = o2.getAll();
    expect(v[0].path).toBe(file1);
    expect(v[1].path).toBe(file2);
    expect(v.length).toBe(2);
  });

  it("delete file1", async () => {
    o1.delete(file1);
    expect(o1.get(file1)).toBe(undefined);
    expect(o1.getAll().length).toBe(1);
    o1.save();
    await delay(1000);
    if (o2.get(file1) != null) {
      await once(o2, "change", 250);
    }
    expect(o2.get(file1)).toBe(undefined);
    // should be 1 due to file2 still being there:
    expect(o2.getAll().length).toBe(1);
  });

  it("sets an error", async () => {
    o2.setError(file2, Error("test error"));
    expect(o2.get(file2).error.error).toBe("Error: test error");
    expect(typeof o2.get(file2).error.time == "number").toBe(true);
    expect(Math.abs(Date.now() - o2.get(file2).error.time)).toBeLessThan(10000);
    try {
      // get a conflict due to above so resolve it...
      await o2.save();
    } catch {
      o2.save();
    }
    if (!o1.get(file2).error) {
      await once(o1, "change", 250);
    }
    expect(o1.get(file2).error.error).toBe("Error: test error");
  });

  it("clears the error", async () => {
    o1.setError(file2);
    expect(o1.get(file2).error).toBe(undefined);
    o1.save();
    if (o2.get(file2).error) {
      await once(o2, "change", 250);
    }
    expect(o2.get(file2).error).toBe(undefined);
  });
});
