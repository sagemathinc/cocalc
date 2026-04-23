/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Tests for BuildCoordinator — the DKV-based build lifecycle coordination
across multiple clients.

The mock DKV simulates the real DKV's behavior:
- get/set/delete operate on an in-memory map
- set/delete fire "change" events synchronously (self-echo)
- The dkv() factory returns a promise, allowing tests to control
  init timing (pre-init buffering vs post-init direct calls)

Note: the real ephemeral DKV does not reliably surface deletes to connected
clients, so the coordinator uses a visible "finished" state for completion.
*/

import {
  BuildCoordinator,
  type BuildCoordinatorCallbacks,
} from "./build-coordinator";

// ---------------------------------------------------------------------------
// Mock DKV
// ---------------------------------------------------------------------------

type ChangeHandler = (event: { key: string; value: any; prev: any }) => void;

class MockDKV {
  private data = new Map<string, any>();
  private listeners: ChangeHandler[] = [];
  closed = false;

  get(key: string) {
    return this.data.get(key);
  }

  set(key: string, value: any) {
    const prev = this.data.get(key);
    this.data.set(key, value);
    for (const fn of this.listeners) {
      fn({ key, value, prev });
    }
  }

  delete(key: string) {
    const prev = this.data.get(key);
    if (prev !== undefined) {
      this.data.delete(key);
      for (const fn of this.listeners) {
        fn({ key, value: undefined, prev });
      }
    }
  }

  on(event: string, handler: ChangeHandler) {
    if (event === "change") this.listeners.push(handler);
  }

  off(event: string, handler: ChangeHandler) {
    if (event === "change") {
      this.listeners = this.listeners.filter((fn) => fn !== handler);
    }
  }

  close() {
    this.closed = true;
  }
}

// Controls when the mocked dkv() promise resolves.
let mockDkvInstance: MockDKV;
let dkvResolve: (store: MockDKV) => void;
let dkvReject: (err: Error) => void;
let dkvPromise: Promise<MockDKV>;

function resetDkvMock() {
  mockDkvInstance = new MockDKV();
  dkvPromise = new Promise<MockDKV>((resolve, reject) => {
    dkvResolve = resolve;
    dkvReject = reject;
  });
}

// Mock the dkv module — jest.mock is hoisted above imports.
jest.mock("@cocalc/conat/sync/dkv", () => ({
  dkv: () => dkvPromise,
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Flush microtasks so async init() completes. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Resolve the DKV promise and wait for init to complete. */
async function initDkv(store?: MockDKV): Promise<MockDKV> {
  const s = store ?? mockDkvInstance;
  dkvResolve(s);
  await tick();
  return s;
}

/** Create a fresh set of mock callbacks with jest.fn() spies. */
function makeCallbacks(overrides?: Partial<BuildCoordinatorCallbacks>) {
  let building = false;
  const callbacks: BuildCoordinatorCallbacks = {
    join: jest.fn(async () => {}),
    stop: jest.fn(),
    isBuilding: jest.fn(() => building),
    setBuilding: jest.fn((v: boolean) => {
      building = v;
    }),
    setError: jest.fn(),
    ...overrides,
  };
  return callbacks;
}

/** Simulate a remote change event on the DKV (from another client). */
function emitRemoteChange(store: MockDKV, key: string, value: any, prev: any) {
  // Directly invoke listeners without modifying the store's data —
  // simulates a change arriving from a remote client.
  (store as any).listeners.forEach((fn: ChangeHandler) =>
    fn({ key, value, prev }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const PROJECT_ID = "test-project-id";
const PATH = "paper.tex";

beforeEach(() => {
  resetDkvMock();
  jest.clearAllMocks();
});

describe("BuildCoordinator", () => {
  // =========================================================================
  // Basic lifecycle
  // =========================================================================

  describe("basic lifecycle", () => {
    test("publishBuildStart writes to DKV after init", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 12345);

      expect(store.get(PATH)).toEqual({
        buildId: "b1",
        status: "running",
        aggregate: 12345,
        force: undefined,
        startedAt: expect.any(Number),
      });

      coord.close();
    });

    test('publishBuildFinished writes terminal "finished" state', async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 100);
      expect(store.get(PATH)).toBeDefined();

      coord.publishBuildFinished("b1");
      expect(store.get(PATH)).toEqual({
        buildId: "b1",
        status: "finished",
        aggregate: 100,
        force: undefined,
        startedAt: expect.any(Number),
      });

      coord.close();
    });

    test("publishBuildFinished does not overwrite another client's entry", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // Simulate another client's build already in the DKV
      store.set(PATH, {
        buildId: "remote-1",
        status: "running",
        aggregate: 99,
      });

      // Our build tries to clean up with a different buildId
      coord.publishBuildFinished("b1");

      // Remote entry must survive
      expect(store.get(PATH)?.buildId).toBe("remote-1");
      expect(store.get(PATH)?.status).toBe("running");

      coord.close();
    });
  });

  // =========================================================================
  // Self-echo filtering
  // =========================================================================

  describe("self-echo filtering", () => {
    test("local build start echo does not trigger join", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      // Simulate the initiator flow: setLocalBuildId THEN publishBuildStart.
      // The DKV set triggers a self-echo change event.  The coordinator
      // must recognize it as local and NOT call join().
      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 100);

      expect(cb.join).not.toHaveBeenCalled();

      coord.close();
    });

    test("local build finish echo does not set building=false for remote", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      // Local build lifecycle
      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 100);
      coord.publishBuildFinished("b1");

      // setBuilding(false) should NOT be called by handleBuildFinished
      // for a local build (only for remote builds we joined).
      // The initiator's build() method manages its own setBuilding.
      const setBuildingCalls = (cb.setBuilding as jest.Mock).mock.calls;
      const falseCalls = setBuildingCalls.filter(
        ([v]: [boolean]) => v === false,
      );
      expect(falseCalls.length).toBe(0);

      coord.close();
    });
  });

  // =========================================================================
  // Remote build joining
  // =========================================================================

  describe("remote build joining", () => {
    test("remote build start triggers join callback", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // Simulate a remote client starting a build
      emitRemoteChange(
        store,
        PATH,
        { buildId: "remote-1", status: "running", aggregate: 42, force: true },
        undefined,
      );

      expect(cb.join).toHaveBeenCalledWith(42, true);
      expect(cb.setBuilding).toHaveBeenCalledWith(true);

      coord.close();
    });

    test("remote build finish resets building state after join completes", async () => {
      const joinControl = { resolve: (_v?: unknown) => {} };
      const cb = makeCallbacks({
        join: jest.fn(
          () =>
            new Promise<void>((resolve) => {
              joinControl.resolve = resolve;
            }),
        ),
      });
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // Remote build starts
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );

      // Remote build finishes — but join() is still running,
      // so setBuilding(false) is deferred to joinBuild's finally block.
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "finished" },
        { buildId: "r1", status: "running" },
      );

      // Not yet — join is still pending
      expect(cb.setBuilding).not.toHaveBeenCalledWith(false);

      // Let the join promise resolve
      joinControl.resolve();
      await tick();

      // NOW setBuilding(false) should have been called by finally block
      expect(cb.setBuilding).toHaveBeenCalledWith(false);

      coord.close();
    });

    test("does not join if already building", async () => {
      const cb = makeCallbacks({
        isBuilding: jest.fn(() => true),
      });
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );

      expect(cb.join).not.toHaveBeenCalled();

      coord.close();
    });

    test("join error is reported via setError", async () => {
      const cb = makeCallbacks({
        join: jest.fn(async () => {
          throw new Error("build failed");
        }),
      });
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );
      await tick();

      expect(cb.setError).toHaveBeenCalledWith("Error: build failed");

      coord.close();
    });
  });

  // =========================================================================
  // Stop propagation
  // =========================================================================

  describe("stop propagation", () => {
    test("requestStop transitions running → stopping in DKV", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 100);

      coord.requestStop();

      expect(store.get(PATH)?.status).toBe("stopping");
      expect(store.get(PATH)?.buildId).toBe("b1");

      coord.close();
    });

    test("stopping status triggers stop callback for active build id", async () => {
      const cb = makeCallbacks({ isBuilding: jest.fn(() => true) });
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();
      coord.setLocalBuildId("r1");

      // Simulate receiving a stop from remote
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "stopping" },
        { buildId: "r1", status: "running" },
      );

      expect(cb.stop).toHaveBeenCalled();

      coord.close();
    });

    test("stale stopping status does not stop a newer active build", async () => {
      const cb = makeCallbacks({ isBuilding: jest.fn(() => true) });
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();
      coord.setLocalBuildId("new-build");

      // A stale stop for an older build must not stop the current build.
      emitRemoteChange(
        store,
        PATH,
        { buildId: "old-build", status: "stopping" },
        { buildId: "old-build", status: "running" },
      );

      expect(cb.stop).not.toHaveBeenCalled();

      coord.close();
    });

    test("requestStop is no-op without an active build", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // No build active — requestStop should not throw or write
      coord.requestStop();

      expect(store.get(PATH)).toBeUndefined();

      coord.close();
    });
  });

  // =========================================================================
  // Late joiner
  // =========================================================================

  describe("late joiner", () => {
    test("joins a build that was already running when DKV inits", async () => {
      const cb = makeCallbacks();

      // Pre-populate the DKV with a running build BEFORE coordinator inits
      mockDkvInstance.set(PATH, {
        buildId: "already-running",
        status: "running",
        aggregate: 77,
        force: false,
      });

      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      expect(cb.join).toHaveBeenCalledWith(77, false);
      expect(cb.setBuilding).toHaveBeenCalledWith(true);

      coord.close();
    });

    test("passes force flag from existing DKV entry to join", async () => {
      const cb = makeCallbacks();

      mockDkvInstance.set(PATH, {
        buildId: "force-build",
        status: "running",
        aggregate: 55,
        force: true,
      });

      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      expect(cb.join).toHaveBeenCalledWith(55, true);

      coord.close();
    });

    test("does not join a build in stopping state", async () => {
      const cb = makeCallbacks();

      // Build is being stopped — late joiner should NOT join
      mockDkvInstance.set(PATH, {
        buildId: "stopping-build",
        status: "stopping",
        aggregate: 10,
      });

      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      expect(cb.join).not.toHaveBeenCalled();

      coord.close();
    });

    test("does not join a build in finished state", async () => {
      const cb = makeCallbacks();

      mockDkvInstance.set(PATH, {
        buildId: "finished-build",
        status: "finished",
        aggregate: 10,
      });

      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      expect(cb.join).not.toHaveBeenCalled();

      coord.close();
    });

    test("clears a stale 'running' entry instead of joining (age > 20 min)", async () => {
      const cb = makeCallbacks();

      // Entry from a crashed/disconnected originator: status "running"
      // but startedAt is far in the past. The late joiner must NOT
      // attempt to join (that would re-run the same hang); instead it
      // flips the entry to "finished" so peers clear too.
      mockDkvInstance.set(PATH, {
        buildId: "stranded",
        status: "running",
        aggregate: 1,
        startedAt: Date.now() - 30 * 60 * 1000,
      });

      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      expect(cb.join).not.toHaveBeenCalled();
      expect(cb.setBuilding).not.toHaveBeenCalledWith(true);
      expect(mockDkvInstance.get(PATH)).toEqual({
        buildId: "stranded",
        status: "finished",
        aggregate: 1,
        startedAt: expect.any(Number),
      });

      coord.close();
    });

    test("still joins a fresh 'running' entry (age < 20 min)", async () => {
      const cb = makeCallbacks();

      mockDkvInstance.set(PATH, {
        buildId: "fresh",
        status: "running",
        aggregate: 5,
        startedAt: Date.now() - 60 * 1000,
      });

      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      expect(cb.join).toHaveBeenCalledWith(5, false);

      coord.close();
    });

    test("does not join if already building locally", async () => {
      const cb = makeCallbacks({
        isBuilding: jest.fn(() => true),
      });

      mockDkvInstance.set(PATH, {
        buildId: "remote-build",
        status: "running",
        aggregate: 33,
      });

      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      // isBuilding() returns true, so join is skipped
      expect(cb.join).not.toHaveBeenCalled();

      coord.close();
    });

    test("does not join own build on late init", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);

      // Simulate: user clicked Build before DKV was ready.
      // Both setLocalBuildId and publishBuildStart are called,
      // with the start buffered for flush on init.
      coord.setLocalBuildId("my-build");
      coord.publishBuildStart("my-build", 100);

      await initDkv();

      // The buffered start should have flushed to the DKV
      expect(mockDkvInstance.get(PATH)?.buildId).toBe("my-build");

      // Should NOT join our own build (self-echo filtered by _localBuildId)
      expect(cb.join).not.toHaveBeenCalled();

      coord.close();
    });

    test("join completes and resets building state", async () => {
      const cb = makeCallbacks();

      mockDkvInstance.set(PATH, {
        buildId: "r1",
        status: "running",
        aggregate: 42,
      });

      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      await initDkv();

      // join was called and the async joinBuild wrapper should
      // set building=true before and building=false after
      expect(cb.setBuilding).toHaveBeenCalledWith(true);

      // Let the join promise resolve
      await tick();

      // After join completes, building should be reset
      const calls = (cb.setBuilding as jest.Mock).mock.calls;
      expect(calls[calls.length - 1]).toEqual([false]);

      coord.close();
    });
  });

  // =========================================================================
  // Buffered operations (DKV not yet ready)
  // =========================================================================

  describe("buffered operations", () => {
    test("ops are buffered before DKV init and flushed after", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);

      // DKV not ready yet — these should buffer
      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 200);

      // Store is empty because DKV hasn't initialized
      expect(mockDkvInstance.get(PATH)).toBeUndefined();

      // Now init completes — buffered ops should flush
      await initDkv();

      expect(mockDkvInstance.get(PATH)).toEqual({
        buildId: "b1",
        status: "running",
        aggregate: 200,
        force: undefined,
        startedAt: expect.any(Number),
      });

      coord.close();
    });

    test("build finished during init drops stale buffered ops", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);

      // Build starts and finishes while DKV is still initializing
      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 200);
      coord.publishBuildFinished("b1");

      // Now init completes — stale ops should have been dropped
      await initDkv();

      // No entry should exist (start was dropped, finish cleared buffer)
      expect(mockDkvInstance.get(PATH)).toBeUndefined();

      coord.close();
    });

    test("force-rebuild preserves newer build ops in buffer", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);

      // Build A starts
      coord.setLocalBuildId("a");
      coord.publishBuildStart("a", 100);

      // Force-rebuild: Build B starts (overwriting _localBuildId)
      coord.setLocalBuildId("b");
      coord.publishBuildStart("b", 200);

      // Build A finishes — should NOT drop B's start op
      coord.publishBuildFinished("a");

      // DKV init completes — B's start should flush
      await initDkv();

      // The DKV should have build B (A's start was overwritten by B's)
      expect(mockDkvInstance.get(PATH)?.buildId).toBe("b");

      coord.close();
    });

    test("ops after DKV init failure are true no-ops", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);

      // DKV init fails
      dkvReject(new Error("connection failed"));
      await tick();

      // These should be silent no-ops — no crash, no callbacks invoked
      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 100);
      coord.publishBuildFinished("b1");
      coord.requestStop();

      // No build callbacks should have been triggered
      expect(cb.join).not.toHaveBeenCalled();
      expect(cb.stop).not.toHaveBeenCalled();
      expect(cb.setBuilding).not.toHaveBeenCalled();

      coord.close();
    });
  });

  // =========================================================================
  // publishBuildFinished edge cases
  // =========================================================================

  describe("publishBuildFinished edge cases", () => {
    test("entry already gone — clears _localBuildId immediately", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      coord.setLocalBuildId("b1");
      // Don't publishBuildStart — entry was never written

      coord.publishBuildFinished("b1");

      // Prove _localBuildId was cleared: a remote build reusing the same
      // buildId "b1" must trigger join (not filtered as a local echo).
      emitRemoteChange(
        store,
        PATH,
        { buildId: "b1", status: "running", aggregate: 50 },
        undefined,
      );
      expect(cb.join).toHaveBeenCalledWith(50, false);

      coord.close();
    });

    test("entry overwritten by another client — clears _localBuildId", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      coord.setLocalBuildId("b1");
      coord.publishBuildStart("b1", 100);

      // Another client overwrites our entry
      // (bypass self-echo by directly setting without triggering coordinator)
      (store as any).data.set(PATH, {
        buildId: "remote-x",
        status: "running",
        aggregate: 999,
      });

      coord.publishBuildFinished("b1");

      // Remote entry must survive (we didn't delete it)
      expect(store.get(PATH)?.buildId).toBe("remote-x");

      // Prove _localBuildId was cleared: a remote build reusing "b1"
      // must trigger join (not filtered as a local echo).
      emitRemoteChange(
        store,
        PATH,
        { buildId: "b1", status: "running", aggregate: 77 },
        undefined,
      );
      expect(cb.join).toHaveBeenCalledWith(77, false);

      coord.close();
    });
  });

  // =========================================================================
  // Close / cleanup
  // =========================================================================

  describe("close", () => {
    test("close before DKV init completes does not crash", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);

      // Close immediately, before DKV resolves
      coord.close();

      // Now resolve — should not throw or leak listeners
      dkvResolve(mockDkvInstance);
      await tick();

      // The DKV store should have been closed
      expect(mockDkvInstance.closed).toBe(true);
    });

    test("close detaches change listener", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // Verify listener is attached
      expect((store as any).listeners.length).toBe(1);

      coord.close();

      // Listener should be detached
      expect((store as any).listeners.length).toBe(0);
    });

    test("events after close are ignored", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      coord.close();

      // Simulate a remote change after close — should not trigger callbacks
      // (listener was detached)
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );

      expect(cb.join).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Join lifecycle race conditions
  // =========================================================================

  describe("join lifecycle races (P1 fix)", () => {
    test("build-finished during active join does not clear building state", async () => {
      // This tests the P1 race: originator finishes (deletes DKV entry)
      // while our joinBuild's join() callback is still running.
      // handleBuildFinished must NOT call setBuilding(false) — that would
      // allow a concurrent joinBuild to start.

      const joinControl = { resolve: (_v?: unknown) => {} };
      const cb = makeCallbacks({
        join: jest.fn(
          () =>
            new Promise<void>((resolve) => {
              joinControl.resolve = resolve;
            }),
        ),
      });
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // Remote build starts → joinBuild begins, join() is pending
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 42 },
        undefined,
      );
      expect(cb.join).toHaveBeenCalledWith(42, false);
      expect(cb.setBuilding).toHaveBeenCalledWith(true);

      // Originator finishes WHILE our join() is still running
      (cb.setBuilding as jest.Mock).mockClear();
      emitRemoteChange(store, PATH, undefined, {
        buildId: "r1",
        status: "running",
      });

      // setBuilding(false) should NOT have been called yet — join is active
      expect(cb.setBuilding).not.toHaveBeenCalledWith(false);

      // Now the join completes — finally block should clean up
      joinControl.resolve();
      await tick();

      expect(cb.setBuilding).toHaveBeenCalledWith(false);

      coord.close();
    });

    test("new build-start during active join does not launch concurrent join", async () => {
      // Extension of P1: after handleBuildFinished is suppressed, a new
      // build-start arrives.  Since isBuilding() is still true (we didn't
      // prematurely clear it), the new start must be ignored.

      const joinControl = { resolve: (_v?: unknown) => {} };
      const cb = makeCallbacks({
        join: jest.fn(
          () =>
            new Promise<void>((resolve) => {
              joinControl.resolve = resolve;
            }),
        ),
      });
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // Remote build A starts → joinBuild begins
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );
      expect(cb.join).toHaveBeenCalledTimes(1);

      // Build A finishes (while join still running)
      emitRemoteChange(store, PATH, undefined, {
        buildId: "r1",
        status: "running",
      });

      // New build B starts — should NOT launch a second join because
      // isBuilding() is still true (the _joining guard prevented early clear)
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r2", status: "running", aggregate: 2 },
        undefined,
      );
      // Still only one join call — the second was blocked by isBuilding
      expect(cb.join).toHaveBeenCalledTimes(1);

      // Clean up
      joinControl.resolve();
      await tick();

      coord.close();
    });
  });

  // =========================================================================
  // Change event filtering (ignores other paths)
  // =========================================================================

  describe("path filtering", () => {
    test("ignores changes for different file paths", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // Change for a different path
      emitRemoteChange(
        store,
        "other-file.tex",
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );

      expect(cb.join).not.toHaveBeenCalled();

      coord.close();
    });
  });

  // =========================================================================
  // State machine transitions
  // =========================================================================

  describe("state machine", () => {
    test("running → stopping → finished lifecycle", async () => {
      // Use a controlled join promise so we can emit all three events
      // while the join is still active, then verify cleanup on resolve.
      const joinControl = { resolve: (_v?: unknown) => {} };
      const cb = makeCallbacks({
        join: jest.fn(
          () =>
            new Promise<void>((resolve) => {
              joinControl.resolve = resolve;
            }),
        ),
      });
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // running — triggers join
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );
      expect(cb.join).toHaveBeenCalled();
      expect(cb.setBuilding).toHaveBeenCalledWith(true);

      // running → stopping — triggers stop callback
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "stopping" },
        { buildId: "r1", status: "running" },
      );
      expect(cb.stop).toHaveBeenCalled();

      // stopping → finished — _joining guard defers setBuilding(false)
      (cb.setBuilding as jest.Mock).mockClear();
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "finished" },
        { buildId: "r1", status: "stopping" },
      );

      // Resolve join and let finally block run
      joinControl.resolve();
      await tick();

      // finally block calls setBuilding(false) for the finished phase
      expect(cb.setBuilding).toHaveBeenCalledWith(false);

      coord.close();
    });

    test("running → running with new buildId triggers join (P2 fix)", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // First remote build
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );
      expect(cb.join).toHaveBeenCalledTimes(1);

      // Allow join to complete so isBuilding resets
      await tick();

      // Second remote build (different buildId, prev was running).
      // This can happen when DKV batches two writes into a single
      // change event (start(A) → delete(A) → start(B) coalesced).
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r2", status: "running", aggregate: 2 },
        { buildId: "r1", status: "running" },
      );
      // With the P2 fix, the buildId change is detected as a new start
      expect(cb.join).toHaveBeenCalledTimes(2);
      expect(cb.join).toHaveBeenLastCalledWith(2, false);

      coord.close();
    });

    test("running → running with SAME buildId does not re-trigger join", async () => {
      const cb = makeCallbacks();
      const coord = new BuildCoordinator(PROJECT_ID, PATH, cb);
      const store = await initDkv();

      // Remote build starts
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        undefined,
      );
      expect(cb.join).toHaveBeenCalledTimes(1);

      // Allow join to complete
      await tick();

      // Same buildId echoed again (e.g., DKV re-sync) — no new join
      emitRemoteChange(
        store,
        PATH,
        { buildId: "r1", status: "running", aggregate: 1 },
        { buildId: "r1", status: "running" },
      );
      expect(cb.join).toHaveBeenCalledTimes(1);

      coord.close();
    });
  });
});
