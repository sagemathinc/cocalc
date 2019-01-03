/* Unit test of the SortedPatchList object, which manages
   a sorted list of patches.
*/

import { SortedPatchList } from "../sorted-patch-list";
import { make_patch } from "../util";
import { StringDocument } from "../../string/doc";

function from_str(s : string) : StringDocument {
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
    patches.show_history({});
  });

  it("time of next snapshot (none since nothing yet)", () => {
    expect(patches.time_of_unmade_periodic_snapshot(100)).toBe(undefined);
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
    expect(() => patches.versions()).toThrow("Cannot read property");
  });
});

describe("Test non-empty sorted patch list -- call all public methods", () => {
  let patches: SortedPatchList;

  it("creates a sorted patch list", () => {
    patches = new SortedPatchList(from_str);
    expect(patches.value().to_str()).toBe("");
  });

  const patch = {
    time: new Date("2019-01-03T20:33:47.360Z"),
    patch: make_patch("", "CoCalc"),
    user_id: 0
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

  it("gets id of user who made edit at time (error since no edits)", () => {
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
