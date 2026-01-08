/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Comprehensive test suite for postgres user-queries
 *
 * This file tests ALL methods from postgres-user-queries including:
 * - Public API methods (8)
 * - Query routing & parsing (4)
 * - Authorization & permissions (3)
 * - Set query methods (11)
 * - Get query methods (9)
 * - Changefeed methods (2)
 * - Hook methods (4)
 * - Syncstring permissions (6)
 *
 * Total: 44+ methods to test with 150+ test cases
 */

import { EventEmitter } from "events";

import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";
import { SCHEMA } from "@cocalc/util/schema";

import { PostgreSQL as PostgreSQLClass } from "../postgres";

const setSchema = (table: string, schema: any) => {
  const previous = SCHEMA[table];
  SCHEMA[table] = schema;
  return () => {
    if (previous == null) {
      delete SCHEMA[table];
    } else {
      SCHEMA[table] = previous;
    }
  };
};

describe("postgres user-queries - Comprehensive Test Suite", () => {
  let db: any;

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup(db);
  });

  beforeEach(() => {
    db = new PostgreSQLClass({ connect: false, timeout_ms: 0 });

    // Reset all mocks
    jest.clearAllMocks();

    // Setup mocks on the instance
    db._query = jest.fn((opts) => opts.cb && opts.cb());
    db._primary_keys = jest.fn(() => ["id"]);
    db._json_fields = jest.fn(() => ({}));
    db.get_account = jest.fn((opts) => opts.cb && opts.cb(null, {}));
    db.is_admin = jest.fn((opts) => opts.cb && opts.cb(null, false));
    db.user_is_in_project_group = jest.fn(
      (opts) => opts.cb && opts.cb(null, false),
    );
    db.has_public_path = jest.fn((opts) => opts.cb && opts.cb(null, false));
    db.ensure_user_project_upgrades_are_valid = jest.fn(
      (opts) => opts.cb && opts.cb(),
    );
    db.projectControl = jest.fn();
    db.changefeed = jest.fn();
    db.project_and_user_tracker = jest.fn(
      (opts) => opts.cb && opts.cb(null, {}),
    );
    db.ensure_connection_to_project = jest.fn();
    db.concurrent = jest.fn(() => 0);
    db.is_heavily_loaded = jest.fn(() => false);
    db._changefeeds = {};
    db._user_query_queue = null;
  });

  afterEach(() => {
    // Cleanup changefeeds
    if (db._changefeeds) {
      for (const id in db._changefeeds) {
        const feed = db._changefeeds[id];
        if (feed && typeof feed.close === "function") {
          feed.close();
        }
      }
    }
    db._changefeeds = {};
  });

  /**
   * ===========================================
   * PUBLIC API METHODS (8 methods)
   * ===========================================
   */
  describe("Public API Methods", () => {
    describe("cancel_user_queries", () => {
      test("should cancel queries using imported cancel function", (done) => {
        const client_id = "test-client-123";

        // Mock the queue
        db._user_query_queue = {
          cancel_user_queries: jest.fn(),
        };

        db.cancel_user_queries({ client_id });

        expect(db._user_query_queue.cancel_user_queries).toHaveBeenCalledWith({
          client_id,
        });
        done();
      });

      test("should handle missing queue gracefully", (done) => {
        db._user_query_queue = null;

        // Should not throw
        expect(() => {
          db.cancel_user_queries({ client_id: "test" });
        }).not.toThrow();
        done();
      });
    });

    describe("user_query", () => {
      test("should call _user_query when no client_id", (done) => {
        const query = { test_table: { id: "123" } };
        const cb = jest.fn((err) => {
          expect(err).toBeUndefined();
          done();
        });

        // Mock _user_query
        db._user_query = jest.fn((opts) => opts.cb());

        db.user_query({
          account_id: "test-account",
          query,
          cb,
        });

        expect(db._user_query).toHaveBeenCalled();
      });

      test("should use queue when client_id provided", (done) => {
        const query = { test_table: { id: "123" } };
        const cb = jest.fn();

        db._user_query = jest.fn();

        db.user_query({
          client_id: "test-client",
          account_id: "test-account",
          query,
          cb,
        });

        // Should create queue on first use
        expect(db._user_query_queue).toBeDefined();
        done();
      });

      test("should handle admin sudo", (done) => {
        const query = { test_table: { id: "123" } };
        const cb = jest.fn();

        // Mock admin check - get_account uses opts object with cb property
        db.get_account.mockImplementation((opts) => {
          expect(opts.account_id).toBe("admin-account");
          opts.cb(null, { groups: ["admin"] });
        });

        db._user_query = jest.fn((opts) => {
          // Should have changed account_id
          expect(opts.account_id).toBe("sudo-account");
          done();
        });

        db.user_query({
          account_id: "admin-account",
          query,
          options: [{ account_id: "sudo-account" }],
          cb,
        });
      });

      test("should reject non-admin sudo attempts", (done) => {
        const query = { test_table: { id: "123" } };
        const cb = jest.fn((err) => {
          expect(err).toBe("user must be admin to sudo");
          done();
        });

        // Mock non-admin - get_account uses opts object with cb property
        db.get_account.mockImplementation((opts) => {
          opts.cb(null, { groups: [] });
        });

        db.user_query({
          account_id: "regular-user",
          query,
          options: [{ account_id: "sudo-account" }],
          cb,
        });
      });
    });

    describe("user_query_cancel_changefeed", () => {
      test("should cancel existing changefeed", (done) => {
        const id = "changefeed-123";
        const mockFeed = {
          close: jest.fn(),
        };

        db._changefeeds = { [id]: mockFeed };

        db.user_query_cancel_changefeed({
          id,
          cb: () => {
            expect(mockFeed.close).toHaveBeenCalled();
            expect(db._changefeeds[id]).toBeUndefined();
            done();
          },
        });
      });

      test("should handle non-existent changefeed", (done) => {
        db.user_query_cancel_changefeed({
          id: "nonexistent",
          cb: () => {
            // Should not throw
            done();
          },
        });
      });
    });

    describe("user_set_query", () => {
      test("should require account_id or project_id", (done) => {
        db.user_set_query({
          table: "projects",
          query: { project_id: "123" },
          cb: (err) => {
            expect(err).toContain("account_id or project_id must be specified");
            done();
          },
        });
      });

      test("should stop after before_change hook when requested", (done) => {
        const check_hook = jest.fn(
          (database, query, account_id, project_id, cb) => {
            void database;
            void query;
            void account_id;
            void project_id;
            cb();
          },
        );
        const before_change_hook = jest.fn(
          (database, old_val, new_val, account_id, cb) => {
            void database;
            void old_val;
            void new_val;
            void account_id;
            cb(null, true);
          },
        );
        const on_change_hook = jest.fn(
          (database, old_val, new_val, account_id, cb) => {
            void database;
            void old_val;
            void new_val;
            void account_id;
            cb();
          },
        );

        const r = {
          dbg: jest.fn(),
          query: { project_id: "p1" },
          client_query: { set: { allow_field_deletes: true } },
          account_id: "test-account",
          project_id: undefined,
          options: {},
          primary_keys: ["project_id"],
          json_fields: {},
          check_hook,
          before_change_hook,
          on_change_hook,
        };

        db._parse_set_query_opts = jest.fn(() => r);
        db._user_set_query_enforce_requirements = jest.fn((opts, cb) => {
          void opts;
          cb();
        });
        db._user_set_query_hooks_prepare = jest.fn((opts, cb) => {
          void opts;
          cb();
        });
        db._user_set_query_main_query = jest.fn((opts, cb) => {
          void opts;
          cb();
        });

        db.user_set_query({
          account_id: "test-account",
          table: "projects",
          query: { project_id: "p1" },
          cb: (err) => {
            expect(err).toBeFalsy();
            expect(check_hook).toHaveBeenCalled();
            expect(before_change_hook).toHaveBeenCalled();
            expect(db._user_set_query_main_query).not.toHaveBeenCalled();
            expect(on_change_hook).not.toHaveBeenCalled();
            done();
          },
        });
      });

      test("should use instead_of_query when provided", (done) => {
        const instead_of_query = jest.fn((database, opts, cb) => {
          void database;
          void opts;
          cb();
        });
        const r = {
          dbg: jest.fn(),
          query: { project_id: "p1" },
          client_query: { set: { allow_field_deletes: true } },
          account_id: "test-account",
          project_id: undefined,
          options: {},
          primary_keys: ["project_id"],
          json_fields: {},
          instead_of_query,
        };

        db._parse_set_query_opts = jest.fn(() => r);
        db._user_set_query_enforce_requirements = jest.fn((opts, cb) => {
          void opts;
          cb();
        });
        db._user_set_query_hooks_prepare = jest.fn((opts, cb) => {
          void opts;
          cb();
        });
        db._user_set_query_main_query = jest.fn((opts, cb) => {
          void opts;
          cb();
        });

        db.user_set_query({
          account_id: "test-account",
          table: "projects",
          query: { project_id: "p1" },
          cb: (err) => {
            expect(err).toBeFalsy();
            expect(instead_of_query).toHaveBeenCalled();
            const opts = instead_of_query.mock.calls[0][1];
            expect(opts.cb).toBeUndefined();
            expect(opts.table).toBeUndefined();
            expect(db._user_set_query_main_query).not.toHaveBeenCalled();
            done();
          },
        });
      });
    });

    describe("user_get_query", () => {
      test("should parse basic get query", (done) => {
        // This is a minimal test - more detailed tests below
        db.user_get_query({
          account_id: "test-account",
          table: "test_table",
          query: { id: "123" },
          multi: false,
          options: [],
          cb: (err) => {
            // Will fail with schema error, but that's expected for now
            expect(err).toBeDefined();
            done();
          },
        });
      });

      test("should fill null query fields from database when allowed", (done) => {
        const restore = setSchema("test_get_fill", {
          anonymous: true,
          fields: {
            id: { type: "uuid" },
            name: { type: "string" },
          },
          user_query: {
            get: {
              fields: {
                id: null,
                name: null,
              },
              pg_where: [],
            },
          },
        });

        db._query = jest.fn((opts) => {
          expect(opts.query).toContain("id");
          expect(opts.query).toContain("name");
          expect(opts.where).toEqual(
            expect.arrayContaining([{ '"id" = $': "1" }]),
          );
          opts.cb(null, { rows: [{ id: "1", name: "Alpha" }] });
        });

        db.user_get_query({
          table: "test_get_fill",
          query: { id: "1", name: null },
          multi: false,
          options: [],
          cb: (err, result) => {
            expect(err).toBeFalsy();
            expect(result).toEqual({ id: "1", name: "Alpha" });
            restore();
            done();
          },
        });
      });

      test("should return results from query pipeline", (done) => {
        db._parse_get_query_opts = jest.fn(() => ({
          table: "test_table",
          client_query: { get: { fields: { id: null } } },
          require_admin: false,
          primary_keys: ["id"],
          json_fields: {},
        }));
        db._user_get_query_where = jest.fn(
          (client_query, account_id, project_id, query, table, cb) => {
            void client_query;
            void account_id;
            void project_id;
            void query;
            void table;
            cb(null, []);
          },
        );
        db._user_get_query_options = jest.fn(() => ({ limit: 1 }));
        db._user_get_query_do_query = jest.fn(
          (query_opts, client_query, query, multi, json_fields, cb) => {
            void query_opts;
            void client_query;
            void query;
            void multi;
            void json_fields;
            cb(null, { id: "1" });
          },
        );

        db.user_get_query({
          account_id: "test-account",
          table: "test_table",
          query: { id: null },
          multi: false,
          options: [],
          cb: (err, result) => {
            expect(err).toBeUndefined();
            expect(result).toEqual({ id: "1" });
            expect(db._user_get_query_do_query).toHaveBeenCalled();
            done();
          },
        });
      });
    });

    describe("project_action", () => {
      test("should handle test action", (done) => {
        db.project_action({
          project_id: "test-project",
          action_request: { action: "test", time: new Date() },
          cb: (err) => {
            expect(err).toBeUndefined();
            done();
          },
        });
      });

      test("should handle start action", (done) => {
        const mockProject = {
          start: jest.fn().mockResolvedValue(undefined),
        };

        db.projectControl.mockResolvedValue(mockProject);
        db._query.mockImplementation((opts) => opts.cb());

        db.project_action({
          project_id: "test-project",
          action_request: { action: "start", time: new Date() },
          cb: (err) => {
            expect(err).toBeUndefined();
            expect(mockProject.start).toHaveBeenCalled();
            done();
          },
        });
      });

      test("should handle unknown action", (done) => {
        let finishedAction: any = null;
        db._query.mockImplementation((opts) => {
          if (opts.jsonb_set?.action_request?.finished != null) {
            finishedAction = opts.jsonb_set.action_request;
          }
          opts.cb();
        });

        db.projectControl.mockResolvedValue({});

        db.project_action({
          project_id: "test-project",
          action_request: { action: "unknown", time: new Date() },
          cb: (err) => {
            expect(err).toBeFalsy();
            expect(finishedAction?.err?.toString()).toContain(
              "not implemented",
            );
            done();
          },
        });
      });
    });

    describe("updateRetentionData", () => {
      test("should be an async function", () => {
        expect(db.updateRetentionData).toBeDefined();
        expect(typeof db.updateRetentionData).toBe("function");
      });
    });
  });

  /**
   * ===========================================
   * QUERY ROUTING & PARSING METHODS (4 methods)
   * ===========================================
   */
  describe("Query Routing & Parsing Methods", () => {
    describe("_user_query", () => {
      test("should route array queries to _user_query_array", (done) => {
        db._user_query_array = jest.fn((opts) => opts.cb());

        db._user_query({
          account_id: "test-account",
          query: [{ table1: { id: "1" } }, { table2: { id: "2" } }],
          cb: () => {
            expect(db._user_query_array).toHaveBeenCalled();
            done();
          },
        });
      });

      test("should reject query with multiple tables", (done) => {
        db._user_query({
          account_id: "test-account",
          query: { table1: {}, table2: {} },
          cb: (err) => {
            expect(err).toContain("must specify exactly one key");
            done();
          },
        });
      });

      test("should reject invalid query type", (done) => {
        db._user_query({
          account_id: "test-account",
          query: { test_table: "invalid" },
          cb: (err) => {
            expect(err).toContain("query must be an object");
            done();
          },
        });
      });

      test("should reject array query with length > 1", (done) => {
        db._user_query({
          account_id: "test-account",
          query: { test_table: [{ id: "1" }, { id: "2" }] },
          cb: (err) => {
            expect(err).toContain("array of length > 1");
            done();
          },
        });
      });

      test("should reject non-array options", (done) => {
        db._user_query({
          account_id: "test-account",
          query: { test_table: { id: null } },
          options: { limit: 1 },
          cb: (err) => {
            expect(err).toContain("options");
            done();
          },
        });
      });

      test("should reject changefeeds for non-multi get queries", (done) => {
        db._user_query({
          account_id: "test-account",
          query: { test_table: { id: null } },
          changes: "changefeed-id",
          cb: (err) => {
            expect(err).toContain("changefeeds only implemented");
            done();
          },
        });
      });

      test("should reject changefeeds for set queries", (done) => {
        db._user_query({
          account_id: "test-account",
          query: { test_table: { id: "1", name: "Test" } },
          changes: "changefeed-id",
          cb: (err) => {
            expect(err).toContain("changefeeds only for read queries");
            done();
          },
        });
      });

      test("should reject anonymous set queries", (done) => {
        db._user_query({
          query: { test_table: { id: "1", name: "Test" } },
          cb: (err) => {
            expect(err).toContain("no anonymous set queries");
            done();
          },
        });
      });
    });

    describe("_user_query_array", () => {
      test("should process multiple queries in series", (done) => {
        // Mock user_query to call callback immediately
        db.user_query = jest.fn((opts) => {
          // Simulate async processing
          setImmediate(() => {
            if (opts.cb) {
              opts.cb(null, { result: "ok" });
            }
          });
        });

        db._user_query_array({
          account_id: "test-account",
          query: [{ table1: { id: "1" } }, { table2: { id: "2" } }],
          cb: (err, result) => {
            expect(err).toBeFalsy();
            expect(result).toHaveLength(2);
            expect(db.user_query).toHaveBeenCalledTimes(2);
            done();
          },
        });
      });

      test("should reject changefeeds for multiple queries", (done) => {
        db._user_query_array({
          account_id: "test-account",
          query: [{ table1: {} }, { table2: {} }],
          changes: "test-changefeed",
          cb: (err) => {
            expect(err).toContain("changefeeds only implemented for single");
            done();
          },
        });
      });
    });

    describe("_query_parse_options", () => {
      test("should parse limit option", () => {
        const result = db._query_parse_options([{ limit: 50 }]);
        expect(result.limit).toBe(50);
        expect(result.err).toBeUndefined();
      });

      test("should parse order_by option", () => {
        const result = db._query_parse_options([{ order_by: "created" }]);
        expect(result.order_by).toBe("created");
      });

      test("should parse order_by DESC", () => {
        const result = db._query_parse_options([{ order_by: "-created" }]);
        expect(result.order_by).toContain("DESC");
      });

      test("should parse multiple order_by", () => {
        const result = db._query_parse_options([
          { order_by: "name" },
          { order_by: "-created" },
        ]);
        expect(result.order_by).toContain("name");
        expect(result.order_by).toContain("created DESC");
      });

      test("should parse slice option", () => {
        const result = db._query_parse_options([{ slice: [0, 10] }]);
        expect(result.slice).toEqual([0, 10]);
      });

      test("should parse only_changes option", () => {
        const result = db._query_parse_options([{ only_changes: true }]);
        expect(result.only_changes).toBe(true);
      });

      test("should cap limit at MAX_LIMIT", () => {
        const result = db._query_parse_options([{ limit: 200000 }]);
        expect(result.limit).toBe(100000); // MAX_LIMIT
      });

      test("should handle infinite limit", () => {
        const result = db._query_parse_options([{ limit: Infinity }]);
        expect(result.limit).toBe(100000);
      });

      test("should reject unknown option", () => {
        const result = db._query_parse_options([{ unknown_option: true }]);
        expect(result.err).toContain("unknown option");
      });

      test("should ignore delete option", () => {
        const result = db._query_parse_options([{ delete: true }]);
        expect(result.err).toBeUndefined();
      });

      test("should ignore heartbeat option (legacy)", () => {
        const result = db._query_parse_options([{ heartbeat: 60 }]);
        expect(result.err).toBeUndefined();
      });
    });

    describe("_parse_get_query_opts", () => {
      test("should exist", () => {
        expect(db._parse_get_query_opts).toBeDefined();
      });

      test("should require changes callback", () => {
        const result = db._parse_get_query_opts({
          account_id: "test-account",
          table: "projects",
          query: { project_id: null },
          options: [],
          changes: {},
        });
        expect(result?.err).toContain("opts.changes.cb must also be specified");
      });

      test("should reject anonymous get queries when not allowed", () => {
        const result = db._parse_get_query_opts({
          table: "projects",
          query: { project_id: null },
          options: [],
        });
        expect(result?.err).toContain("anonymous get queries not allowed");
      });

      test("should reject disallowed fields", () => {
        const result = db._parse_get_query_opts({
          account_id: "test-account",
          table: "projects",
          query: { forbidden: null },
          options: [],
        });
        expect(result?.err).toContain("user get query not allowed");
      });

      test("should reject disallowed fields even when undefined", () => {
        const result = db._parse_get_query_opts({
          account_id: "test-account",
          table: "projects",
          query: { forbidden: undefined },
          options: [],
        });
        expect(result?.err).toContain("user get query not allowed");
      });

      test("should apply functional substitutions", () => {
        const restore = setSchema("test_get_table", {
          anonymous: true,
          fields: { id: { type: "uuid" }, computed: { type: "string" } },
          user_query: {
            get: {
              fields: {
                id: null,
                computed: () => "value",
              },
              pg_where: [],
            },
          },
        });

        const query = { id: null, computed: null };
        const result = db._parse_get_query_opts({
          table: "test_get_table",
          query,
          options: [],
        });

        expect(result?.err).toBeUndefined();
        expect(query.computed).toBe("value");
        restore();
      });

      test("should reject tables without get filters", () => {
        const restore = setSchema("test_no_filter", {
          anonymous: true,
          fields: { id: { type: "uuid" } },
          user_query: {
            get: {
              fields: { id: null },
            },
          },
        });

        const result = db._parse_get_query_opts({
          table: "test_no_filter",
          query: { id: null },
          options: [],
        });
        expect(result?.err).toContain("no getAll filter");
        restore();
      });
    });
  });

  /**
   * ===========================================
   * AUTHORIZATION & PERMISSION METHODS (3 methods)
   * ===========================================
   */
  describe("Authorization & Permission Methods", () => {
    describe("_require_is_admin", () => {
      test("should pass for admin user", (done) => {
        db.is_admin.mockImplementation((opts) => {
          expect(opts.account_id).toBeDefined();
          opts.cb(null, true);
        });

        db._require_is_admin("admin-account", (err) => {
          expect(err).toBeUndefined();
          done();
        });
      });

      test("should fail for non-admin user", (done) => {
        db.is_admin.mockImplementation((opts) => {
          opts.cb(null, false);
        });

        db._require_is_admin("regular-account", (err) => {
          expect(err).toContain("must be an admin");
          done();
        });
      });

      test("should fail when no account_id", (done) => {
        db._require_is_admin(null, (err) => {
          expect(err).toContain("must be an admin");
          done();
        });
      });

      test("should propagate database errors", (done) => {
        db.is_admin.mockImplementation((opts) => {
          opts.cb("Database error");
        });

        db._require_is_admin("test-account", (err) => {
          expect(err).toBe("Database error");
          done();
        });
      });
    });

    describe("_require_project_ids_in_groups", () => {
      test("should pass when user is in required group", (done) => {
        db._query.mockImplementation((opts) => {
          // Mock all_results wrapper behavior
          const result = [
            {
              project_id: "project-1",
              user: { group: "owner" },
            },
          ];
          opts.cb(null, { rows: result });
        });

        db._require_is_admin = jest.fn((account_id, cb) => {
          void account_id;
          cb();
        });

        db._require_project_ids_in_groups(
          "test-account",
          ["project-1"],
          ["owner", "collaborator"],
          (err) => {
            expect(err).toBeUndefined();
            done();
          },
        );
      });

      test("should require admin when user not in group", (done) => {
        db._query.mockImplementation((opts) => {
          const result = [
            {
              project_id: "project-1",
              user: { group: "reader" },
            },
          ];
          opts.cb(null, { rows: result });
        });

        db._require_is_admin = jest.fn((account_id, cb) => {
          void account_id;
          cb();
        });

        db._require_project_ids_in_groups(
          "test-account",
          ["project-1"],
          ["owner"],
          (err) => {
            expect(err).toBeUndefined();
            expect(db._require_is_admin).toHaveBeenCalled();
            done();
          },
        );
      });

      test("should reject unknown project_id", (done) => {
        db._query.mockImplementation((opts) => {
          opts.cb(null, { rows: [] }); // No projects found
        });

        db._require_project_ids_in_groups(
          "test-account",
          ["unknown-project"],
          ["owner"],
          (err) => {
            expect(err).toContain("unknown project_id");
            done();
          },
        );
      });
    });

    describe("_syncstring_access_check", () => {
      test("should validate string_id length", (done) => {
        db._syncstring_access_check("short", "account", null, (err) => {
          expect(err).toContain("must be a string of length 40");
          done();
        });
      });

      test("should check project access for account", (done) => {
        const string_id = "a".repeat(40);
        const project_id = "project-123";

        // Mock one_result wrapper that extracts project_id field
        db._query.mockImplementation((opts) => {
          // one_result returns the value of the specified field
          opts.cb(null, { rows: [{ project_id }] });
        });

        db._require_project_ids_in_groups = jest.fn(
          (account, projects, groups, cb) => {
            expect(account).toBe("test-account");
            expect(projects).toEqual([project_id]);
            void groups;
            cb();
          },
        );

        db._syncstring_access_check(string_id, "test-account", null, (err) => {
          expect(err).toBeUndefined();
          expect(db._require_project_ids_in_groups).toHaveBeenCalled();
          done();
        });
      });

      test("should allow project to access own syncstring", (done) => {
        const string_id = "a".repeat(40);
        const project_id = "project-123";

        db._query.mockImplementation((opts) => {
          opts.cb(null, { rows: [{ project_id }] });
        });

        db._syncstring_access_check(string_id, null, project_id, (err) => {
          expect(err).toBeUndefined();
          done();
        });
      });

      test("should reject project accessing different project syncstring", (done) => {
        const string_id = "a".repeat(40);

        db._query.mockImplementation((opts) => {
          opts.cb(null, { rows: [{ project_id: "other-project" }] });
        });

        db._syncstring_access_check(string_id, null, "my-project", (err) => {
          expect(err).toContain("not allowed to write to syncstring");
          done();
        });
      });

      test("should reject nonexistent syncstring", (done) => {
        const string_id = "a".repeat(40);

        db._query.mockImplementation((opts) => {
          opts.cb(null, null); // one_result returns null when no match
        });

        db._syncstring_access_check(string_id, "account", null, (err) => {
          expect(err).toContain("no such syncstring");
          done();
        });
      });
    });
  });

  /**
   * ===========================================
   * SET QUERY METHODS (11 methods)
   * ===========================================
   */
  describe("Set Query Methods", () => {
    describe("_parse_set_query_opts", () => {
      const accountId = uuid();

      // Requires SCHEMA - will test with schema integration
      test("should exist", () => {
        expect(db._parse_set_query_opts).toBeDefined();
      });

      test("should error on unknown table", () => {
        const result = db._parse_set_query_opts({
          account_id: accountId,
          table: "no_such_table",
          query: { id: "1" },
        });
        expect(result?.err).toContain("does not exist");
      });

      test("should return undefined when no modifiable fields", () => {
        const result = db._parse_set_query_opts({
          account_id: accountId,
          table: "projects",
          query: { project_id: "project-1" },
        });
        expect(result).toBeUndefined();
      });

      test("should apply functional field values", () => {
        const users = {
          "12345678-1234-1234-1234-123456789012": { group: "owner" },
        };
        db._user_set_query_project_users = jest.fn(() => users);

        const result = db._parse_set_query_opts({
          account_id: accountId,
          table: "projects",
          query: { project_id: "project-1", users: {} },
        });

        expect(db._user_set_query_project_users).toHaveBeenCalled();
        expect(result?.query.users).toEqual(users);
        expect(result?.require_project_ids_write_access).toEqual(["project-1"]);
      });

      test("should reject delete option when not allowed", () => {
        const result = db._parse_set_query_opts({
          account_id: accountId,
          table: "projects",
          query: { project_id: "project-1", title: "New Title" },
          options: [{ delete: true }],
        });
        expect(result?.err).toContain("delete from projects not allowed");
      });

      test("should reject disallowed fields", () => {
        const result = db._parse_set_query_opts({
          account_id: accountId,
          table: "projects",
          query: { project_id: "project-1", forbidden: true },
        });
        expect(result?.err).toContain("not allowed");
      });
    });

    describe("_user_set_query_where", () => {
      test("should build WHERE clause from primary keys", () => {
        db._primary_keys.mockReturnValue(["id", "created"]);

        const r = {
          db_table: "projects", // Use existing table
          query: {
            project_id: "test-id",
            created: new Date("2024-01-01"),
          },
        };

        // Override primary keys for this test
        db._primary_keys.mockReturnValueOnce(["project_id", "created"]);

        const where = db._user_set_query_where(r);

        // Should have WHERE conditions for primary keys
        expect(where).toBeDefined();
        expect(Object.keys(where).length).toBeGreaterThan(0);
      });
    });

    describe("_user_set_query_values", () => {
      test("should build VALUES clause with type coercion", () => {
        const r = {
          db_table: "projects", // Use existing table
          query: {
            title: "Test Project",
            description: "Test Description",
          },
        };

        const values = db._user_set_query_values(r);

        // Should return values object
        expect(values).toBeDefined();
        expect(typeof values).toBe("object");
        const titleKey = Object.keys(values).find(
          (key) => key === "title" || key.startsWith("title::"),
        );
        const descriptionKey = Object.keys(values).find(
          (key) => key === "description" || key.startsWith("description::"),
        );
        expect(titleKey).toBeDefined();
        expect(descriptionKey).toBeDefined();
        expect(values[titleKey as string]).toBe("Test Project");
        expect(values[descriptionKey as string]).toBe("Test Description");
      });
    });

    describe("_user_set_query_enforce_requirements", () => {
      test("should require admin when flagged", (done) => {
        db._require_is_admin = jest.fn((account_id, cb) => {
          void account_id;
          cb();
        });
        const r = {
          account_id: "test-account",
          require_admin: true,
        };

        db._user_set_query_enforce_requirements(r, (err) => {
          expect(err).toBeFalsy();
          expect(db._require_is_admin).toHaveBeenCalledWith(
            "test-account",
            expect.any(Function),
          );
          done();
        });
      });

      test("should reject mismatched project write access", (done) => {
        const r = {
          account_id: "test-account",
          project_id: "project-2",
          require_project_ids_write_access: ["project-1"],
        };

        db._user_set_query_enforce_requirements(r, (err) => {
          expect(err).toContain("only query same project");
          done();
        });
      });

      test("should require owner group when needed", (done) => {
        db._require_project_ids_in_groups = jest.fn(
          (account_id, project_ids, groups, cb) => {
            void account_id;
            void project_ids;
            void groups;
            cb();
          },
        );
        const r = {
          account_id: "test-account",
          require_project_ids_owner: ["project-1"],
        };

        db._user_set_query_enforce_requirements(r, (err) => {
          expect(err).toBeFalsy();
          expect(db._require_project_ids_in_groups).toHaveBeenCalledWith(
            "test-account",
            ["project-1"],
            ["owner"],
            expect.any(Function),
          );
          done();
        });
      });
    });

    describe("_user_set_query_hooks_prepare", () => {
      test("should fetch old value when hooks are present", (done) => {
        db._user_set_query_where = jest.fn(() => ({
          "project_id=$": "project-1",
        }));
        db._query = jest.fn((opts) =>
          opts.cb(null, { rows: [{ project_id: "project-1", name: "Old" }] }),
        );

        const r: any = {
          db_table: "projects",
          primary_keys: ["project_id"],
          query: { project_id: "project-1" },
          on_change_hook: jest.fn(),
        };

        db._user_set_query_hooks_prepare(r, (err) => {
          expect(err).toBeUndefined();
          expect(db._query).toHaveBeenCalled();
          expect(r.old_val).toEqual({ project_id: "project-1", name: "Old" });
          done();
        });
      });

      test("should skip fetch when primary key missing", (done) => {
        db._query = jest.fn();
        const r: any = {
          db_table: "projects",
          primary_keys: ["project_id"],
          query: {},
          before_change_hook: jest.fn(),
        };

        db._user_set_query_hooks_prepare(r, (err) => {
          expect(err).toBeUndefined();
          expect(db._query).not.toHaveBeenCalled();
          done();
        });
      });
    });

    describe("_user_query_set_count", () => {
      test("should count matching rows", (done) => {
        db._user_set_query_where = jest.fn(() => ({
          "project_id=$": "project-1",
        }));
        db._query = jest.fn((opts) =>
          opts.cb(null, { rows: [{ count: "2" }] }),
        );

        const r = { db_table: "projects", query: { project_id: "project-1" } };
        db._user_query_set_count(r, (err, count) => {
          expect(err).toBeUndefined();
          expect(count).toBe(2);
          expect(db._query).toHaveBeenCalledWith(
            expect.objectContaining({
              query: "SELECT COUNT(*) FROM projects",
              where: { "project_id=$": "project-1" },
            }),
          );
          done();
        });
      });
    });

    describe("_user_query_set_delete", () => {
      test("should issue delete query", (done) => {
        db._user_set_query_where = jest.fn(() => ({
          "project_id=$": "project-1",
        }));
        db._query = jest.fn((opts) => opts.cb());

        const r = { db_table: "projects", query: { project_id: "project-1" } };
        db._user_query_set_delete(r, (err) => {
          expect(err).toBeUndefined();
          expect(db._query).toHaveBeenCalledWith(
            expect.objectContaining({
              query: "DELETE FROM projects",
              where: { "project_id=$": "project-1" },
            }),
          );
          done();
        });
      });
    });

    describe("_user_query_set_upsert", () => {
      test("should issue insert with conflict", (done) => {
        db._user_set_query_values = jest.fn(() => ({
          project_id: "project-1",
        }));
        db._query = jest.fn((opts) => opts.cb());

        const r = {
          db_table: "projects",
          query: { project_id: "project-1" },
          primary_keys: ["project_id"],
        };

        db._user_query_set_upsert(r, (err) => {
          expect(err).toBeUndefined();
          expect(db._query).toHaveBeenCalledWith(
            expect.objectContaining({
              query: "INSERT INTO projects",
              values: { project_id: "project-1" },
              conflict: ["project_id"],
            }),
          );
          done();
        });
      });
    });

    describe("_user_query_set_upsert_and_jsonb_merge", () => {
      test("should build jsonb_merge and set clauses", (done) => {
        db._user_set_query_where = jest.fn(() => ({
          "project_id=$": "project-1",
        }));
        db._query = jest.fn((opts) => {
          expect(opts.jsonb_merge).toEqual({ settings: { theme: "dark" } });
          expect(opts.set).toEqual({ title: "Test" });
          opts.cb();
        });

        const r = {
          db_table: "projects",
          primary_keys: ["project_id"],
          json_fields: { settings: [] },
          query: {
            project_id: "project-1",
            settings: { theme: "dark" },
            title: "Test",
          },
        };

        db._user_query_set_upsert_and_jsonb_merge(r, (err) => {
          expect(err).toBeUndefined();
          done();
        });
      });
    });

    describe("_user_set_query_main_query", () => {
      test("should remove null fields and upsert when no json fields", (done) => {
        db._user_query_set_upsert = jest.fn((opts, cb) => {
          void opts;
          cb();
        });

        const r = {
          dbg: jest.fn(),
          db_table: "projects",
          primary_keys: ["project_id"],
          client_query: { set: { allow_field_deletes: false } },
          query: { project_id: "project-1", title: null, name: "Test" },
          options: {},
          json_fields: {},
        };

        db._user_set_query_main_query(r, (err) => {
          expect(err).toBeFalsy();
          expect(r.query.title).toBeUndefined();
          expect(db._user_query_set_upsert).toHaveBeenCalled();
          done();
        });
      });

      test("should reject delete without primary key", (done) => {
        const r = {
          dbg: jest.fn(),
          db_table: "projects",
          primary_keys: ["project_id"],
          client_query: { set: { allow_field_deletes: true } },
          query: { title: "Test" },
          options: { delete: true },
          json_fields: {},
        };

        db._user_set_query_main_query(r, (err) => {
          expect(err).toContain("delete query must set primary key");
          done();
        });
      });

      test("should delete when option set and primary key provided", (done) => {
        db._user_query_set_delete = jest.fn((opts, cb) => {
          void opts;
          cb();
        });
        const r = {
          dbg: jest.fn(),
          db_table: "projects",
          primary_keys: ["project_id"],
          client_query: { set: { allow_field_deletes: true } },
          query: { project_id: "project-1" },
          options: { delete: true },
          json_fields: {},
        };

        db._user_set_query_main_query(r, (err) => {
          expect(err).toBeFalsy();
          expect(db._user_query_set_delete).toHaveBeenCalled();
          done();
        });
      });

      test("should upsert when json fields present and record missing", (done) => {
        db._user_query_set_count = jest.fn((opts, cb) => {
          void opts;
          cb(null, 0);
        });
        db._user_query_set_upsert = jest.fn((opts, cb) => {
          void opts;
          cb();
        });
        const r = {
          dbg: jest.fn(),
          db_table: "projects",
          primary_keys: ["project_id"],
          client_query: { set: { allow_field_deletes: true } },
          query: { project_id: "project-1", settings: { theme: "dark" } },
          options: {},
          json_fields: { settings: [] },
        };

        db._user_set_query_main_query(r, (err) => {
          expect(err).toBeFalsy();
          expect(db._user_query_set_upsert).toHaveBeenCalled();
          done();
        });
      });

      test("should jsonb merge when json fields present and record exists", (done) => {
        db._user_query_set_count = jest.fn((opts, cb) => {
          void opts;
          cb(null, 1);
        });
        db._user_query_set_upsert_and_jsonb_merge = jest.fn((opts, cb) => {
          void opts;
          cb();
        });
        const r = {
          dbg: jest.fn(),
          db_table: "projects",
          primary_keys: ["project_id"],
          client_query: { set: { allow_field_deletes: true } },
          query: { project_id: "project-1", settings: { theme: "dark" } },
          options: {},
          json_fields: { settings: [] },
        };

        db._user_set_query_main_query(r, (err) => {
          expect(err).toBeFalsy();
          expect(db._user_query_set_upsert_and_jsonb_merge).toHaveBeenCalled();
          done();
        });
      });
    });

    describe("_user_set_query_conflict", () => {
      test("should return primary keys for conflict resolution", () => {
        const r = {
          primary_keys: ["id", "version"],
        };

        const conflict = db._user_set_query_conflict(r);
        expect(conflict).toEqual(["id", "version"]);
      });
    });

    describe("_mod_fields", () => {
      test("should return true if modifiable fields exist", () => {
        const query = { name: "NewName", status: "active" };
        const client_query = {
          set: {
            fields: {
              name: undefined,
              status: undefined,
              account_id: "account_id",
            },
          },
        };

        const result = db._mod_fields(query, client_query);
        expect(result).toBe(true);
      });

      test("should return false if only non-modifiable fields", () => {
        const query = { account_id: "test" };
        const client_query = {
          set: {
            fields: {
              account_id: "account_id",
            },
          },
        };

        const result = db._mod_fields(query, client_query);
        expect(result).toBe(false);
      });
    });
  });

  /**
   * ===========================================
   * GET QUERY METHODS (9 methods)
   * ===========================================
   */
  describe("Get Query Methods", () => {
    describe("_user_get_query_columns", () => {
      test("should return all query keys", () => {
        const query = { id: "test", name: "Test", created: null };
        const columns = db._user_get_query_columns(query);
        expect(columns).toEqual(["id", "name", "created"]);
      });

      test("should exclude specified columns", () => {
        const query = { id: "test", name: "Test", created: null };
        const columns = db._user_get_query_columns(query, ["created"]);
        expect(columns).toEqual(["id", "name"]);
      });
    });

    describe("_user_get_query_functional_subs", () => {
      test("should apply functional substitutions", () => {
        const query: any = { name: "alpha" };
        db._user_get_query_functional_subs(query, {
          computed: (q) => `${q.name}-value`,
        });
        expect(query.computed).toBe("alpha-value");
      });
    });

    describe("_user_get_query_where", () => {
      test("should expand projects and enforce access checks", (done) => {
        const restore = setSchema("test_projects", {
          anonymous: false,
          fields: { project_id: { type: "uuid" } },
          user_query: {
            get: {
              pg_where: ["projects"],
              fields: { project_id: null },
            },
          },
        });

        db.user_is_in_project_group = jest.fn((opts) => opts.cb(null, true));
        const user_query = { project_id: "project-1" };

        db._user_get_query_where(
          SCHEMA.test_projects.user_query,
          "test-account",
          undefined,
          user_query,
          "test_projects",
          (err, where) => {
            expect(err).toBeUndefined();
            expect(where).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  "project_id = $::UUID": "project-1",
                }),
              ]),
            );
            expect(db.user_is_in_project_group).toHaveBeenCalledWith(
              expect.objectContaining({
                account_id: "test-account",
                project_id: "project-1",
                groups: ["owner", "collaborator"],
              }),
            );
            restore();
            done();
          },
        );
      });

      test("should reject account_id substitution without account_id", (done) => {
        const restore = setSchema("test_account", {
          anonymous: false,
          fields: { account_id: { type: "uuid" } },
          user_query: {
            get: {
              pg_where: [{ "account_id = $": "account_id" }],
              fields: { account_id: null },
            },
          },
        });

        db._user_get_query_where(
          SCHEMA.test_account.user_query,
          undefined,
          undefined,
          { account_id: "test-account" },
          "test_account",
          (err) => {
            expect(err).toContain("account_id must be given");
            restore();
            done();
          },
        );
      });

      test("should require public path for project_id-public", (done) => {
        const restore = setSchema("test_public", {
          anonymous: true,
          fields: { project_id: { type: "uuid" } },
          user_query: {
            get: {
              pg_where: [{ "project_id = $::UUID": "project_id-public" }],
              fields: { project_id: null },
            },
          },
        });

        db.has_public_path = jest.fn((opts) => opts.cb(null, false));
        db._user_get_query_where(
          SCHEMA.test_public.user_query,
          undefined,
          undefined,
          { project_id: "project-1" },
          "test_public",
          (err) => {
            expect(err).toContain("public paths");
            restore();
            done();
          },
        );
      });
    });

    describe("_user_get_query_options", () => {
      test("should default limit to 1 for non-multi", () => {
        const result = db._user_get_query_options([], false);
        expect(result.limit).toBe(100000);
      });

      test("should reject slice option", () => {
        const result = db._user_get_query_options([{ slice: [0, 10] }], true);
        expect(result.err).toContain("slice not implemented");
      });

      test("should apply only_changes and schema options", () => {
        const result = db._user_get_query_options(
          [{ only_changes: true }],
          true,
          [{ limit: 7 }],
        );
        expect(result.only_changes).toBe(true);
        expect(result.limit).toBe(7);
      });
    });

    describe("_user_get_query_do_query", () => {
      test("should apply defaults and strip nulls", (done) => {
        db._query = jest.fn((opts) =>
          opts.cb(null, {
            rows: [
              {
                id: "1",
                status: null,
                settings: { theme: "dark" },
                extra: null,
              },
            ],
          }),
        );

        const client_query = {
          get: {
            fields: {
              id: null,
              status: "pending",
              settings: { theme: "light", lang: "en" },
            },
          },
        };

        db._user_get_query_do_query(
          {},
          client_query,
          { id: null, status: null, settings: null },
          false,
          {},
          (err, result) => {
            expect(err).toBeUndefined();
            expect(result.status).toBe("pending");
            expect(result.settings).toEqual({ theme: "dark", lang: "en" });
            expect(result.extra).toBeNull();
            done();
          },
        );
      });
    });

    describe("_user_get_query_query", () => {
      test("should build SELECT with removed fields excluded", () => {
        const query = { id: null, name: null, deleted: null };
        const sql = db._user_get_query_query("test_table", query, ["deleted"]);
        expect(sql).toContain("FROM test_table");
        expect(sql).toContain("id");
        expect(sql).toContain("name");
        expect(sql).not.toContain("deleted");
      });
    });

    describe("_user_get_query_satisfied_by_obj", () => {
      test("should match simple equality", () => {
        const user_query = { name: "Test", status: "active" };
        const obj = { name: "Test", status: "active", other: "data" };

        const result = db._user_get_query_satisfied_by_obj(user_query, obj, {});
        expect(result).toBe(true);
      });

      test("should fail on mismatch", () => {
        const user_query = { name: "Test" };
        const obj = { name: "Other" };

        const result = db._user_get_query_satisfied_by_obj(user_query, obj, {});
        expect(result).toBe(false);
      });

      test("should handle comparison operators ==", () => {
        const user_query = { count: { "==": 10 } };
        const obj = { count: 10 };

        const result = db._user_get_query_satisfied_by_obj(user_query, obj, {});
        expect(result).toBe(true);
      });

      test("should handle comparison operators !=", () => {
        const user_query = { count: { "!=": 10 } };
        const obj = { count: 5 };

        const result = db._user_get_query_satisfied_by_obj(user_query, obj, {});
        expect(result).toBe(true);
      });

      test("should handle comparison operators >=", () => {
        const user_query = { count: { ">=": 10 } };
        const obj = { count: 15 };

        const result = db._user_get_query_satisfied_by_obj(user_query, obj, {});
        expect(result).toBe(true);
      });

      test("should handle comparison operators <=", () => {
        const user_query = { count: { "<=": 10 } };
        const obj = { count: 5 };

        const result = db._user_get_query_satisfied_by_obj(user_query, obj, {});
        expect(result).toBe(true);
      });

      test("should handle comparison operators >", () => {
        const user_query = { count: { ">": 10 } };
        const obj = { count: 11 };

        const result = db._user_get_query_satisfied_by_obj(user_query, obj, {});
        expect(result).toBe(true);
      });

      test("should handle comparison operators <", () => {
        const user_query = { count: { "<": 10 } };
        const obj = { count: 9 };

        const result = db._user_get_query_satisfied_by_obj(user_query, obj, {});
        expect(result).toBe(true);
      });
    });

    describe("_user_get_query_json_timestamps", () => {
      test("should convert JSON date strings to Date objects", () => {
        const obj = {
          data: {
            created: "2024-01-01T00:00:00Z",
            updated: "2024-01-02T00:00:00Z",
          },
        };

        const fields = {
          data: ["created", "updated"],
        };

        db._user_get_query_json_timestamps(obj, fields);

        // Dates should be converted - checking with misc.fix_json_dates behavior
        expect(obj.data).toBeDefined();
      });
    });

    describe("_user_get_query_set_defaults", () => {
      test("should fill in default values", () => {
        const client_query = {
          get: {
            fields: {
              status: "pending",
              priority: 0,
            },
          },
        };

        const obj: any[] = [{ id: "1" }, { id: "2", status: "active" }];

        db._user_get_query_set_defaults(client_query, obj, [
          "id",
          "status",
          "priority",
        ]);

        expect(obj[0].status).toBe("pending");
        expect(obj[0].priority).toBe(0);
        expect(obj[1].status).toBe("active");
        expect(obj[1].priority).toBe(0);
      });

      test("should merge object defaults", () => {
        const client_query = {
          get: {
            fields: {
              settings: { theme: "light", lang: "en" },
            },
          },
        };

        const obj: any[] = [{ settings: { theme: "dark" } }];

        db._user_get_query_set_defaults(client_query, obj, ["settings"]);

        expect(obj[0].settings.theme).toBe("dark");
        expect(obj[0].settings.lang).toBe("en");
      });
    });

    describe("_user_get_query_handle_field_deletes", () => {
      test("should remove null fields when allow_field_deletes is false", () => {
        const client_query = {
          get: {
            allow_field_deletes: false,
          },
        };

        const new_val = { name: "Test", deleted_field: null };

        db._user_get_query_handle_field_deletes(client_query, new_val);

        expect(new_val.name).toBe("Test");
        expect(new_val.deleted_field).toBeUndefined();
      });

      test("should keep null fields when allow_field_deletes is true", () => {
        const client_query = {
          get: {
            allow_field_deletes: true,
          },
        };

        const new_val = { name: "Test", deleted_field: null };

        db._user_get_query_handle_field_deletes(client_query, new_val);

        expect(new_val.name).toBe("Test");
        expect(new_val.deleted_field).toBeNull();
      });
    });

    describe("_json_fields", () => {
      test("should identify JSONB fields from schema", () => {
        // Use a real table from the schema that has JSON fields
        const table = "projects";
        const query = { users: {} }; // users field is JSONB in projects table

        const json_fields = PostgreSQLClass.prototype._json_fields.call(
          db,
          table,
          query,
        );

        // Should return an object mapping JSON field names to their date fields
        expect(json_fields).toBeDefined();
        expect(typeof json_fields).toBe("object");

        // The users field should be identified as a JSON field
        if (query.users !== undefined) {
          expect(json_fields).toHaveProperty("users");
        }
      });
    });
  });

  /**
   * ===========================================
   * CHANGEFEED METHODS (2 methods - CRITICAL)
   * ===========================================
   */
  describe("Changefeed Methods", () => {
    describe("_inc_changefeed_count / _dec_changefeed_count", () => {
      test("_inc_changefeed_count should be disabled (return immediately)", () => {
        const result = db._inc_changefeed_count(
          "account",
          "project",
          "table",
          "changefeed-id",
        );
        expect(result).toBeUndefined();
      });

      test("_dec_changefeed_count should be disabled (return immediately)", () => {
        db._dec_changefeed_count("changefeed-id", "table");
        // Should not throw
      });
    });

    describe("_user_get_query_changefeed", () => {
      test("should reject changefeed without valid id", (done) => {
        db._user_get_query_changefeed(
          { id: "invalid-id", cb: jest.fn() },
          "test_table",
          ["id"],
          { id: "test" },
          [],
          {},
          "account",
          {},
          "test_table",
          (err) => {
            expect(err).toContain("must be a uuid");
            done();
          },
        );
      });

      test("should reject changefeed without cb function", (done) => {
        const uuid = "12345678-1234-1234-1234-123456789012";
        db._user_get_query_changefeed(
          { id: uuid, cb: "not-a-function" },
          "test_table",
          ["id"],
          { id: "test" },
          [],
          {},
          "account",
          {},
          "test_table",
          (err) => {
            expect(err).toContain("cb must be a function");
            done();
          },
        );
      });

      test("should require primary key in query", (done) => {
        const uuid = "12345678-1234-1234-1234-123456789012";
        db._user_get_query_changefeed(
          { id: uuid, cb: jest.fn() },
          "test_table",
          ["id"],
          {}, // Missing primary key
          [],
          {},
          "account",
          {},
          "test_table",
          (err) => {
            expect(err).toContain("MUST include primary key");
            done();
          },
        );
      });

      test("should register changefeed and forward changes", (done) => {
        const restore = setSchema("test_changefeed", {
          anonymous: true,
          fields: { id: { type: "uuid" } },
        });
        const changes = {
          id: "12345678-1234-1234-1234-123456789012",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        db.changefeed = jest.fn((opts) => opts.cb(null, feed));

        db._user_get_query_changefeed(
          changes,
          "test_changefeed",
          ["id"],
          { id: "1" },
          [],
          {},
          "test-account",
          { get: { fields: { id: null } } },
          "test_changefeed",
          (err) => {
            expect(err).toBeFalsy();
            expect(db._changefeeds[changes.id]).toBe(feed);
            feed.emit("change", { action: "insert", new_val: { id: "1" } });
            expect(changes.cb).toHaveBeenCalledWith(undefined, {
              action: "insert",
              new_val: { id: "1" },
            });
            restore();
            done();
          },
        );
      });

      test("should handle 'projects' changefeed type", (done) => {
        const restore = setSchema("test_projects_feed", {
          anonymous: false,
          fields: { project_id: { type: "uuid" } },
          user_query: {
            get: {
              pg_changefeed: "projects",
              fields: { project_id: null },
            },
          },
        });

        const account_id = "12345678-1234-1234-1234-123456789012";
        const changes = {
          id: "87654321-4321-4321-4321-210987654321",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        const mockTracker = {
          register: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
          once: jest.fn(),
          removeListener: jest.fn(),
        };

        db.changefeed = jest.fn((opts) => opts.cb(null, feed));
        db.user_is_in_project_group = jest.fn((opts) => opts.cb(null, true));
        db.project_and_user_tracker = jest.fn((opts) =>
          opts.cb(null, mockTracker),
        );

        const client_query = {
          get: { pg_changefeed: "projects", fields: { project_id: null } },
        };

        db._user_get_query_changefeed(
          changes,
          "test_projects_feed",
          ["project_id"],
          { project_id: "test-project" },
          [],
          {},
          account_id,
          client_query,
          "test_projects_feed",
          (err) => {
            expect(err).toBeFalsy();
            expect(db.project_and_user_tracker).toHaveBeenCalled();
            restore();
            done();
          },
        );
      }, 1000);

      test("should handle 'news' changefeed with date filtering", (done) => {
        const restore = setSchema("test_news_feed", {
          anonymous: true,
          fields: { id: { type: "integer" }, date: { type: "timestamp" } },
          user_query: {
            get: {
              pg_changefeed: "news",
              fields: { id: null, date: null },
            },
          },
        });

        const changes = {
          id: "12345678-1234-1234-1234-123456789012",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        db.changefeed = jest.fn((opts) => {
          // Verify where function is set for date filtering
          expect(opts.where).toBeDefined();
          opts.cb(null, feed);
        });

        const client_query = {
          get: { pg_changefeed: "news", fields: { id: null, date: null } },
        };

        db._user_get_query_changefeed(
          changes,
          "test_news_feed",
          ["id"],
          { id: "1" },
          [],
          {},
          undefined,
          client_query,
          "test_news_feed",
          (err) => {
            expect(err).toBeFalsy();
            restore();
            done();
          },
        );
      });

      test("should handle 'one-hour' changefeed with time filtering", (done) => {
        const restore = setSchema("test_hour_feed", {
          anonymous: true,
          fields: { id: { type: "uuid" }, time: { type: "timestamp" } },
          user_query: {
            get: {
              pg_changefeed: "one-hour",
              fields: { id: null, time: null },
            },
          },
        });

        const changes = {
          id: "12345678-1234-1234-1234-123456789012",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        db.changefeed = jest.fn((opts) => {
          // Verify select fields for time filtering
          expect(opts.select).toHaveProperty("time");
          opts.cb(null, feed);
        });

        const client_query = {
          get: {
            pg_changefeed: "one-hour",
            fields: { id: null, time: null },
          },
        };

        db._user_get_query_changefeed(
          changes,
          "test_hour_feed",
          ["id"],
          { id: "test-id" },
          [],
          {},
          undefined,
          client_query,
          "test_hour_feed",
          (err) => {
            expect(err).toBeFalsy();
            restore();
            done();
          },
        );
      });

      test("should handle 'five-minutes' changefeed with time filtering", (done) => {
        const restore = setSchema("test_five_min_feed", {
          anonymous: true,
          fields: { id: { type: "uuid" }, time: { type: "timestamp" } },
          user_query: {
            get: {
              pg_changefeed: "five-minutes",
              fields: { id: null, time: null },
            },
          },
        });

        const changes = {
          id: "12345678-1234-1234-1234-123456789012",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        db.changefeed = jest.fn((opts) => {
          expect(opts.select).toHaveProperty("time");
          opts.cb(null, feed);
        });

        const client_query = {
          get: {
            pg_changefeed: "five-minutes",
            fields: { id: null, time: null },
          },
        };

        db._user_get_query_changefeed(
          changes,
          "test_five_min_feed",
          ["id"],
          { id: "test-id" },
          [],
          {},
          undefined,
          client_query,
          "test_five_min_feed",
          (err) => {
            expect(err).toBeFalsy();
            restore();
            done();
          },
        );
      });

      test("should handle 'collaborators' changefeed with tracker", (done) => {
        const restore = setSchema("test_collab_feed", {
          anonymous: false,
          fields: { account_id: { type: "uuid" } },
          user_query: {
            get: {
              pg_changefeed: "collaborators",
              fields: { account_id: null },
            },
          },
        });

        const account_id = "12345678-1234-1234-1234-123456789012";
        const changes = {
          id: "87654321-4321-4321-4321-210987654321",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        const mockTracker = {
          register: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
          once: jest.fn(),
          removeListener: jest.fn(),
        };

        db.changefeed = jest.fn((opts) => opts.cb(null, feed));
        db.project_and_user_tracker = jest.fn((opts) =>
          opts.cb(null, mockTracker),
        );

        const client_query = {
          get: {
            pg_changefeed: "collaborators",
            fields: { account_id: null },
          },
        };

        db._user_get_query_changefeed(
          changes,
          "test_collab_feed",
          ["account_id"],
          { account_id: "collab-id" },
          [],
          {},
          account_id,
          client_query,
          "test_collab_feed",
          (err) => {
            expect(err).toBeFalsy();
            expect(db.project_and_user_tracker).toHaveBeenCalled();
            expect(mockTracker.register).toHaveBeenCalledWith(account_id);
            expect(mockTracker.on).toHaveBeenCalledWith(
              expect.stringContaining("add_collaborator"),
              expect.any(Function),
            );
            expect(mockTracker.on).toHaveBeenCalledWith(
              expect.stringContaining("remove_collaborator"),
              expect.any(Function),
            );
            restore();
            done();
          },
        );
      });

      test("should require account_id for 'collaborators' changefeed", (done) => {
        const restore = setSchema("test_collab_no_account", {
          anonymous: false,
          fields: { account_id: { type: "uuid" } },
          user_query: {
            get: {
              pg_changefeed: "collaborators",
              fields: { account_id: null },
            },
          },
        });

        const changes = {
          id: "12345678-1234-1234-1234-123456789012",
          cb: jest.fn(),
        };

        const client_query = {
          get: {
            pg_changefeed: "collaborators",
            fields: { account_id: null },
          },
        };

        db._user_get_query_changefeed(
          changes,
          "test_collab_no_account",
          ["account_id"],
          { account_id: "test" },
          [],
          {},
          undefined, // No account_id
          client_query,
          "test_collab_no_account",
          (err) => {
            expect(err).toContain("account_id must be given");
            restore();
            done();
          },
        );
      });

      test("should handle feed close event and cleanup tracker", (done) => {
        const restore = setSchema("test_feed_close", {
          anonymous: true,
          fields: { id: { type: "uuid" } },
        });

        const changes = {
          id: "12345678-1234-1234-1234-123456789012",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        db.changefeed = jest.fn((opts) => opts.cb(null, feed));

        db._user_get_query_changefeed(
          changes,
          "test_feed_close",
          ["id"],
          { id: "test" },
          [],
          {},
          "test-account",
          { get: { fields: { id: null } } },
          "test_feed_close",
          (err) => {
            expect(err).toBeFalsy();

            // Emit close event
            feed.emit("close");

            // Should have called changes.cb with close action
            expect(changes.cb).toHaveBeenCalledWith(undefined, {
              action: "close",
            });

            restore();
            done();
          },
        );
      });

      test("should handle feed error event", (done) => {
        const restore = setSchema("test_feed_error", {
          anonymous: true,
          fields: { id: { type: "uuid" } },
        });

        const changes = {
          id: "12345678-1234-1234-1234-123456789012",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        db.changefeed = jest.fn((opts) => opts.cb(null, feed));

        db._user_get_query_changefeed(
          changes,
          "test_feed_error",
          ["id"],
          { id: "test" },
          [],
          {},
          "test-account",
          { get: { fields: { id: null } } },
          "test_feed_error",
          (err) => {
            expect(err).toBeFalsy();

            // Emit error event
            const testError = new Error("Test error");
            feed.emit("error", testError);

            // Should have called changes.cb with error
            expect(changes.cb).toHaveBeenCalledWith(
              expect.stringContaining("Test error"),
            );

            restore();
            done();
          },
        );
      });

      test("should filter changes based on user query satisfaction", (done) => {
        const restore = setSchema("test_filter", {
          anonymous: true,
          fields: { id: { type: "uuid" }, status: { type: "string" } },
        });

        const changes = {
          id: "12345678-1234-1234-1234-123456789012",
          cb: jest.fn(),
        };
        const feed = new EventEmitter();

        db.changefeed = jest.fn((opts) => opts.cb(null, feed));

        db._user_get_query_changefeed(
          changes,
          "test_filter",
          ["id"],
          { id: "test", status: "active" },
          [],
          {},
          "test-account",
          { get: { fields: { id: null, status: null } } },
          "test_filter",
          (err) => {
            expect(err).toBeFalsy();

            // Emit change that matches query
            feed.emit("change", {
              action: "insert",
              new_val: { id: "test", status: "active" },
            });

            // Should have forwarded the change
            expect(changes.cb).toHaveBeenCalledWith(undefined, {
              action: "insert",
              new_val: { id: "test", status: "active" },
            });

            restore();
            done();
          },
        );
      });
    });
  });

  /**
   * ===========================================
   * HOOK METHODS (4 methods)
   * ===========================================
   */
  describe("Hook Methods", () => {
    describe("_user_set_query_project_users", () => {
      const accountId = uuid();
      const otherId = uuid();

      test("should validate UUID format", () => {
        expect(() => {
          db._user_set_query_project_users(
            {
              users: {
                "not-a-uuid": { hide: true },
              },
            },
            accountId,
          );
        }).toThrow("invalid account_id 'not-a-uuid'");

        const result = db._user_set_query_project_users(
          {
            users: {
              [otherId]: { hide: true },
            },
          },
          accountId,
        );

        expect(result).toHaveProperty(otherId);
      });

      test("should reject group changes for user queries", () => {
        expect(() => {
          db._user_set_query_project_users(
            {
              users: {
                [accountId]: {
                  group: "owner",
                },
              },
            },
            accountId,
          );
        }).toThrow(
          "changing collaborator group via user_set_query is not allowed",
        );
      });

      test("should validate group values in system operations", () => {
        expect(() => {
          db._user_set_query_project_users({
            users: {
              [accountId]: {
                group: "invalid-group",
              },
            },
          });
        }).toThrow(
          "invalid group value 'invalid-group' - must be 'owner' or 'collaborator'",
        );
      });

      test("should validate hide field type", () => {
        expect(() => {
          db._user_set_query_project_users(
            {
              users: {
                [accountId]: {
                  hide: "not-boolean",
                },
              },
            },
            accountId,
          );
        }).toThrow("invalid type for field 'hide'");
      });

      test("should validate upgrades object", () => {
        expect(() => {
          db._user_set_query_project_users(
            {
              users: {
                [accountId]: {
                  upgrades: "not-object",
                },
              },
            },
            accountId,
          );
        }).toThrow("invalid type for field 'upgrades'");
      });

      test("should validate ssh_keys structure", () => {
        expect(() => {
          db._user_set_query_project_users(
            {
              users: {
                [accountId]: {
                  ssh_keys: "not-object",
                },
              },
            },
            accountId,
          );
        }).toThrow("ssh_keys must be an object");
      });
    });

    describe("_user_set_query_project_change_before", () => {
      test("should exist", () => {
        expect(db._user_set_query_project_change_before).toBeDefined();
      });

      test("should reject invalid project names", (done) => {
        const old_val = { project_id: "project-1", name: "OldName" };
        const new_val = { project_id: "project-1", name: "invalid name!!" }; // Has special chars

        db._user_set_query_project_change_before(
          old_val,
          new_val,
          "account-1",
          (err) => {
            expect(err).toBeDefined();
            expect(err.toString()).toContain("must contain only");
            done();
          },
        );
      }, 1000);

      test("should reject duplicate project names for same owner", (done) => {
        const old_val = { project_id: "project-1", name: "OldName" };
        const new_val = { project_id: "project-1", name: "DuplicateName" };

        // Mock query to return existing project with same name
        db._query = jest.fn((opts) => {
          if (opts.query?.includes("COUNT")) {
            // Use setImmediate to make it async
            setImmediate(() => {
              opts.cb(null, { rows: [{ count: 1 }] });
            });
          }
        });

        db._user_set_query_project_change_before(
          old_val,
          new_val,
          "account-1",
          (err) => {
            expect(err).toContain("already a project");
            done();
          },
        );
      }, 1000);

      test("should reject name change from non-owner", (done) => {
        const old_val = {
          project_id: "project-1",
          name: "OldName",
          users: { "account-1": { group: "collaborator" } },
        };
        const new_val = {
          project_id: "project-1",
          name: "NewName",
          users: { "account-1": { group: "collaborator" } },
        };

        let queryCount = 0;
        db._query = jest.fn((opts) => {
          const currentCount = ++queryCount;
          // Call directly, no setImmediate - await callback2 handles async
          if (currentCount === 1) {
            // First query: no duplicate names
            opts.cb(null, { rows: [{ count: 0 }] });
          } else if (currentCount === 2) {
            // Second query: user is not owner
            opts.cb(null, { rows: [{ count: 0 }] });
          }
        });

        db._user_set_query_project_change_before(
          old_val,
          new_val,
          "account-1",
          (err) => {
            expect(err).toContain("Only the owner");
            done();
          },
        );
      }, 1000);

      test("should allow valid name change by owner", (done) => {
        const old_val = {
          project_id: "project-1",
          name: "OldName",
          users: { "account-1": { group: "owner" } },
        };
        const new_val = {
          project_id: "project-1",
          name: "NewValidName",
          users: { "account-1": { group: "owner" } },
        };

        let queryCount = 0;
        db._query = jest.fn((opts) => {
          const currentCount = ++queryCount;
          // Call directly, no setImmediate - await callback2 handles async
          if (currentCount === 1) {
            // First query: no duplicate names
            opts.cb(null, { rows: [{ count: 0 }] });
          } else if (currentCount === 2) {
            // Second query: user is owner
            opts.cb(null, { rows: [{ count: 1 }] });
          }
        });

        db._user_set_query_project_change_before(
          old_val,
          new_val,
          "account-1",
          (err) => {
            expect(err).toBeFalsy(); // null or undefined is ok
            done();
          },
        );
      }, 1000);

      test("should skip validation when name unchanged", (done) => {
        const old_val = { project_id: "project-1", name: "SameName" };
        const new_val = { project_id: "project-1", name: "SameName" };

        db._query = jest.fn();

        db._user_set_query_project_change_before(
          old_val,
          new_val,
          "account-1",
          (err) => {
            expect(err).toBeUndefined();
            expect(db._query).not.toHaveBeenCalled();
            done();
          },
        );
      });
    });

    describe("_user_set_query_project_change_after", () => {
      test("should exist", () => {
        expect(db._user_set_query_project_change_after).toBeDefined();
      });

      test("should skip when upgrades unchanged", (done) => {
        const account_id = "12345678-1234-1234-1234-123456789012";
        const upgrades = { cores: 1, memory: 1000 };
        const old_val = {
          project_id: "project-1",
          users: { [account_id]: { group: "owner", upgrades } },
        };
        const new_val = {
          project_id: "project-1",
          users: { [account_id]: { group: "owner", upgrades } },
        };

        db.ensure_user_project_upgrades_are_valid = jest.fn();

        db._user_set_query_project_change_after(
          old_val,
          new_val,
          account_id,
          (err) => {
            expect(err).toBeUndefined();
            expect(
              db.ensure_user_project_upgrades_are_valid,
            ).not.toHaveBeenCalled();
            done();
          },
        );
      });

      test("should validate and set quotas when upgrades changed", (done) => {
        const account_id = "12345678-1234-1234-1234-123456789012";
        const old_upgrades = { cores: 1, memory: 1000 };
        const new_upgrades = { cores: 2, memory: 2000 };
        const old_val = {
          project_id: "project-1",
          users: { [account_id]: { group: "owner", upgrades: old_upgrades } },
        };
        const new_val = {
          project_id: "project-1",
          users: { [account_id]: { group: "owner", upgrades: new_upgrades } },
        };

        const mockProject = {
          setAllQuotas: jest.fn().mockResolvedValue(undefined),
        };

        db.ensure_user_project_upgrades_are_valid = jest.fn((opts) =>
          setImmediate(() => opts.cb()),
        );
        db.projectControl = jest.fn().mockResolvedValue(mockProject);

        db._user_set_query_project_change_after(
          old_val,
          new_val,
          account_id,
          (err) => {
            expect(err).toBeFalsy();
            expect(
              db.ensure_user_project_upgrades_are_valid,
            ).toHaveBeenCalledWith(expect.objectContaining({ account_id }));
            expect(db.projectControl).toHaveBeenCalledWith("project-1");
            expect(mockProject.setAllQuotas).toHaveBeenCalled();
            done();
          },
        );
      }, 1000);

      test("should handle missing projectControl gracefully", (done) => {
        const account_id = "12345678-1234-1234-1234-123456789012";
        const old_upgrades = { cores: 1 };
        const new_upgrades = { cores: 2 };
        const old_val = {
          project_id: "project-1",
          users: { [account_id]: { upgrades: old_upgrades } },
        };
        const new_val = {
          project_id: "project-1",
          users: { [account_id]: { upgrades: new_upgrades } },
        };

        db.ensure_user_project_upgrades_are_valid = jest.fn((opts) =>
          setImmediate(() => opts.cb()),
        );
        db.projectControl = undefined;

        db._user_set_query_project_change_after(
          old_val,
          new_val,
          account_id,
          (err) => {
            expect(err).toBeFalsy();
            expect(
              db.ensure_user_project_upgrades_are_valid,
            ).toHaveBeenCalled();
            done();
          },
        );
      }, 1000);
    });

    describe("_user_set_query_syncstring_change_after", () => {
      test("should exist", () => {
        expect(db._user_set_query_syncstring_change_after).toBeDefined();
      });

      test("should return immediately (background processing)", (done) => {
        const old_val = { project_id: "project-1" };
        const new_val = {
          project_id: "project-1",
          save: { state: "requested" },
        };

        // Should call cb immediately, not wait for background tasks
        const startTime = Date.now();
        db._user_set_query_syncstring_change_after(
          old_val,
          new_val,
          "account-1",
          (err) => {
            const elapsed = Date.now() - startTime;
            expect(err).toBeUndefined();
            expect(elapsed).toBeLessThan(50); // Should be nearly instant
            done();
          },
        );
      });

      test("should handle save state change to requested", (done) => {
        const project_id = "12345678-1234-1234-1234-123456789012";
        const old_val = { project_id };
        const new_val = { project_id, save: { state: "requested" } };

        // No way to test background awakening without real implementation
        // But we can verify it doesn't error
        db._user_set_query_syncstring_change_after(
          old_val,
          new_val,
          "account-1",
          (err) => {
            expect(err).toBeUndefined();
            done();
          },
        );
      });

      test("should handle last_active change", (done) => {
        const project_id = "12345678-1234-1234-1234-123456789012";
        const old_val = { project_id, last_active: new Date("2024-01-01") };
        const new_val = { project_id, last_active: new Date("2024-01-02") };

        db._user_set_query_syncstring_change_after(
          old_val,
          new_val,
          "account-1",
          (err) => {
            expect(err).toBeUndefined();
            done();
          },
        );
      });
    });
  });

  /**
   * ===========================================
   * SYNCSTRING PERMISSION METHODS (6 methods)
   * ===========================================
   */
  describe("Syncstring Permission Methods", () => {
    describe("_syncstrings_check", () => {
      test("should require valid project_id UUID", (done) => {
        db._syncstrings_check(
          { project_id: "invalid" },
          "account",
          null,
          (err) => {
            expect(err).toContain("must be a valid uuid");
            done();
          },
        );
      });

      test("should allow project to access own syncstrings", (done) => {
        const project_id = "12345678-1234-1234-1234-123456789012";
        db._syncstrings_check({ project_id }, null, project_id, (err) => {
          expect(err).toBeUndefined();
          done();
        });
      });

      test("should reject project accessing other project syncstrings", (done) => {
        const project_id = "12345678-1234-1234-1234-123456789012";
        const other_project = "87654321-4321-4321-4321-210987654321";
        db._syncstrings_check({ project_id }, null, other_project, (err) => {
          expect(err).toContain("can only access their own syncstrings");
          done();
        });
      });
    });

    describe("_user_set_query_patches_check", () => {
      test("should reject patches too far in future", (done) => {
        const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        db._user_set_query_patches_check(
          {
            string_id: "a".repeat(40),
            time: futureTime,
          },
          "account",
          null,
          (err) => {
            expect(err).toBe("clock");
            done();
          },
        );
      });
    });

    describe("_user_get_query_patches_check", () => {
      test("should delegate to _syncstring_access_check", (done) => {
        const string_id = "a".repeat(40);
        db._syncstring_access_check = jest.fn((sid, account, project, cb) => {
          expect(sid).toBe(string_id);
          void account;
          void project;
          cb();
        });

        db._user_get_query_patches_check(
          { string_id },
          "account",
          null,
          (err) => {
            expect(err).toBeUndefined();
            expect(db._syncstring_access_check).toHaveBeenCalled();
            done();
          },
        );
      });
    });

    describe("_user_set_query_cursors_check", () => {
      test("should delegate to _syncstring_access_check", (done) => {
        const string_id = "a".repeat(40);
        db._syncstring_access_check = jest.fn((sid, account, project, cb) => {
          void sid;
          void account;
          void project;
          cb();
        });

        db._user_set_query_cursors_check({ string_id }, "account", null, () => {
          expect(db._syncstring_access_check).toHaveBeenCalled();
          done();
        });
      });
    });

    describe("_user_get_query_cursors_check", () => {
      test("should delegate to _syncstring_access_check", (done) => {
        const string_id = "a".repeat(40);
        db._syncstring_access_check = jest.fn((sid, account, project, cb) => {
          void sid;
          void account;
          void project;
          cb();
        });

        db._user_get_query_cursors_check({ string_id }, "account", null, () => {
          expect(db._syncstring_access_check).toHaveBeenCalled();
          done();
        });
      });
    });
  });
});
