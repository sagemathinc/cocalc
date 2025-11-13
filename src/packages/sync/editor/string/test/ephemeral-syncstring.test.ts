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
});
