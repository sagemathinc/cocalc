/*
DEVELOPMENT:

pnpm test ./patterns.test.ts
*/

import { randomId } from "@cocalc/conat/names";
import { Patterns } from "./patterns";
import { CacheStringSplitsPatterns } from "./patterns-cached";

function expectEqual(actual: any[], expected: any[]) {
  expect(actual).toEqual(expect.arrayContaining(expected));
  expect(actual).toHaveLength(expected.length);
}

// Test both implementations
const IMPL = [
  { name: "Patterns", class: Patterns },
  { name: "CacheStringSplitsPatterns", class: CacheStringSplitsPatterns },
];

IMPL.forEach(({ name, class: PatternClass }) => {
  describe(`test some basic pattern matching - ${name}`, () => {
    it("tests some simple examples with just one or no matches", () => {
      const p = new PatternClass();
      p.set("x", 0);
      p.set("a.b.>", 0);
      p.set("a.*", 0);
      expectEqual(p.matches("x"), ["x"]);
      expectEqual(p.matches("y"), []);
      expectEqual(p.matches("a.b.c"), ["a.b.>"]);
      expectEqual(p.matches("a.b"), ["a.*"]);
    });

    it("some examples with several matches", () => {
      const p = new PatternClass();
      p.set("a.b.>", 0);
      p.set("a.*.*", 0);
      expectEqual(p.matches("a.b.c"), ["a.b.>", "a.*.*"]);
      expectEqual(p.matches("a.b.c.d"), ["a.b.>"]);
    });

    it("example where we delete a pattern", () => {
      const p = new PatternClass();
      p.set("a.b.>", 0);
      p.set("a.b.c", 0);
      p.set("a.b.d", 0);
      expectEqual(p.matches("a.b.c"), ["a.b.>", "a.b.c"]);
      expectEqual(p.matches("a.b.d"), ["a.b.>", "a.b.d"]);
      expectEqual(p.matches("a.b.c.d"), ["a.b.>"]);
      p.delete("a.b.c");
      expectEqual(p.matches("a.b.d"), ["a.b.>", "a.b.d"]);
      expectEqual(p.matches("a.b.c"), ["a.b.>"]);
      p.delete("a.b.d");
      expectEqual(p.matches("a.b.d"), ["a.b.>"]);
      p.delete("a.b.>");
      expectEqual(p.matches("a.b.d"), []);
    });
  });
});

IMPL.forEach(({ name, class: PatternClass }) => {
  describe(`do some stress tests - ${name}`, () => {
    // NOTE: CacheStringSplitsPatterns may be slower in this stress test due to workload characteristics.
    // This test uses highly diverse random patterns (service.*.randomId, hub.x.randomId) which
    // pollute the split cache with many unique subjects, making cache overhead outweigh benefits.
    // In contrast, realistic CoCalc patterns (hub.account.{id}.{service}) with repeated segments
    // show 8% improvement due to high cache hit rates. The optimization is workload-dependent.
    const patterns = 1e5;

    let p;
    const knownIds: string[] = [];
    it(`create ${patterns} patterns`, () => {
      p = new PatternClass();
      for (const seg1 of ["service", "hub", "project", "account", "global"]) {
        for (const seg2 of ["*", "x"]) {
          for (let i = 0; i < patterns / 10; i++) {
            const id = randomId();
            knownIds.push(id);
            const pattern = `${seg1}.${seg2}.${id}`;
            p.set(pattern, 0);
          }
        }
      }
    });

    const count = 1e6;
    let m = 0;
    it(`match ${count} times against them`, () => {
      for (const seg1 of ["service", "hub", "project", "account", "global"]) {
        for (const seg2 of ["a", "x"]) {
          for (let i = 0; i < count / 10; i++) {
            const subject = `${seg1}.${seg2}.${knownIds[i] ?? randomId()}`;
            m = Math.max(p.matches(subject).length, m);
          }
        }
      }
      expect(m).toBeGreaterThan(0);
    });
  });
});
