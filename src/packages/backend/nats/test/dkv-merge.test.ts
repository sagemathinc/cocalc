// Testing merge conflicts with dkv
// pnpm exec jest --watch --forceExit --detectOpenHandles "dkv-merge.test.ts"

import { dkv as createDkv } from "@cocalc/backend/nats/sync";
import { once } from "@cocalc/util/async-utils";
//import { delay } from "awaiting";

async function getKvs(opts?) {
  const name = `test-${Math.random()}`;
  // We disable autosave so that we have more precise control of how conflicts
  // get resolved, etc. for testing purposes.
  const kv1 = await createDkv(
    { name, noAutosave: true, ...opts },
    { noCache: true },
  );
  const kv2 = await createDkv(
    { name, noAutosave: true, ...opts },
    { noCache: true },
  );
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

describe("test a sophisticated 3-way merge of strings conflict resolution function", () => {
  it("sets up and resolves a merge conflict", async () => {
    const { kv1, kv2 } = await getKvs({
      merge: ({ local, remote, prev = "" }) => {
        // our merge strategy is to replace the value by 'conflict'
        return `${local}${remote}${prev}`;
      },
    });
    kv1.set("x", 'cocalc');
    await kv1.save();
    if (kv2["x"] != "cocalc") {
      // might have to wait
      await once(kv2, "change");
    }
    expect(kv2["x"]).toEqual("cocalc");


  });
});
