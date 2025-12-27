/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Test suite for SyncTable class
// Tests the CoffeeScript implementation first to establish baseline

import { EventEmitter } from "events";
import immutable from "immutable";

// Mock SCHEMA before loading SyncTable
const mockSchema = {
  projects: {
    fields: {
      project_id: { type: "uuid" },
      title: { type: "string" },
      description: { type: "string" },
      users: { type: "map" },
    },
    primary_key: "project_id",
  },
  accounts: {
    fields: {
      account_id: { type: "uuid" },
      email_address: { type: "string" },
      first_name: { type: "string" },
      last_name: { type: "string" },
    },
    primary_key: "account_id",
  },
};

jest.mock("@cocalc/util/schema", () => ({
  SCHEMA: mockSchema,
}));

describe("SyncTable", () => {
  let SyncTable: any;
  let mockDb: any;

  beforeAll(() => {
    // Load SyncTable from TypeScript implementation
    const synctable = require("./synctable");
    SyncTable = synctable.SyncTable;
  });

  beforeEach(() => {
    // Create mock database instance
    mockDb = {
      _dbg: jest.fn(() => jest.fn()),
      _primary_key: jest.fn((table) => {
        if (table === "projects") return "project_id";
        if (table === "accounts") return "account_id";
        return "id";
      }),
      _query: jest.fn(),
      _listen: jest.fn(),
      _stop_listening: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      emit: jest.fn(),
      is_standby: false,
    };
  });

  describe("constructor and initialization", () => {
    it("should create a SyncTable instance", () => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn();
      const st = new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );

      expect(st).toBeInstanceOf(EventEmitter);
      expect(st._table).toBe("projects");
    });

    it("should handle unknown table error", () => {
      const cb = jest.fn();
      const st = new SyncTable(
        mockDb,
        "unknown_table",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );

      expect(cb).toHaveBeenCalledWith(expect.stringContaining("unknown table"));
      expect(st._state).toBe("error");
    });

    it("should determine primary key from database", () => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn();
      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );

      expect(mockDb._primary_key).toHaveBeenCalledWith("projects");
    });

    it("should set up columns correctly when not specified", () => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn();
      const st = new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );

      // Should watch all columns when columns not specified
      expect(st._watch_columns).toEqual([]);
      expect(st._select_columns).toContain("project_id");
      expect(st._select_columns).toContain("title");
    });

    it("should set up columns correctly when specified", () => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const columns = ["title", "description"];
      const cb = jest.fn();
      const st = new SyncTable(
        mockDb,
        "projects",
        columns,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );

      // Should include primary key even if not in columns
      expect(st._columns).toContain("project_id");
      expect(st._columns).toContain("title");
      expect(st._columns).toContain("description");
      expect(st._watch_columns).toEqual(columns);
    });

    it("should initialize state to init", () => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn();
      const st = new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );

      expect(st._state).toBe("init");
    });
  });

  describe("_dbg", () => {
    it("should create debug function with table name", () => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn();
      const st = new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );

      st._dbg("test_function");

      expect(mockDb._dbg).toHaveBeenCalledWith(
        expect.stringContaining("SyncTable"),
      );
      expect(mockDb._dbg).toHaveBeenCalledWith(
        expect.stringContaining("projects"),
      );
      expect(mockDb._dbg).toHaveBeenCalledWith(
        expect.stringContaining("test_function"),
      );
    });
  });

  describe("_query_opts", () => {
    it("should build query options correctly", () => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const where = { state: "running" };
      const limit = 100;
      const order_by = "title";

      const cb = jest.fn();
      const st = new SyncTable(
        mockDb,
        "projects",
        undefined,
        where,
        undefined,
        limit,
        order_by,
        cb,
      );

      const opts = st._query_opts();

      expect(opts.query).toContain("SELECT");
      expect(opts.query).toContain("FROM projects");
      expect(opts.where).toBe(where);
      expect(opts.limit).toBe(limit);
      expect(opts.order_by).toBe(order_by);
    });
  });

  describe("close", () => {
    it("should clean up listeners and state", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      mockDb._stop_listening.mockImplementation(
        (_table, _select, _watch, cb) => {
          cb?.();
        },
      );

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st.close(() => {
          expect(st._state).toBe("closed");
          expect(st._value).toBeUndefined();
          expect(mockDb._stop_listening).toHaveBeenCalled();
          expect(mockDb.removeListener).toHaveBeenCalledWith(
            "test_trigger",
            st._notification,
          );
          expect(mockDb.removeListener).toHaveBeenCalledWith(
            "connect",
            st._reconnect,
          );
          done();
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("connect", () => {
    it("should be a no-op for backward compatibility", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const connectCb = jest.fn();
        st.connect({ cb: connectCb });

        expect(connectCb).toHaveBeenCalled();
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("get, getIn, has", () => {
    it("should get single value by key", (done) => {
      const testData = [
        {
          project_id: "uuid1",
          title: "Project 1",
          description: "Description 1",
        },
        {
          project_id: "uuid2",
          title: "Project 2",
          description: "Description 2",
        },
      ];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const val = st.get("uuid1");
        expect(val).toBeDefined();
        expect(val.get("title")).toBe("Project 1");
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should get multiple values by array of keys", (done) => {
      const testData = [
        { project_id: "uuid1", title: "Project 1" },
        { project_id: "uuid2", title: "Project 2" },
        { project_id: "uuid3", title: "Project 3" },
      ];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const vals = st.get(["uuid1", "uuid3"]);
        expect(vals.size).toBe(2);
        expect(vals.has("uuid1")).toBe(true);
        expect(vals.has("uuid3")).toBe(true);
        expect(vals.has("uuid2")).toBe(false);
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should return all values when no key specified", (done) => {
      const testData = [
        { project_id: "uuid1", title: "Project 1" },
        { project_id: "uuid2", title: "Project 2" },
      ];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const all = st.get();
        expect(immutable.Map.isMap(all)).toBe(true);
        expect(all.size).toBe(2);
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should support getIn for nested access", (done) => {
      const testData = [
        {
          project_id: "uuid1",
          title: "Project 1",
          users: { user1: "admin" },
        },
      ];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const val = st.getIn(["uuid1", "title"]);
        expect(val).toBe("Project 1");
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should support has for existence check", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        expect(st.has("uuid1")).toBe(true);
        expect(st.has("uuid2")).toBe(false);
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("wait", () => {
    it("should resolve immediately if condition is already true", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st.wait({
          until: (t) => t.has("uuid1"),
          timeout: 5,
          cb: (err, result) => {
            expect(err).toBeUndefined();
            expect(result).toBe(true);
            done();
          },
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should timeout if condition never becomes true", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st.wait({
          until: (t) => t.has("nonexistent"),
          timeout: 1, // 1 second
          cb: (err) => {
            expect(err).toBe("timeout");
            done();
          },
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    }, 10000);

    it("should resolve after a change event makes condition true", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st.wait({
          until: (t) => t.has("uuid2"),
          timeout: 0,
          cb: (err, result) => {
            expect(err).toBeUndefined();
            expect(result).toBe(true);
            done();
          },
        });

        st._value = st._value.set(
          "uuid2",
          immutable.fromJS({ project_id: "uuid2", title: "Project 2" }),
        );
        st.emit("change", "uuid2");
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("_process_results", () => {
    it("should update _value with new rows", (done) => {
      const initialData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      let queryCount = 0;
      mockDb._query.mockImplementation((opts) => {
        if (queryCount === 0) {
          queryCount++;
          opts.cb(undefined, { rows: initialData });
        }
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        expect(st._value.size).toBe(1);
        expect(st._value.has("uuid1")).toBe(true);

        // Simulate processing additional results
        const newData = [{ project_id: "uuid2", title: "Project 2" }];
        st._process_results(newData);

        expect(st._value.size).toBe(2);
        expect(st._value.has("uuid2")).toBe(true);
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should strip null and undefined values", (done) => {
      const testData = [
        {
          project_id: "uuid1",
          title: "Project 1",
          description: null,
          extra: undefined,
        },
      ];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const val = st.get("uuid1");
        expect(val.has("title")).toBe(true);
        expect(val.has("description")).toBe(false); // null stripped
        expect(val.has("extra")).toBe(false); // undefined stripped
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should emit change when value changes in ready state", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st.once("change", (key) => {
          expect(key).toBe("uuid1");
          done();
        });

        st._process_results([{ project_id: "uuid1", title: "Updated" }]);
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should not emit change when value is unchanged", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const emitSpy = jest.spyOn(st, "emit");
        st._process_results([{ project_id: "uuid1", title: "Project 1" }]);

        setImmediate(() => {
          expect(emitSpy).not.toHaveBeenCalledWith("change", "uuid1");
          emitSpy.mockRestore();
          done();
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should ignore results when closed", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st._state = "closed";
        const before = st._value;
        st._process_results([{ project_id: "uuid1", title: "Project 1" }]);
        expect(st._value).toBe(before);
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("notification handling", () => {
    it("should handle DELETE notification", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        expect(st.has("uuid1")).toBe(true);

        // Simulate DELETE notification
        st.once("change", (key) => {
          expect(key).toBe("uuid1");
          expect(st.has("uuid1")).toBe(false);
          done();
        });

        st._notification(["DELETE", null, { project_id: "uuid1" }]);
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should queue update on INSERT or UPDATE", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const updateSpy = jest.spyOn(st, "_update").mockImplementation(() => {
          return;
        });

        st._notification([
          "UPDATE",
          { project_id: "uuid1", title: "New" },
          { project_id: "uuid1", title: "Old" },
        ]);

        expect(st._changed["uuid1"]).toBe(true);
        expect(updateSpy).toHaveBeenCalled();
        updateSpy.mockRestore();
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should respect where_function filter", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const updateSpy = jest.spyOn(st, "_update").mockImplementation(() => {
          return;
        });
        st._where_function = () => false;

        st._notification([
          "UPDATE",
          { project_id: "uuid1", title: "New" },
          { project_id: "uuid1", title: "Old" },
        ]);

        expect(st._changed["uuid1"]).toBeUndefined();
        expect(updateSpy).not.toHaveBeenCalled();
        updateSpy.mockRestore();
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("_process_deleted", () => {
    it("should remove records that no longer match", (done) => {
      const testData = [
        { project_id: "uuid1", title: "Project 1" },
        { project_id: "uuid2", title: "Project 2" },
      ];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: testData });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st._state = "ready";
        const emitSpy = jest.spyOn(st, "emit");
        const rows = [{ project_id: "uuid1", title: "Project 1" }];

        st._process_deleted(rows, { uuid1: true, uuid2: true });

        setImmediate(() => {
          expect(st.has("uuid2")).toBe(false);
          expect(emitSpy).toHaveBeenCalledWith("change", "uuid2");
          emitSpy.mockRestore();
          done();
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("_update", () => {
    it("should no-op when there are no changes", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st._changed = {};
        st._update(() => {
          expect(mockDb._query).toHaveBeenCalledTimes(1);
          done();
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should avoid querying when only primary key is selected", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st._select_columns = [st._primary_key];
        st._changed = { uuid1: true };
        const processSpy = jest.spyOn(st, "_process_results");

        st._update(() => {
          expect(processSpy).toHaveBeenCalledWith([
            { [st._primary_key]: "uuid1" },
          ]);
          processSpy.mockRestore();
          done();
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        [mockSchema.projects.primary_key],
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should re-queue changes on query error", (done) => {
      let queryCount = 0;
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        if (opts.query.includes("SELECT") && queryCount > 0) {
          opts.cb("query-failed");
          return;
        }
        queryCount += 1;
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st._select_columns = [st._primary_key, "title"];
        st._changed = { uuid1: true };
        st._update(() => {
          expect(st._changed.uuid1).toBe(true);
          done();
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should process results and deletions on success", (done) => {
      const testData = [{ project_id: "uuid1", title: "Project 1" }];

      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        if (opts.query.includes("SELECT")) {
          opts.cb(undefined, { rows: testData });
          return;
        }
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st._select_columns = [st._primary_key, "title"];
        st._changed = { uuid1: true };
        const processSpy = jest.spyOn(st, "_process_results");
        const deletedSpy = jest.spyOn(st, "_process_deleted");

        st._update(() => {
          expect(processSpy).toHaveBeenCalled();
          expect(deletedSpy).toHaveBeenCalled();
          processSpy.mockRestore();
          deletedSpy.mockRestore();
          done();
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("_reconnect", () => {
    it("should no-op when not ready", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        st._state = "init";
        const initSpy = jest.spyOn(st, "_init");
        st._reconnect();
        expect(initSpy).not.toHaveBeenCalled();
        initSpy.mockRestore();
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should emit changes for updated rows after reconnect", (done) => {
      const initialData = [
        { project_id: "uuid1", title: "Old" },
        { project_id: "uuid2", title: "Same" },
      ];
      const newData = [
        { project_id: "uuid1", title: "New" },
        { project_id: "uuid2", title: "Same" },
        { project_id: "uuid3", title: "Added" },
      ];

      let queryCount = 0;
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        if (queryCount === 0) {
          queryCount++;
          opts.cb(undefined, { rows: initialData });
        } else {
          opts.cb(undefined, { rows: newData });
        }
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        const emitSpy = jest.spyOn(st, "emit");
        st._reconnect(() => {
          expect(emitSpy).toHaveBeenCalledWith("change", "uuid1");
          expect(emitSpy).toHaveBeenCalledWith("change", "uuid3");
          emitSpy.mockRestore();
          done();
        });
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });
  });

  describe("state management", () => {
    it("should transition from init to ready on successful initialization", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, st) => {
        if (err) {
          done(err);
          return;
        }

        expect(st._state).toBe("ready");
        done();
      });

      new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );
    });

    it("should emit init event on successful initialization", (done) => {
      mockDb._listen.mockImplementation((_table, _select, _watch, cb) => {
        cb(undefined, "test_trigger");
      });

      mockDb._query.mockImplementation((opts) => {
        opts.cb(undefined, { rows: [] });
      });

      const cb = jest.fn((err, _st) => {
        if (err) {
          done(err);
          return;
        }
        // Init event already emitted by the time callback is called
      });

      const st = new SyncTable(
        mockDb,
        "projects",
        undefined,
        {},
        undefined,
        undefined,
        undefined,
        cb,
      );

      st.once("init", () => {
        expect(st._state).toBe("ready");
        done();
      });
    });
  });
});
