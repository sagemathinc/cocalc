/*
Testing merge conflicts with dkv

DEVELOPMENT:

pnpm test ./dkv-merge.test.ts

*/

import { dkv as createDkv } from "@cocalc/backend/conat/sync";
import { once } from "@cocalc/util/async-utils";
import { diff_match_patch } from "@cocalc/util/dmp";
import { before, after } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

async function getKvs(opts?) {
  const name = `test${Math.round(1000 * Math.random())}`;
  // We disable autosave so that we have more precise control of how conflicts
  // get resolved, etc. for testing purposes.
  const kv1 = await createDkv({
    name,
    noAutosave: true,
    ...opts,
    noCache: true,
  });
  const kv2 = await createDkv({
    name,
    noAutosave: true,
    ...opts,
    noCache: true,
  });
  // @ts-ignore -- a little double check
  if (kv1.kv === kv2.kv) {
    throw Error("must not being using same underlying kv");
  }
  return { kv1, kv2 };
}

describe("test the default 'local first' merge conflict resolution function", () => {
  it("sets up and resolves a merge conflict", async () => {
    const { kv1, kv2 } = await getKvs();
    kv1.set("x", 5);
    kv2.set("x", 10);
    expect(kv1["x"]).toEqual(5);
    expect(kv2["x"]).toEqual(10);

    // now make kv2 save, which makes kv1 detect a conflict:
    await kv2.save();
    // kv1 just resolves it in its own favor.
    expect(kv1["x"]).toEqual(5);
    await kv1.save();

    // wait until kv2 gets a change, which will be learning about
    // how the merge conflict got resolved.
    if (kv2.get("x") != 5) {
      // might have to wait
      await once(kv2, "change");
    }
    expect(kv2["x"]).toEqual(5);
  });
});

describe("test the default 'local first' merge conflict resolution function, but where we do the sets in the opposite order", () => {
  it("sets up and resolves a merge conflict", async () => {
    const { kv1, kv2 } = await getKvs();
    kv2.set("x", 10);
    kv1.set("x", 5);
    expect(kv1["x"]).toEqual(5);
    expect(kv2["x"]).toEqual(10);

    // now make kv2 save, which makes kv1 detect a conflict:
    await kv2.save();
    // kv1 just resolves it in its own favor.
    expect(kv1["x"]).toEqual(5);
    await kv1.save();

    // wait until kv2 gets a change, which will be learning about
    // how the merge conflict got resolved.
    if (kv2.get("x") != 5) {
      // might have to wait
      await once(kv2, "change");
    }
    expect(kv2["x"]).toEqual(5);
  });
});

describe("test a trivial merge conflict resolution function", () => {
  it("sets up and resolves a merge conflict", async () => {
    const { kv1, kv2 } = await getKvs({
      merge: () => {
        // our merge strategy is to replace the value by 'conflict'
        return "conflict";
      },
    });
    kv1.set("x", 5);
    kv2.set("x", 10);
    expect(kv1["x"]).toEqual(5);
    expect(kv2["x"]).toEqual(10);

    // now make kv2 save, which makes kv1 detect a conflict:
    await kv2.save();
    if (kv1["x"] != "conflict") {
      // might have to wait
      await once(kv1, "change");
    }
    expect(kv1["x"]).toEqual("conflict");

    await kv1.save();
    // wait until kv2 gets a change, which will be learning about
    // how the merge conflict got resolved.
    if (kv2["x"] != "conflict") {
      // might have to wait
      await once(kv2, "change");
    }
    expect(kv2["x"]).toEqual("conflict");
  });
});

describe("test a 3-way merge of strings conflict resolution function", () => {
  const dmp = new diff_match_patch();
  const threeWayMerge = (opts: {
    prev: string;
    local: string;
    remote: string;
  }) => {
    return dmp.patch_apply(
      dmp.patch_make(opts.prev, opts.local),
      opts.remote,
    )[0];
  };
  it("sets up and resolves a merge conflict", async () => {
    const { kv1, kv2 } = await getKvs({
      merge: ({ local, remote, prev = "" }) => {
        // our merge strategy is to replace the value by 'conflict'
        return threeWayMerge({ local, remote, prev });
      },
    });
    kv1.set("x", "cocalc");
    await kv1.save();
    if (kv2["x"] != "cocalc") {
      // might have to wait
      await once(kv2, "change");
    }
    expect(kv2["x"]).toEqual("cocalc");
    await kv2.save();

    kv2.set("x", "cocalc!");
    kv1.set("x", "LOVE cocalc");
    await kv2.save();
    if (kv1.get("x") != "LOVE cocalc!") {
      await once(kv1, "change");
    }
    expect(kv1.get("x")).toEqual("LOVE cocalc!");
    await kv1.save();
    if (kv2.get("x") != "LOVE cocalc!") {
      await once(kv2, "change");
    }
    expect(kv2.get("x")).toEqual("LOVE cocalc!");
  });
});

describe("test a 3-way merge of that merges objects", () => {
  it("sets up and resolves a merge conflict", async () => {
    const { kv1, kv2 } = await getKvs({
      merge: ({ local, remote }) => {
        return { ...remote, ...local };
      },
    });
    kv1.set("x", { a: 5 });
    await kv1.save();
    if (kv2["x"] == null) {
      await once(kv2, "change");
    }
    expect(kv2["x"]).toEqual({ a: 5 });

    kv1.set("x", { a: 5, b: 15, c: 12 });
    kv2.set("x", { a: 5, b: 7, d: 3 });
    await kv2.save();
    if (kv1.get("x").d != 3) {
      await once(kv1, "change");
    }
    expect(kv1.get("x")).toEqual({ a: 5, b: 15, c: 12, d: 3 });
    await kv1.save();
    if (kv2.get("x").b != 15) {
      await once(kv2, "change");
    }
    expect(kv2.get("x")).toEqual({ a: 5, b: 15, c: 12, d: 3 });
  });
});

afterAll(after);
