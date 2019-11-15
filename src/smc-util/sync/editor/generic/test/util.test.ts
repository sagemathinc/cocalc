import {
  make_patch,
  apply_patch,
  patch_cmp,
  three_way_merge,
  time_cmp
} from "../util";

describe("test making and applying some patches on strings", () => {
  const s0 = "This is CoCalc! Open source software.  And a website.";
  const s1 = "This is SageMath! Open source software.";
  it("creates and applies a patch that applies cleanly", () => {
    const patch = make_patch(s0, s1);
    expect(patch).toEqual([
      [
        [[0, " is "], [-1, "CoCalc"], [1, "SageMath"], [0, "! Op"]],
        4,
        4,
        14,
        16
      ],
      [[[0, "are."], [-1, "  And a website."]], 35, 35, 20, 4]
    ]);
    expect(apply_patch(patch, s0)).toEqual([s1, true]); // true=clean
  });

  it("creates a patch that does NOT apply cleanly", () => {
    const patch = make_patch(s0, s1);
    expect(apply_patch(patch, "This is CoCalc!")).toEqual([
      "This is SageMath!",
      false // not clean
    ]);
  });
});

describe("test doing a 3-way merge", () => {
  const base = "SageMathCloud is software for using Sage in the cloud.";

  // we change base in two different ways: first name
  const local = "CoCalc is software for using Sage in the cloud.";
  // .... then (independently) the purpose.
  const remote =
    "SageMathCloud is software for collaborative calculation in the cloud.";

  it("does a three-way merge", () => {
    const merge = three_way_merge({ base, local, remote });
    // Merging captures both changes.
    expect(merge).toBe(
      "CoCalc is software for collaborative calculation in the cloud."
    );
  });
});

describe("Test comparison of patch log entries (compares time and user)", () => {
  const p0 = {
    time: new Date("2019-01-01T22:15:31.539Z"),
    patch: [],
    user_id: 0,
    size: 2
  };
  const p1 = {
    time: new Date("2019-01-01T22:15:40Z"),
    patch: [],
    user_id: 1,
    size: 2
  };
  const p2 = {
    time: new Date("2019-01-01T22:15:31.539Z"),
    patch: [],
    user_id: 1,
    size: 2
  };

  it("compares some patch log entries", () => {
    expect(patch_cmp(p0, p0)).toBe(0);
    expect(patch_cmp(p1, p1)).toBe(0);
    expect(patch_cmp(p0, p1)).toBe(-1);
    expect(patch_cmp(p1, p0)).toBe(1);
    expect(patch_cmp(p0, p2)).toBe(-1);
    expect(patch_cmp(p2, p0)).toBe(1);
  });
});

describe("Test comparing times", () => {
  const t0 = new Date("2019-01-01T22:15:31.539Z");
  const t1 = new Date("2019-01-01T22:15:40Z");
  const t2 = new Date("2019-01-01T22:15:31.539Z");

  it("compares some times", () => {
    expect(time_cmp(t0, t1)).toBe(-1);
    expect(time_cmp(t1, t0)).toBe(1);
    expect(time_cmp(t0, t0)).toBe(0);
    expect(time_cmp(t0, t2)).toBe(0);
    expect(time_cmp(t2, t0)).toBe(0);
  });
});
