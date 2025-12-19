/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import ephemeralSyncstring from "./ephemeral-syncstring";

// This mostly tests the trivial minimal edge cases.
describe("create ephemeral syncstring and test managing undo/redo using it", () => {
  it("creates ephemeral syncstring and tests undo/redo", async () => {
    const syncstring = await ephemeralSyncstring();
    syncstring.from_str("cocalc");
    expect(syncstring.to_str()).toBe("cocalc");
    await syncstring.save();
    syncstring.from_str("cocalc and sagemath");
    expect(syncstring.to_str()).toBe("cocalc and sagemath");
    syncstring.undo();
    expect(syncstring.to_str()).toBe("cocalc");
    syncstring.undo();
    expect(syncstring.to_str()).toBe("");
    syncstring.redo();
    expect(syncstring.to_str()).toBe("cocalc");
    syncstring.redo();
    expect(syncstring.to_str()).toBe("cocalc and sagemath");
    await syncstring.close();
  });

  it("illustrates how you have to use save to get a step in the undo/redo", async () => {
    const syncstring = await ephemeralSyncstring();
    syncstring.from_str("cocalc");
    expect(syncstring.to_str()).toBe("cocalc");
    syncstring.from_str("cocalc and sagemath");
    expect(syncstring.to_str()).toBe("cocalc and sagemath");
    syncstring.undo();
    expect(syncstring.to_str()).toBe("");
    syncstring.redo();
    expect(syncstring.to_str()).toBe("cocalc and sagemath");
    await syncstring.close();
  });

  const LENGTH = 100;
  it(`a sequence of ${LENGTH} undo/redos`, async () => {
    const start = Date.now();
    const syncstring = await ephemeralSyncstring();
    for (let i = 0; i < LENGTH; i++) {
      syncstring.from_str(`${i}`);
      syncstring.commit();
    }
    expect(syncstring.to_str()).toBe(`${LENGTH - 1}`);
    expect(syncstring.versions().length).toBe(LENGTH);
    for (let i = LENGTH - 1; i >= 0; i--) {
      expect(syncstring.to_str()).toBe(`${i}`);
      syncstring.undo();
    }
    expect(syncstring.to_str()).toBe("");
    for (let i = 0; i < LENGTH; i++) {
      syncstring.redo();
      expect(syncstring.to_str()).toBe(`${i}`);
    }
    // if should really just be ~100ms.
    expect(Date.now() - start).toBeLessThan(LENGTH * 10 + 500);
  });
});
