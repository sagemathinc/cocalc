/*
Illustrate and test behavior when there is conflict.

TODO: we must get noAutosave to fully work so we can make
the tests of conflicts, etc., better.

E.g, the test below WILL RANDOMLY FAIL right now due to autosave randomness...
*/

import {
  before,
  after,
  uuid,
  connect,
  server,
  once,
  delay,
  waitUntilSynced,
} from "./setup";
import { split } from "@cocalc/util/misc";

beforeAll(before);
afterAll(after);

const GAP_DELAY = 50;

describe("synchronized editing with branching and merging", () => {
  const project_id = uuid();
  let s1, s2, client1, client2;

  it("creates two clients", async () => {
    client1 = connect();
    client2 = connect();
    s1 = client1.sync.string({
      project_id,
      path: "a.txt",
      service: server.service,
      noAutosave: true,
    });
    await once(s1, "ready");

    s2 = client2.sync.string({
      project_id,
      path: "a.txt",
      service: server.service,
      noAutosave: true,
    });
    await once(s2, "ready");
    expect(s1.to_str()).toBe("");
    expect(s2.to_str()).toBe("");
    expect(s1 === s2).toBe(false);
  });

  it("both clients set the first version independently and inconsistently", async () => {
    s2.from_str("y");
    s1.from_str("x");
    s1.commit();
    // delay so s2's time is always bigger than s1's so our unit test
    // is well defined
    await delay(GAP_DELAY);
    s2.commit();
    await s1.save();
    await s2.save();
  });

  it("wait until both clients see two heads", async () => {
    await waitUntilSynced([s1, s2]);
    const heads1 = s1.patch_list.getHeads();
    const heads2 = s2.patch_list.getHeads();
    expect(heads1.length).toBe(2);
    expect(heads2.length).toBe(2);
    expect(heads1).toEqual(heads2);
  });

  it("get the current value, which is a merge", () => {
    const v1 = s1.to_str();
    const v2 = s2.to_str();
    expect(v1).toEqual("xy");
    expect(v2).toEqual("xy");
  });

  it("commit current value and see that there is a new single head that both share, thus resolving the merge in this way", async () => {
    s1.commit();
    await s1.save();
    await waitUntilSynced([s1, s2]);
    const heads1 = s1.patch_list.getHeads();
    const heads2 = s2.patch_list.getHeads();
    expect(heads1.length).toBe(1);
    expect(heads2.length).toBe(1);
    expect(heads1).toEqual(heads2);
  });

  it("set values inconsistently again and explicitly resolve the merge conflict in a way that is different than the default", async () => {
    s1.from_str("xy1");
    s1.commit();
    await delay(GAP_DELAY);
    s2.from_str("xy2");
    s2.commit();
    await s1.save();
    await s2.save();

    await waitUntilSynced([s1, s2]);
    expect(s1.to_str()).toEqual("xy12");
    expect(s2.to_str()).toEqual("xy12");

    // resolve the conflict in our own way
    s1.from_str("xy3");
    s1.commit();
    await s1.save();
    await waitUntilSynced([s1, s2]);

    // everybody has this state now
    expect(s1.to_str()).toEqual("xy3");
    expect(s2.to_str()).toEqual("xy3");
  });
});

describe("do the example in the blog post 'Lies I was Told About Collaborative Editing, Part 1: Algorithms for offline editing' -- https://www.moment.dev/blog/lies-i-was-told-pt-1", () => {
  const project_id = uuid();
  let client1, client2;

  async function getInitialState(path: string) {
    client1 ??= connect();
    client2 ??= connect();
    client1
      .fs({ project_id, service: server.service })
      .writeFile(path, "The Color of Pomegranates");
    const alice = client1.sync.string({
      project_id,
      path,
      service: server.service,
      noAutosave: true,
    });
    await once(alice, "ready");
    await alice.save();

    const bob = client2.sync.string({
      project_id,
      path,
      service: server.service,
      noAutosave: true,
    });
    await once(bob, "ready");
    await bob.save();
    await waitUntilSynced([bob, alice]);

    return { alice, bob };
  }

  let alice, bob;
  it("creates two clients", async () => {
    ({ alice, bob } = await getInitialState("first.txt"));
    expect(alice.to_str()).toEqual("The Color of Pomegranates");
    expect(bob.to_str()).toEqual("The Color of Pomegranates");
  });

  it("Bob changes the spelling of Color to the British Colour and unaware Alice deletes all of the text.", async () => {
    bob.from_str("The Colour of Pomegranates");
    bob.commit();
    alice.from_str("");
    alice.commit();
  });

  it("Both come back online -- the resolution is the empty (with either order above) string because the **best effort** application of inserting the u (with context) to either is a no-op.", async () => {
    await bob.save();
    await alice.save();
    await waitUntilSynced([bob, alice]);
    expect(alice.to_str()).toEqual("");
    expect(bob.to_str()).toEqual("");
  });

  it("the important thing about the cocalc approach is that a consistent history is saved, so everybody knows precisely what happened. **I.e., the fact that at one point Bob adding a British u is not lost to either party!**", () => {
    const v = alice.versions();
    const x = v.map((t) => alice.version(t).to_str());
    expect(new Set(x)).toEqual(
      new Set(["The Color of Pomegranates", "The Colour of Pomegranates", ""]),
    );

    const w = alice.versions();
    const y = w.map((t) => bob.version(t).to_str());
    expect(y).toEqual(x);
  });

  it("reset -- create alicea and bob again", async () => {
    ({ alice, bob } = await getInitialState("second.txt"));
  });

  // opposite order this time
  it("Bob changes the spelling of Color to the British Colour and unaware Alice deletes all of the text.", async () => {
    alice.from_str("");
    alice.commit();
    bob.from_str("The Colour of Pomegranates");
    bob.commit();
  });

  it("both empty again", async () => {
    await bob.save();
    await alice.save();
    await waitUntilSynced([bob, alice]);
    expect(alice.to_str()).toEqual("");
    expect(bob.to_str()).toEqual("");
  });

  it("There are two heads; either client can resolve the merge conflict.", async () => {
    expect(alice.patch_list.getHeads().length).toBe(2);
    expect(bob.patch_list.getHeads().length).toBe(2);
    bob.from_str("The Colour of Pomegranates");
    bob.commit();
    await bob.save();

    await waitUntilSynced([bob, alice]);
    expect(alice.to_str()).toEqual("The Colour of Pomegranates");
    expect(bob.to_str()).toEqual("The Colour of Pomegranates");
  });
});

const numHeads = 15;
describe(`create editing conflict with ${numHeads} heads`, () => {
  const project_id = uuid();
  let docs: any[] = [],
    clients: any[] = [];

  it(`create ${numHeads} clients`, async () => {
    const v: any[] = [];
    for (let i = 0; i < numHeads; i++) {
      const client = connect();
      clients.push(client);
      const doc = client.sync.string({
        project_id,
        path: "a.txt",
        service: server.service,
        noAutosave: true,
      });
      docs.push(doc);
      v.push(once(doc, "ready"));
    }
    await Promise.all(v);
  });

  it("every client writes a different value all at once", async () => {
    for (let i = 0; i < numHeads; i++) {
      docs[i].from_str(`${i} `);
      docs[i].commit();
      docs[i].save();
    }
    await waitUntilSynced(docs);
    const heads = docs[0].patch_list.getHeads();
    expect(heads.length).toBe(docs.length);
  });

  it("merge -- order is random, but value is consistent", async () => {
    const value = docs[0].to_str();
    let v = new Set<string>();
    for (let i = 0; i < numHeads; i++) {
      v.add(`${i}`);
      expect(docs[i].to_str()).toEqual(value);
    }
    const t = new Set(split(docs[0].to_str()));
    expect(t).toEqual(v);
  });

  it(`resolve the merge conflict -- all ${numHeads} clients then see the resolution`, async () => {
    let r = "";
    for (let i = 0; i < numHeads; i++) {
      r += `${i} `;
    }
    docs[0].from_str(r);
    docs[0].commit();
    await docs[0].save();

    await waitUntilSynced(docs);
    for (let i = 0; i < numHeads; i++) {
      expect(docs[i].to_str()).toEqual(r);
    }
    // docs[0].show_history();
  });
});
