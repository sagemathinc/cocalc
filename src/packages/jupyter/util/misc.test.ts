import expect from "expect";
import * as immutable from "immutable";
import {
  compareDottedVersions,
  get_kernels_by_name_or_language,
  isDottedVersion,
  kernelUpdateInfo,
  times_n,
} from "./misc";

describe("test times_n", () => {
  it("does what it is supposed to do", () => {
    expect(times_n("x", 3)).toBe("xxx");
  });
});

describe("isDottedVersion", () => {
  it("accepts dotted numeric versions", () => {
    for (const v of ["10", "11", "10.6", "3.12", "4.3.1"]) {
      expect(isDottedVersion(v)).toBe(true);
    }
  });
  it("rejects non-conforming strings", () => {
    for (const v of ["", "3.12.", "1.0a", "v1.0", "python3", undefined, 10]) {
      expect(isDottedVersion(v as any)).toBe(false);
    }
  });
});

describe("compareDottedVersions", () => {
  it("compares major/minor/patch numerically", () => {
    expect(compareDottedVersions("10.7", "10.6")).toBe(1);
    expect(compareDottedVersions("10.6", "10.7")).toBe(-1);
    expect(compareDottedVersions("2.0", "1.9")).toBe(1);
    expect(compareDottedVersions("1.0", "1.0")).toBe(0);
    // numeric, not lexicographic: 10 > 9
    expect(compareDottedVersions("1.10", "1.9")).toBe(1);
  });
  it("treats the shorter version as less when prefixes are equal", () => {
    expect(compareDottedVersions("3.12", "3.12.1")).toBe(-1);
    expect(compareDottedVersions("10", "10.0.1")).toBe(-1);
    expect(compareDottedVersions("3.12.1", "3.12")).toBe(1);
  });
});

function kspec(
  name: string,
  cocalc: Record<string, any> | undefined,
  display_name = name,
) {
  return immutable.fromJS({
    name,
    display_name,
    language: "python",
    ...(cocalc != null ? { metadata: { cocalc } } : {}),
  });
}

describe("kernelUpdateInfo", () => {
  const kernels = immutable.List([
    kspec("testfam-1.0", { family: "testfam", version: "1.0" }, "Test 1.0"),
    kspec("testfam-1.1", { family: "testfam", version: "1.1" }, "Test 1.1"),
    kspec("testfam-2.0", { family: "testfam", version: "2.0" }, "Test 2.0"),
    kspec("python3", { priority: 100 }),
  ]);

  it("reports the newest version of the same family", () => {
    const info = kernelUpdateInfo("testfam-1.0", kernels as any);
    expect(info).not.toBeNull();
    expect(info!.family).toBe("testfam");
    expect(info!.currentVersion).toBe("1.0");
    expect(info!.latestVersion).toBe("2.0");
    expect(info!.latestKernelName).toBe("testfam-2.0");
    expect(info!.latestDisplayName).toBe("Test 2.0");
  });

  it("returns null when already on the latest", () => {
    expect(kernelUpdateInfo("testfam-2.0", kernels as any)).toBeNull();
  });

  it("returns null for kernels without family/version", () => {
    expect(kernelUpdateInfo("python3", kernels as any)).toBeNull();
  });

  it("excludes disabled and negative-priority candidates", () => {
    const ks = immutable.List([
      kspec("fam-1.0", { family: "fam", version: "1.0" }),
      kspec("fam-2.0", { family: "fam", version: "2.0", disabled: true }),
      kspec("fam-3.0", { family: "fam", version: "3.0", priority: -1 }),
    ]);
    expect(kernelUpdateInfo("fam-1.0", ks as any)).toBeNull();
  });

  it("skips a newer negative-priority kernel but still offers a valid one", () => {
    const ks = immutable.List([
      kspec("of-3.4", { family: "of", version: "3.4" }, "OF 3.4"),
      kspec("of-3.5", { family: "of", version: "3.5" }, "OF 3.5"),
      kspec("of-3.7", { family: "of", version: "3.7", priority: -1 }, "OF 3.7"),
    ]);
    const info = kernelUpdateInfo("of-3.4", ks as any);
    expect(info).not.toBeNull();
    expect(info!.latestVersion).toBe("3.5");
    expect(info!.latestKernelName).toBe("of-3.5");
  });

  it("ignores candidates with an invalid version", () => {
    const ks = immutable.List([
      kspec("z-1.0", { family: "z", version: "1.0" }),
      kspec("z-bad", { family: "z", version: "two" }),
    ]);
    expect(kernelUpdateInfo("z-1.0", ks as any)).toBeNull();
  });

  it("skips a newer disabled candidate but still offers a valid one", () => {
    const ks = immutable.List([
      kspec("d-1.0", { family: "d", version: "1.0" }),
      kspec("d-1.5", { family: "d", version: "1.5" }),
      kspec("d-2.0", { family: "d", version: "2.0", disabled: true }),
    ]);
    const info = kernelUpdateInfo("d-1.0", ks as any);
    expect(info).not.toBeNull();
    expect(info!.latestVersion).toBe("1.5");
  });

  it("returns null for an empty kernel list, missing current name, or unknown current kernel", () => {
    const ks = immutable.List([
      kspec("a-1.0", { family: "a", version: "1.0" }),
    ]);
    expect(kernelUpdateInfo("a-1.0", immutable.List() as any)).toBeNull();
    expect(kernelUpdateInfo(null, ks as any)).toBeNull();
    expect(kernelUpdateInfo(undefined, ks as any)).toBeNull();
    expect(kernelUpdateInfo("does-not-exist", ks as any)).toBeNull();
  });
});

function spec(
  name: string,
  display_name: string,
  language: string | null,
  cocalc?: Record<string, any>,
) {
  const obj: any = { name, display_name };
  if (language != null) obj.language = language;
  if (cocalc != null) obj.metadata = { cocalc };
  return immutable.fromJS(obj);
}

describe("get_kernels_by_name_or_language", () => {
  it("filters out disabled: true (truly hidden)", () => {
    const ks = immutable.List([
      spec("a", "A", "python"),
      spec("b", "B", "python", { disabled: true }),
    ]);
    const [byName, byLang] = get_kernels_by_name_or_language(ks as any);
    expect(byName.has("a")).toBe(true);
    expect(byName.has("b")).toBe(false);
    expect(byLang.get("python")?.toJS()).toEqual(["a"]);
  });

  it("keeps priority < 0 kernels visible (deprecated, still selectable)", () => {
    const ks = immutable.List([
      spec("a", "A", "python"),
      spec("dep", "Deprecated", "python", { priority: -1 }),
    ]);
    const [byName, byLang] = get_kernels_by_name_or_language(ks as any);
    expect(byName.has("dep")).toBe(true);
    expect(byLang.get("python")?.toJS()).toContain("dep");
  });

  it("groups kernels with no language under 'misc'", () => {
    const ks = immutable.List([spec("nolang", "NoLang", null)]);
    const [, byLang] = get_kernels_by_name_or_language(ks as any);
    expect(byLang.get("misc")?.toJS()).toEqual(["nolang"]);
  });
});
