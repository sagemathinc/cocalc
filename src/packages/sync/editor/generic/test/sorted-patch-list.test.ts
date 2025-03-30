/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Unit test of the SortedPatchList object, which manages
a sorted list of patches.

DEVELOPMENT:

pnpm test sorted-patch-list.test.ts


*/

import { SortedPatchList } from "../sorted-patch-list";
import { make_patch } from "../util";
import { StringDocument } from "../../string/doc";

function from_str(s: string): StringDocument {
  return new StringDocument(s);
}

describe("Test empty sorted patch list -- call all public methods", () => {
  let patches: SortedPatchList;

  it("creates a sorted patch list", () => {
    patches = new SortedPatchList(from_str);
    expect(patches.value().to_str()).toBe("");
  });

  it("calls next_available_time to get next time cong to 3 mod 10", () => {
    const d = new Date(1546543588867); // 7 mod 10.
    const t = patches.next_available_time(d, 3, 10);
    const d1 = t.valueOf();
    expect(d1 % 10).toEqual(3);
    expect(d1 > d.valueOf()).toBe(true);
    expect(d1 - d.valueOf() < 1000).toBe(true);
  });

  it("gets the current value (empty string)", () => {
    expect(patches.value().to_str()).toBe("");
  });

  it("gets the current value without cache", () => {
    expect(patches.value_no_cache().to_str()).toBe("");
  });

  it("validates snapshots (triviality)", () => {
    patches.validate_snapshots();
  });

  it("gets id of user who made edit at time (error since no edits)", () => {
    expect(() => patches.user_id(new Date())).toThrow("no patch");
  });

  it("gets time sent of a patch (error since no patches)", () => {
    expect(() => patches.time_sent(new Date())).toThrow("no patch");
  });

  it("gets patch at time (error since no patches)", () => {
    expect(() => patches.patch(new Date())).toThrow("no patch");
  });

  it("empty list of versions", () => {
    expect(patches.versions()).toEqual([]);
  });

  it("show history doesn't crash", () => {
    patches.show_history({ log: (..._args) => {} });
  });

  it("time of next snapshot (none since nothing yet)", () => {
    expect(patches.time_of_unmade_periodic_snapshot(100, 9999)).toBe(undefined);
  });

  it("time of snapshots (none of course)", () => {
    expect(patches.snapshot_times()).toEqual([]);
  });

  it("most recent patch", () => {
    expect(patches.newest_patch_time()).toBe(undefined);
  });

  it("number of patch", () => {
    expect(patches.count()).toBe(0);
  });

  it("close it, and check that it is seriously broken", () => {
    patches.close();
    expect(() => patches.versions()).toThrow(
      "Cannot read properties of undefined (reading 'map')",
    );
  });
});

describe("Test sorted patch list with one patch", () => {
  let patches: SortedPatchList;

  it("creates a sorted patch list", () => {
    patches = new SortedPatchList(from_str);
    expect(patches.value().to_str()).toBe("");
  });

  const patch = {
    time: new Date("2019-01-03T20:33:47.360Z"),
    patch: make_patch("", "CoCalc"),
    user_id: 0,
    size: JSON.stringify(make_patch("", "CoCalc")).length,
  };
  it("adds a patch", () => {
    patches.add([patch]);
  });

  it("gets the current value", () => {
    expect(patches.value().to_str()).toBe("CoCalc");
  });

  it("gets the current value again (will use a cache)", () => {
    expect(patches.value().to_str()).toBe("CoCalc");
  });

  it("gets the current value without cache", () => {
    expect(patches.value_no_cache().to_str()).toBe("CoCalc");
  });

  it("gets id of user who made edit at time", () => {
    expect(patches.user_id(patch.time)).toBe(patch.user_id);
  });

  it("gets time sent of a patch (undefined since not yet sent)", () => {
    expect(patches.time_sent(patch.time)).toBe(undefined);
  });

  it("gets patch at time (error since no patches)", () => {
    expect(patches.patch(patch.time).patch).toEqual(patch.patch);
  });

  it("list of versions", () => {
    expect(patches.versions()).toEqual([patch.time]);
  });

  it("most recent patch", () => {
    expect(patches.newest_patch_time()).toEqual(patch.time);
  });

  it("number of patch", () => {
    expect(patches.count()).toBe(1);
  });
});

describe("Test sorted patch list with several patches", () => {
  let patches: SortedPatchList;

  it("creates a sorted patch list", () => {
    patches = new SortedPatchList(from_str);
    expect(patches.value().to_str()).toBe("");
  });

  const w = [
    make_patch("", "CoCalc"),
    make_patch("CoCalc", "CoCalc -- Collaborative Calculation"),
    make_patch(
      "CoCalc -- Collaborative Calculation",
      "CoCalc -- Collaborative Calculation",
    ),
  ];

  const v = [
    {
      time: new Date("2019-01-03T20:33:47.360Z"),
      patch: w[0],
      user_id: 0,
      sent: new Date("2019-01-03T20:33:47.40Z"),
      size: JSON.stringify(w[0]).length,
    },
    {
      time: new Date("2019-01-03T20:33:50Z"),
      patch: w[1],
      user_id: 1,
      sent: new Date("2019-01-03T20:34"),
      size: JSON.stringify(w[1]).length,
    },
    {
      time: new Date("2019-01-03T20:34:50Z"),
      patch: w[2],
      user_id: 0,
      size: JSON.stringify(w[2]).length,
    },
  ];

  it("adds the patches", () => {
    patches.add(v);
  });

  it("gets the current value", () => {
    expect(patches.value().to_str()).toBe(
      "CoCalc -- Collaborative Calculation",
    );
  });

  it("gets the current value again (will use a cache)", () => {
    expect(patches.value().to_str()).toBe(
      "CoCalc -- Collaborative Calculation",
    );
  });

  it("gets the current value without cache", () => {
    expect(patches.value_no_cache().to_str()).toBe(
      "CoCalc -- Collaborative Calculation",
    );
  });

  it("gets id of user who made edit at time", () => {
    for (const patch of v) {
      expect(patches.user_id(patch.time)).toBe(patch.user_id);
    }
  });

  it("gets time sent of patches", () => {
    for (const patch of v) {
      expect(patches.user_id(patch.time)).toEqual(patch.user_id);
    }
  });

  it("gets patch at time", () => {
    for (const patch of (patches as any).patches) {
      expect(patches.patch(patch.time)).toEqual(patch);
    }
  });

  it("list of versions", () => {
    expect(patches.versions()).toEqual(v.map((x) => x.time));
  });

  it("most recent patch", () => {
    expect(patches.newest_patch_time()).toEqual(v[2].time);
  });

  it("number of patch", () => {
    expect(patches.count()).toBe(v.length);
  });
});

describe("Test inserting missing patches (thus changing history)", () => {
  let patches: SortedPatchList;

  it("creates a sorted patch list", () => {
    patches = new SortedPatchList(from_str);
    expect(patches.value().to_str()).toBe("");
  });

  const w = [
    make_patch("", "SageMathCloud -- "),
    make_patch("SageMathCloud -- ", "CoCalc -- "),
    make_patch(
      "SageMathCloud -- ",
      "SageMathCloud -- Collaborative Calculation",
    ),
  ];

  const v = [
    {
      time: new Date("2019-01-03T20:33:47.360Z"),
      patch: w[0],
      user_id: 0,
      sent: new Date("2019-01-03T20:33:47.40Z"),
      size: JSON.stringify(w[0]).length,
    },
    {
      time: new Date("2019-01-03T20:33:50Z"),
      patch: w[1],
      user_id: 1,
      sent: new Date("2019-01-03T20:34"),
      size: JSON.stringify(w[1]).length,
    },
    {
      time: new Date("2019-01-03T20:34:50Z"),
      patch: w[2],
      user_id: 0,
      sent: new Date("2019-01-03T20:35"),
      size: JSON.stringify(w[1]).length,
    },
  ];

  it("adds some patches", () => {
    patches.add([v[0], v[2]]);
  });

  it("gets the current value", () => {
    expect(patches.value().to_str()).toBe(
      "SageMathCloud -- Collaborative Calculation",
    );
  });

  it("number of patch", () => {
    expect(patches.count()).toBe(2);
  });

  it("adds other user patch (back in time)", () => {
    patches.add([v[1]]);
  });

  it("number of patch", () => {
    expect(patches.count()).toBe(3);
  });

  it("gets the current value again, which changes", () => {
    expect(patches.value().to_str()).toBe(
      "CoCalc -- Collaborative Calculation",
    );
  });

  it("gets the current value without cache as double check", () => {
    expect(patches.value_no_cache().to_str()).toBe(
      "CoCalc -- Collaborative Calculation",
    );
  });

  it("list of versions", () => {
    expect(patches.versions()).toEqual(v.map((x) => x.time));
  });
});

describe("Test firstSnapshot", () => {
  let patches: SortedPatchList;
  const firstSnapshot = new Date("2025-01-01T00:00:00.000Z");

  const w = [make_patch("", "x"), make_patch("", "y")];

  const v = [
    {
      time: new Date(firstSnapshot.valueOf() + 10000),
      patch: w[0],
      user_id: 0,
      size: JSON.stringify(w[0]).length,
    },
    {
      time: new Date(firstSnapshot.valueOf() - 10000),
      patch: w[1],
      user_id: 0,
      size: JSON.stringify(w[0]).length,
    },
  ];

  it(`creates a sorted patch list with firstSnapshot=${firstSnapshot}`, () => {
    patches = new SortedPatchList(from_str, firstSnapshot);
  });

  it("insert one patches that is after the snapshot and one before it, and confirm the one before is hidden for now", () => {
    patches.add([v[0], v[1]]);
    expect(patches.value().to_str()).toBe("x");
    expect(Object.keys((patches as any).heldPatches)).toEqual([
      `${v[1].time.valueOf()}`,
    ]);
    expect(Object.keys((patches as any).times)).toEqual([
      `${v[0].time.valueOf()}`,
    ]);
  });

  it("now adjust the firstSnapshot time and see the other patch appear", () => {
    patches.setFirstSnapshot(v[1].time);
    const { heldPatches, times } = patches as any;
    expect(Object.keys(heldPatches)).toEqual([]);
    expect(Object.keys(times).length).toEqual(2);
  });
});

describe("Testing adding a snapshot to the patch list", () => {
  let patches: SortedPatchList;

  const w = [make_patch("", "x")];
  const v = [
    // a patch
    {
      time: new Date("2025-01-01T00:00:00.000Z"),
      patch: w[0],
      user_id: 0,
      size: JSON.stringify(w[0]).length,
    },
    // make it a snapshot
    {
      time: new Date("2025-01-01T00:00:00.000Z"),
      is_snapshot: true,
      snapshot: "x",
      user_id: 0,
      size: 1,
    },
  ];

  it("creates a sorted patch list and add a patch", () => {
    patches = new SortedPatchList(from_str);
    patches.add([v[0]]);
    expect(patches.getOldestSnapshot()).toBe(undefined);
    expect(patches.count()).toBe(1);
  });

  it("apply the snapshot message and see the first patch is now a snapshot", () => {
    patches.add([v[1]]);
    expect(patches.getOldestSnapshot()?.time).toEqual(v[0].time);
    expect(patches.getOldestSnapshot()?.patch).toEqual(v[0].patch);
    expect(patches.getOldestSnapshot()).toEqual(
      expect.objectContaining({ ...v[1], ...v[0] }),
    );
    // still 1
    expect(patches.count()).toBe(1);
  });

  it("adds the snapshot info *then* the patch later and verifies that works", () => {
    patches = new SortedPatchList(from_str);
    patches.add([v[1]]);
    expect(patches.getOldestSnapshot()).toBe(undefined);
    expect(patches.count()).toBe(0);
    patches.add([v[0]]);
    expect(patches.count()).toBe(1);
    expect(patches.getOldestSnapshot()).toEqual(
      expect.objectContaining({ ...v[1], ...v[0] }),
    );
  });
});
