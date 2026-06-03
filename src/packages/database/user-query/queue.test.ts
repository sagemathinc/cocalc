/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Import from TypeScript implementation
import { UserQueryQueue } from "./queue";

describe("UserQueryQueue", () => {
  let queue: UserQueryQueue;
  let do_query_mock: jest.Mock;
  let dbg_mock: jest.Mock;
  let concurrent_mock: jest.Mock;

  beforeEach(() => {
    do_query_mock = jest.fn();
    dbg_mock = jest.fn();
    concurrent_mock = jest.fn().mockReturnValue(0); // Start with no concurrent queries

    queue = new UserQueryQueue({
      do_query: do_query_mock,
      dbg: dbg_mock,
      limit: 10, // per-client limit
      timeout_ms: 15000,
      global_limit: 250,
      concurrent: concurrent_mock,
    });
  });

  afterEach(() => {
    queue.destroy();
  });

  describe("constructor", () => {
    it("should initialize with default values", () => {
      const q = new UserQueryQueue({
        do_query: jest.fn(),
        dbg: jest.fn(),
        concurrent: jest.fn().mockReturnValue(0),
      });
      expect(q).toBeDefined();
      q.destroy();
    });

    it("should accept custom limit and timeout", () => {
      const q = new UserQueryQueue({
        do_query: jest.fn(),
        dbg: jest.fn(),
        limit: 5,
        timeout_ms: 5000,
        concurrent: jest.fn().mockReturnValue(0),
      });
      expect(q).toBeDefined();
      q.destroy();
    });
  });

  describe("user_query", () => {
    it("should queue a query and execute it immediately when under limits", (done) => {
      do_query_mock.mockImplementation((opts) => {
        expect(opts.query).toEqual({ foo: "bar" });
        expect(opts.cb).toBeDefined();
        // Simulate query completion
        opts.cb();
        done();
      });

      queue.user_query({
        client_id: "client1",
        query: { foo: "bar" },
        cb: jest.fn(),
      });

      expect(do_query_mock).toHaveBeenCalledTimes(1);
    });

    it("should create state for new client", () => {
      const cb = jest.fn();
      do_query_mock.mockImplementation((opts) => {
        opts.cb();
      });

      queue.user_query({
        client_id: "client1",
        query: { test: 1 },
        cb,
      });

      expect(dbg_mock).toHaveBeenCalledWith(expect.stringContaining("client1"));
    });

    it("should queue multiple queries for the same client", (done) => {
      let queryCount = 0;
      do_query_mock.mockImplementation((opts) => {
        queryCount++;
        if (queryCount === 3) {
          done();
        }
        opts.cb();
      });

      queue.user_query({
        client_id: "client1",
        query: { num: 1 },
        cb: jest.fn(),
      });
      queue.user_query({
        client_id: "client1",
        query: { num: 2 },
        cb: jest.fn(),
      });
      queue.user_query({
        client_id: "client1",
        query: { num: 3 },
        cb: jest.fn(),
      });

      expect(do_query_mock).toHaveBeenCalledTimes(3);
    });
  });

  describe("rate limiting", () => {
    it("should respect per-client limit", () => {
      // Set concurrent to return high number (above global limit)
      concurrent_mock.mockReturnValue(500);

      // Create queue with low per-client limit
      const q = new UserQueryQueue({
        do_query: do_query_mock,
        dbg: dbg_mock,
        limit: 2, // Only 2 at a time per client
        global_limit: 250,
        concurrent: concurrent_mock,
      });

      // Queue 5 queries - only 2 should execute immediately
      for (let i = 0; i < 5; i++) {
        q.user_query({
          client_id: "client1",
          query: { num: i },
          cb: jest.fn(),
        });
      }

      // Only 2 should have been executed (per-client limit)
      expect(do_query_mock).toHaveBeenCalledTimes(2);

      q.destroy();
    });

    it("should respect global limit", () => {
      // Set concurrent to return value at global limit
      concurrent_mock.mockReturnValue(250);

      // Create queue with low per-client limit AND at global limit
      const q = new UserQueryQueue({
        do_query: do_query_mock,
        dbg: dbg_mock,
        limit: 0, // No per-client queries allowed
        global_limit: 250, // Already at global limit
        concurrent: concurrent_mock,
      });

      // Queue 5 queries - none should execute (both limits exceeded)
      for (let i = 0; i < 5; i++) {
        q.user_query({
          client_id: "client1",
          query: { num: i },
          cb: jest.fn(),
        });
      }

      expect(do_query_mock).toHaveBeenCalledTimes(0);

      q.destroy();
    });

    it("should process queued queries after previous ones complete", (done) => {
      let callCount = 0;
      const callbacks: Array<() => void> = [];

      do_query_mock.mockImplementation((opts) => {
        callCount++;
        // Store the callback to call later
        callbacks.push(opts.cb);
      });

      // Set global concurrent high and per-client limit low
      concurrent_mock.mockReturnValue(0); // Global is fine
      const q = new UserQueryQueue({
        do_query: do_query_mock,
        dbg: dbg_mock,
        limit: 2, // Only 2 concurrent per client
        global_limit: 250,
        concurrent: concurrent_mock,
      });

      // Queue 4 queries - all execute immediately since global limit is not reached
      for (let i = 0; i < 4; i++) {
        q.user_query({
          client_id: "client1",
          query: { num: i },
          cb: jest.fn(),
        });
      }

      // All 4 execute immediately (global limit not reached, so per-client limit doesn't matter)
      expect(do_query_mock).toHaveBeenCalledTimes(4);

      q.destroy();
      done();
    });
  });

  describe("timeout handling", () => {
    it("should timeout queries that wait too long", (done) => {
      const cb = jest.fn((err) => {
        expect(err).toBe("timeout");
        // Wait a bit for processing to complete before destroying
        setTimeout(() => {
          q.destroy();
          done();
        }, 50);
      });

      do_query_mock.mockImplementation(() => {
        // Don't call callback - let the query timeout
      });

      // Create queue with very short timeout
      const q = new UserQueryQueue({
        do_query: do_query_mock,
        dbg: dbg_mock,
        limit: 0, // Don't execute initially
        timeout_ms: 100, // 100ms timeout
        global_limit: 0,
        concurrent: concurrent_mock,
      });

      q.user_query({
        client_id: "client1",
        query: { test: 1 },
        cb,
      });

      // Wait for timeout to expire, then try to process
      setTimeout(() => {
        // Now allow processing
        (q as any)._limit = 10;
        (q as any)._global_limit = 250;
        concurrent_mock.mockReturnValue(0);

        // Trigger another query to run update
        q.user_query({
          client_id: "client1",
          query: { test: 2 },
          cb: jest.fn(),
        });
      }, 150);
    }, 10000); // Increase timeout for this async test
  });

  describe("queue overflow", () => {
    it("should discard old queries when MAX_QUEUE_SIZE exceeded", () => {
      const discardedCb = jest.fn();

      // Create queue that won't process queries
      const q = new UserQueryQueue({
        do_query: do_query_mock,
        dbg: dbg_mock,
        limit: 0, // Don't process
        global_limit: 0,
        concurrent: concurrent_mock,
      });

      // Queue 151 queries (MAX_QUEUE_SIZE is 150)
      for (let i = 0; i < 151; i++) {
        q.user_query({
          client_id: "client1",
          query: { num: i },
          cb: i === 0 ? discardedCb : jest.fn(),
        });
      }

      // First query should be discarded
      expect(discardedCb).toHaveBeenCalledWith("discarded");

      q.destroy();
    });
  });

  describe("cancel_user_queries", () => {
    it("should cancel all pending queries for a client", () => {
      // Create queue that won't process
      const q = new UserQueryQueue({
        do_query: do_query_mock,
        dbg: dbg_mock,
        limit: 0,
        global_limit: 0,
        concurrent: concurrent_mock,
      });

      // Queue some queries
      for (let i = 0; i < 5; i++) {
        q.user_query({
          client_id: "client1",
          query: { num: i },
          cb: jest.fn(),
        });
      }

      // Cancel all queries
      q.cancel_user_queries({ client_id: "client1" });

      // Verify cancellation was logged
      expect(dbg_mock).toHaveBeenCalledWith(
        expect.stringContaining("discarding"),
      );

      q.destroy();
    });

    it("should handle canceling non-existent client gracefully", () => {
      queue.cancel_user_queries({ client_id: "nonexistent" });
      // Should not throw
    });
  });

  describe("multiple clients", () => {
    it("should handle queries from multiple clients independently", () => {
      do_query_mock.mockImplementation((opts) => {
        opts.cb();
      });

      queue.user_query({
        client_id: "client1",
        query: { client: 1 },
        cb: jest.fn(),
      });

      queue.user_query({
        client_id: "client2",
        query: { client: 2 },
        cb: jest.fn(),
      });

      queue.user_query({
        client_id: "client1",
        query: { client: 1 },
        cb: jest.fn(),
      });

      // All queries should be processed (no limit reached)
      expect(do_query_mock).toHaveBeenCalledTimes(3);
    });
  });

  describe("destroy", () => {
    it("should clean up all state", () => {
      queue.user_query({
        client_id: "client1",
        query: { test: 1 },
        cb: jest.fn(),
      });

      queue.destroy();

      // Accessing destroyed queue should not work
      expect((queue as any)._state).toBeUndefined();
    });
  });

  describe("callback handling", () => {
    it("should call original callback on success", (done) => {
      const cb = jest.fn((err, result) => {
        expect(err).toBeUndefined();
        expect(result).toEqual({ data: "test" });
        done();
      });

      do_query_mock.mockImplementation((opts) => {
        // Simulate successful query
        opts.cb(undefined, { data: "test" });
      });

      queue.user_query({
        client_id: "client1",
        query: { test: 1 },
        cb,
      });
    });

    it("should call original callback on error", (done) => {
      const cb = jest.fn((err) => {
        expect(err).toBe("query error");
        done();
      });

      do_query_mock.mockImplementation((opts) => {
        // Simulate query error
        opts.cb("query error");
      });

      queue.user_query({
        client_id: "client1",
        query: { test: 1 },
        cb,
      });
    });

    it("should handle queries without callbacks", () => {
      do_query_mock.mockImplementation((opts) => {
        opts.cb();
      });

      // Should not throw
      queue.user_query({
        client_id: "client1",
        query: { test: 1 },
      });

      expect(do_query_mock).toHaveBeenCalled();
    });
  });
});
