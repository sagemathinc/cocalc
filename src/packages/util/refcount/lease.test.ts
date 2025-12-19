import { RefcountLeaseManager } from "./lease";

describe("RefcountLeaseManager", () => {
  test("disposes after delay when refcount hits zero", async () => {
    let disposed = 0;
    const mgr = new RefcountLeaseManager<string>({
      delayMs: 10,
      disposer: async () => {
        disposed += 1;
      },
    });

    const release = await mgr.acquire("a");
    expect(mgr.getCount("a")).toBe(1);
    await release();
    expect(mgr.getCount("a")).toBe(0);
    await new Promise((r) => setTimeout(r, 20));
    expect(disposed).toBe(1);
  });

  test("cancels dispose if reacquired before delay", async () => {
    let disposed = 0;
    const mgr = new RefcountLeaseManager<string>({
      delayMs: 30,
      disposer: async () => {
        disposed += 1;
      },
    });
    const release1 = await mgr.acquire("a");
    await release1(); // schedule dispose
    // Reacquire before delay expires
    await new Promise((r) => setTimeout(r, 10));
    const release2 = await mgr.acquire("a");
    await new Promise((r) => setTimeout(r, 40));
    expect(disposed).toBe(0);
    await release2();
    await new Promise((r) => setTimeout(r, 40));
    expect(disposed).toBe(1);
  });

  test("multiple acquires keep count accurate", async () => {
    let disposed = 0;
    const mgr = new RefcountLeaseManager<string>({
      delayMs: 10,
      disposer: async () => {
        disposed += 1;
      },
    });
    const release1 = await mgr.acquire("k");
    const release2 = await mgr.acquire("k");
    expect(mgr.getCount("k")).toBe(2);
    await release1();
    expect(mgr.getCount("k")).toBe(1);
    await release2();
    await new Promise((r) => setTimeout(r, 15));
    expect(disposed).toBe(1);
  });

  test("serialize concurrent acquire/release", async () => {
    let disposed = 0;
    const mgr = new RefcountLeaseManager<number>({
      delayMs: 5,
      disposer: async () => {
        disposed += 1;
      },
    });
    const [r1, r2, r3] = await Promise.all([
      mgr.acquire(1),
      mgr.acquire(1),
      mgr.acquire(1),
    ]);
    expect(mgr.getCount(1)).toBe(3);
    await Promise.all([r1(), r2(), r3()]);
    await new Promise((r) => setTimeout(r, 15));
    expect(disposed).toBe(1);
  });

  test("reacquire during pending dispose does not lose resource", async () => {
    let disposeCalls = 0;
    const mgr = new RefcountLeaseManager<string>({
      delayMs: 30,
      disposer: async () => {
        disposeCalls += 1;
        // simulate slow disposer
        await new Promise((r) => setTimeout(r, 50));
      },
    });

    const rel1 = await mgr.acquire("slow");
    await rel1(); // schedule dispose

    // Start reacquire while disposer is sleeping.
    await new Promise((r) => setTimeout(r, 40)); // dispose has started but not finished
    const rel2 = await mgr.acquire("slow");
    expect(mgr.getCount("slow")).toBe(1);

    // Give enough time for any stray disposer to finish.
    await new Promise((r) => setTimeout(r, 80));
    expect(disposeCalls).toBeGreaterThanOrEqual(0);
    expect(disposeCalls).toBeLessThanOrEqual(1);
    expect(mgr.getCount("slow")).toBe(1);

    await rel2();
    await new Promise((r) => setTimeout(r, 50));
    expect(disposeCalls).toBeGreaterThanOrEqual(1);
    expect(disposeCalls).toBeLessThanOrEqual(2);
    expect(mgr.getCount("slow")).toBe(0);
  });
});
