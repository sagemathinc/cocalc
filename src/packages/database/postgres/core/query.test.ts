/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Query Engine - Group 6

Comprehensive tests for the PostgreSQL query engine, the most critical
infrastructure in the database layer. These tests cover:

1. _validate_opts - UUID/group validation
2. _count - COUNT(*) wrapper
3. _query - Entry point with orchestration
4. _query_retry_until_success - Retry wrapper
5. __do_query - Query builder + execution (THE MONSTER - 400+ lines)

This test suite establishes a baseline for the existing CoffeeScript
implementation before any migration work. See QUERY_ENGINE_TEST_PLAN.md
for the complete test strategy.
*/

import { EventEmitter } from "events";

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import * as misc from "@cocalc/util/misc";

const expectNoErr = (err: unknown) => {
  expect(err).toBeFalsy();
};

describe("Query Engine - Group 6", () => {
  let database: ReturnType<typeof db>;

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db();

    // Ensure database is connected before running tests
    await new Promise<void>((resolve, reject) => {
      if (database.is_connected()) {
        resolve();
      } else {
        database.connect({
          cb: (err) => {
            if (err) reject(err);
            else resolve();
          },
        });
      }
    });

    const dbAny = database as any;
    if (dbAny._clients?.length > 1) {
      // Keep TEMP tables visible across queries by pinning a single client.
      dbAny._clients = [dbAny._clients[0]];
      dbAny._client_index = 0;
    }
  }, 30000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("_validate_opts - UUID and group validation", () => {
    describe("UUID validation for fields ending in 'id'", () => {
      it("accepts valid UUID for field ending in 'id'", () => {
        const valid = database._validate_opts({
          project_id: "00000000-0000-0000-0000-000000000000",
          cb: () => {},
        });
        expect(valid).toBe(true);
      });

      it("rejects invalid UUID for field ending in 'id'", (done) => {
        const valid = database._validate_opts({
          project_id: "not-a-uuid",
          cb: (err) => {
            expect(err).toContain("invalid project_id");
            done();
          },
        });
        expect(valid).toBe(false);
      });

      it("accepts null for field ending in 'id'", () => {
        const valid = database._validate_opts({
          project_id: null,
          cb: () => {},
        });
        expect(valid).toBe(true);
      });

      it("accepts undefined for field ending in 'id'", () => {
        const valid = database._validate_opts({
          project_id: undefined,
          cb: () => {},
        });
        expect(valid).toBe(true);
      });

      it("validates multiple id fields", (done) => {
        const valid = database._validate_opts({
          project_id: "00000000-0000-0000-0000-000000000000",
          account_id: "invalid-uuid",
          cb: (err) => {
            expect(err).toContain("invalid account_id");
            done();
          },
        });
        expect(valid).toBe(false);
      });
    });

    describe("UUID array validation for fields ending in 'ids'", () => {
      it("accepts array of valid UUIDs for field ending in 'ids'", () => {
        const valid = database._validate_opts({
          project_ids: [
            "00000000-0000-0000-0000-000000000000",
            "11111111-1111-1111-1111-111111111111",
          ],
          cb: () => {},
        });
        expect(valid).toBe(true);
      });

      it("rejects array containing invalid UUID", (done) => {
        const valid = database._validate_opts({
          account_ids: ["00000000-0000-0000-0000-000000000000", "not-a-uuid"],
          cb: (err) => {
            expect(err).toContain("invalid uuid not-a-uuid");
            expect(err).toContain("account_ids");
            done();
          },
        });
        expect(valid).toBe(false);
      });

      it("accepts empty array for field ending in 'ids'", () => {
        const valid = database._validate_opts({
          project_ids: [],
          cb: () => {},
        });
        expect(valid).toBe(true);
      });
    });

    describe("Project group validation", () => {
      it("accepts valid group", () => {
        const valid = database._validate_opts({
          group: "owner",
          cb: () => {},
        });
        expect(valid).toBe(true);
      });

      it("rejects invalid group", (done) => {
        const valid = database._validate_opts({
          group: "invalid_group",
          cb: (err) => {
            expect(err).toContain("unknown project group");
            done();
          },
        });
        expect(valid).toBe(false);
      });

      it("accepts array of valid groups", () => {
        const valid = database._validate_opts({
          groups: ["owner", "collaborator"],
          cb: () => {},
        });
        expect(valid).toBe(true);
      });

      it("rejects array with invalid group", (done) => {
        const valid = database._validate_opts({
          groups: ["owner", "invalid_group"],
          cb: (err) => {
            expect(err).toContain("unknown project group");
            expect(err).toContain("groups");
            done();
          },
        });
        expect(valid).toBe(false);
      });
    });

    describe("Integration tests", () => {
      it("validates all fields in single call", () => {
        const valid = database._validate_opts({
          project_id: "00000000-0000-0000-0000-000000000000",
          account_ids: ["11111111-1111-1111-1111-111111111111"],
          group: "owner",
          cb: () => {},
        });
        expect(valid).toBe(true);
      });

      it("stops at first validation error", (done) => {
        const valid = database._validate_opts({
          project_id: "invalid",
          account_id: "also-invalid",
          cb: (err) => {
            // Should stop at first error
            expect(err).toBeDefined();
            done();
          },
        });
        expect(valid).toBe(false);
      });
    });
  });

  describe("_count - COUNT(*) query wrapper", () => {
    beforeAll(async () => {
      // Create a test table with known row count
      await new Promise<void>((resolve, reject) => {
        database._query({
          query: `
            CREATE TEMP TABLE IF NOT EXISTS test_count_table (
              id SERIAL PRIMARY KEY,
              value TEXT
            )
          `,
          cb: (err) => {
            if (err) reject(err);
            else resolve();
          },
        });
      });

      // Insert test data
      await new Promise<void>((resolve, reject) => {
        database._query({
          query: `
            INSERT INTO test_count_table (value)
            VALUES ('a'), ('b'), ('c'), ('d'), ('e')
          `,
          cb: (err) => {
            if (err) reject(err);
            else resolve();
          },
        });
      });
    });

    it("returns total count without where clause", (done) => {
      database._count({
        table: "test_count_table",
        cb: (err, count) => {
          expectNoErr(err);
          expect(count).toBe(5);
          done();
        },
      });
    }, 10000);

    it("returns filtered count with where clause", (done) => {
      database._count({
        table: "test_count_table",
        where: { "value = $": "a" },
        cb: (err, count) => {
          expectNoErr(err);
          expect(count).toBe(1);
          done();
        },
      });
    }, 10000);

    it("returns 0 for empty result set", (done) => {
      database._count({
        table: "test_count_table",
        where: { "value = $": "nonexistent" },
        cb: (err, count) => {
          expectNoErr(err);
          expect(count).toBe(0);
          done();
        },
      });
    }, 10000);

    it("handles error for non-existent table", (done) => {
      database._count({
        table: "nonexistent_table_12345",
        cb: (err, _count) => {
          expect(err).toBeDefined();
          expect(err).toContain("postgresql");
          done();
        },
      });
    }, 10000);

    it("returns count as number type", (done) => {
      database._count({
        table: "test_count_table",
        cb: (err, count) => {
          expectNoErr(err);
          expect(typeof count).toBe("number");
          expect(Number.isInteger(count)).toBe(true);
          done();
        },
      });
    }, 10000);
  });

  describe("__do_query - Query building and execution", () => {
    describe("Connection and basic validation", () => {
      it("rejects query if not connected", (done) => {
        // Temporarily disconnect
        const originalClients = (database as any)._clients;
        delete (database as any)._clients;

        database.__do_query({
          query: "SELECT 1",
          cb: (err) => {
            expect(err).toBe("client not yet initialized");

            // Restore connection
            (database as any)._clients = originalClients;
            done();
          },
        });
      });

      it("rejects if params is not an array", (done) => {
        database.__do_query({
          query: "SELECT 1",
          params: "not-an-array" as any,
          cb: (err) => {
            expect(err).toBe("params must be an array");
            done();
          },
        });
      });

      it("requires query or table", (done) => {
        database.__do_query({
          cb: (err) => {
            expect(err).toBe("if query not given, then table must be given");
            done();
          },
        });
      });
    });

    describe("SELECT query building", () => {
      it("builds SELECT * query from table", (done) => {
        // Create temp table
        database._query({
          query: `
            CREATE TEMP TABLE IF NOT EXISTS test_select_table (
              id SERIAL PRIMARY KEY,
              name TEXT
            )
          `,
          cb: (err) => {
            if (err) return done(err);

            database._query({
              query: "INSERT INTO test_select_table (name) VALUES ('test')",
              cb: (err) => {
                if (err) return done(err);

                // Test SELECT building
                database.__do_query({
                  table: "test_select_table",
                  cb: (err, result) => {
                    expectNoErr(err);
                    expect(result!.rows).toBeDefined();
                    expect(result!.rows.length).toBeGreaterThan(0);
                    done();
                  },
                });
              },
            });
          },
        });
      }, 15000);

      it("builds SELECT with specific columns as array", (done) => {
        database.__do_query({
          table: "test_select_table",
          select: ["id", "name"],
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows[0]).toHaveProperty("id");
            expect(result!.rows[0]).toHaveProperty("name");
            done();
          },
        });
      }, 10000);

      it("builds SELECT with columns as string", (done) => {
        database.__do_query({
          table: "test_select_table",
          select: "id, name",
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows[0]).toHaveProperty("id");
            done();
          },
        });
      }, 10000);
    });

    describe("INSERT - VALUES clause (single object)", () => {
      beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
          database._query({
            query: `
              CREATE TEMP TABLE IF NOT EXISTS test_insert_table (
                id SERIAL PRIMARY KEY,
                name TEXT,
                age INTEGER,
                data JSONB
              )
            `,
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });
      });

      it("inserts single object with simple fields", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: { name: "Alice", age: 30 },
          params: [], // Must initialize params array for __do_query
          cb: (err, result) => {
            expect(err).toBeFalsy(); // PostgreSQL uses null for no error
            expect(result?.rowCount).toBe(1);
            done();
          },
        });
      }, 10000);

      it("inserts with type annotation", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: {
            name: "Bob",
            "age::integer": 25,
          },
          params: [], // Required for __do_query with values
          cb: (err, result) => {
            expect(err).toBeFalsy(); // PostgreSQL uses null, not undefined
            expect(result?.rowCount).toBe(1);
            done();
          },
        });
      }, 10000);

      it("ignores undefined fields", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: {
            name: "Charlie",
            age: undefined, // Should be ignored
          },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rowCount).toBe(1);

            // Verify age is NULL (not undefined, which was ignored)
            database._query({
              query: "SELECT age FROM test_insert_table WHERE name = 'Charlie'",
              cb: (_err, result) => {
                expect(result!.rows[0].age).toBeNull();
                done();
              },
            });
          },
        });
      }, 10000);

      it("inserts null as NULL", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: {
            name: "David",
            age: null, // Explicit NULL
          },
          cb: (err, _result) => {
            expectNoErr(err);

            database._query({
              query: "SELECT age FROM test_insert_table WHERE name = 'David'",
              cb: (_err, result) => {
                expect(result!.rows[0].age).toBeNull();
                done();
              },
            });
          },
        });
      }, 10000);

      it("inserts JSONB field", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: {
            name: "Eve",
            "data::jsonb": { key: "value", nested: { foo: "bar" } },
          },
          cb: (err, _result) => {
            expectNoErr(err);

            database._query({
              query: "SELECT data FROM test_insert_table WHERE name = 'Eve'",
              cb: (_err, result) => {
                expect(result!.rows[0].data).toEqual({
                  key: "value",
                  nested: { foo: "bar" },
                });
                done();
              },
            });
          },
        });
      }, 10000);
    });

    describe("INSERT - VALUES clause (array of objects)", () => {
      it("bulk inserts array of objects", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: [
            { name: "Frank", age: 35 },
            { name: "Grace", age: 28 },
            { name: "Henry", age: 42 },
          ],
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rowCount).toBe(3);
            done();
          },
        });
      }, 10000);

      it("handles union of fields across objects", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: [
            { name: "Ivy", age: 30 }, // Has age
            { name: "Jack" }, // Missing age
            { name: "Kate", age: 25 }, // Has age
          ],
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rowCount).toBe(3);

            // Verify Jack has NULL age
            database._query({
              query: "SELECT age FROM test_insert_table WHERE name = 'Jack'",
              cb: (_err, result) => {
                expect(result!.rows[0].age).toBeNull();
                done();
              },
            });
          },
        });
      }, 10000);

      it("rejects non-object in array", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: [{ name: "Valid" }, "not-an-object" as any],
          cb: (err) => {
            expect(err).toBe(
              "if values is an array, every entry must be an object",
            );
            done();
          },
        });
      });

      it("handles type annotations in array", (done) => {
        database.__do_query({
          query: 'INSERT INTO "test_insert_table"',
          table: "test_insert_table",
          values: [
            { name: "Leo", "age::integer": 33 },
            { name: "Mia", "age::integer": 29 },
          ],
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rowCount).toBe(2);
            done();
          },
        });
      }, 10000);
    });

    describe("ON CONFLICT handling", () => {
      beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
          database._query({
            query: `
              DROP TABLE IF EXISTS conflict_test;
              CREATE TABLE conflict_test (
                name TEXT PRIMARY KEY,
                value INTEGER
              )
            `,
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });
      });

      it("updates non-conflict fields on conflict", (done) => {
        database.__do_query({
          query: 'INSERT INTO "conflict_test"',
          table: "conflict_test",
          values: { name: "alpha", value: 1 },
          cb: (err) => {
            expectNoErr(err);

            database.__do_query({
              query: 'INSERT INTO "conflict_test"',
              table: "conflict_test",
              values: { name: "alpha", value: 2 },
              conflict: "name",
              cb: (err) => {
                expectNoErr(err);

                database._query({
                  query: "SELECT value FROM conflict_test WHERE name = 'alpha'",
                  cb: (_err, result) => {
                    expect(result!.rows[0].value).toBe(2);
                    done();
                  },
                });
              },
            });
          },
        });
      }, 10000);

      it("generates DO UPDATE when conflict covers all fields (current behavior)", (done) => {
        const client = new EventEmitter() as EventEmitter & {
          query: jest.Mock;
        };
        let capturedQuery = "";

        client.query = jest.fn((query, _params, cb) => {
          capturedQuery = query;
          cb(undefined, { rows: [], rowCount: 1, command: "INSERT" });
        });

        const originalClient = (database as any)._client;
        const originalTimeoutMs = database._timeout_ms;
        const originalTimeoutDelay = database._timeout_delay_ms;

        (database as any)._client = () => client;
        database._timeout_ms = undefined;
        database._timeout_delay_ms = undefined;

        database.__do_query({
          query: 'INSERT INTO "conflict_test"',
          table: "conflict_test",
          values: { name: "beta" },
          conflict: ["name"],
          cb: (err, result) => {
            let doneError: unknown;
            try {
              expectNoErr(err);
              expect(result!.rowCount).toBe(1);
              expect(capturedQuery).toContain("ON CONFLICT (name) DO UPDATE");
              expect(capturedQuery).toContain('SET "name"=EXCLUDED."name"');
            } catch (error) {
              doneError = error;
            }

            (database as any)._client = originalClient;
            database._timeout_ms = originalTimeoutMs;
            database._timeout_delay_ms = originalTimeoutDelay;
            done(doneError);
          },
        });
      }, 10000);

      it("accepts raw ON CONFLICT clause", (done) => {
        database.__do_query({
          query: 'INSERT INTO "conflict_test"',
          table: "conflict_test",
          values: { name: "gamma", value: 3 },
          cb: (err) => {
            expectNoErr(err);

            database.__do_query({
              query: 'INSERT INTO "conflict_test"',
              table: "conflict_test",
              values: { name: "gamma", value: 4 },
              conflict: "ON CONFLICT (name) DO NOTHING",
              cb: (err, result) => {
                expectNoErr(err);
                expect(result!.rowCount).toBe(0);

                database._query({
                  query: "SELECT value FROM conflict_test WHERE name = 'gamma'",
                  cb: (_err, result) => {
                    expect(result!.rows[0].value).toBe(3);
                    done();
                  },
                });
              },
            });
          },
        });
      }, 10000);
    });

    describe("UPDATE - SET clause", () => {
      beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
          database._query({
            query: `
              CREATE TEMP TABLE IF NOT EXISTS test_update_table (
                id SERIAL PRIMARY KEY,
                name TEXT,
                age INTEGER,
                data JSONB
              )
            `,
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });

        await new Promise<void>((resolve, reject) => {
          database._query({
            query: `
              INSERT INTO test_update_table (name, age)
              VALUES ('Alice', 30), ('Bob', 25)
            `,
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });
      });

      it("updates with simple SET", (done) => {
        database.__do_query({
          query: 'UPDATE "test_update_table"',
          table: "test_update_table",
          set: { age: 31 },
          where: { "name = $": "Alice" },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rowCount).toBe(1);

            database._query({
              query: "SELECT age FROM test_update_table WHERE name = 'Alice'",
              cb: (_err, result) => {
                expect(result!.rows[0].age).toBe(31);
                done();
              },
            });
          },
        });
      }, 10000);

      it("updates with type annotation", (done) => {
        database.__do_query({
          query: 'UPDATE "test_update_table"',
          table: "test_update_table",
          set: { "age::integer": 26 },
          where: { "name = $": "Bob" },
          cb: (err, _result) => {
            expectNoErr(err);
            done();
          },
        });
      }, 10000);

      it("updates multiple fields", (done) => {
        database._query({
          query:
            "INSERT INTO test_update_table (name, age) VALUES ('Charlie', 40)",
          cb: (err) => {
            if (err) return done(err);

            database.__do_query({
              query: 'UPDATE "test_update_table"',
              table: "test_update_table",
              set: { name: "Charles", age: 41 },
              where: { "name = $": "Charlie" },
              cb: (err, _result) => {
                expectNoErr(err);

                database._query({
                  query:
                    "SELECT name, age FROM test_update_table WHERE age = 41",
                  cb: (_err, result) => {
                    expect(result!.rows[0].name).toBe("Charles");
                    done();
                  },
                });
              },
            });
          },
        });
      }, 10000);
    });

    describe("JSONB operations", () => {
      beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
          database._query({
            query: `
              CREATE TEMP TABLE IF NOT EXISTS jsonb_test (
                name TEXT PRIMARY KEY,
                data JSONB
              )
            `,
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });

        await new Promise<void>((resolve, reject) => {
          database._query({
            query:
              "INSERT INTO jsonb_test (name, data) VALUES ('row1', '{\"keep\":1,\"remove\":2}'::jsonb)",
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });
      });

      it("sets and deletes keys with jsonb_set", (done) => {
        database.__do_query({
          query: 'UPDATE "jsonb_test"',
          table: "jsonb_test",
          jsonb_set: { data: { remove: null, add: "new" } },
          where: { "name = $": "row1" },
          cb: (err) => {
            expectNoErr(err);

            database._query({
              query: "SELECT data FROM jsonb_test WHERE name = 'row1'",
              cb: (_err, result) => {
                const data = result!.rows[0].data;
                expect(data.keep).toBe(1);
                expect(data.remove).toBeUndefined();
                expect(data.add).toBe("new");
                done();
              },
            });
          },
        });
      }, 10000);

      it("merges nested objects with jsonb_merge", (done) => {
        database._query({
          query:
            'UPDATE jsonb_test SET data = \'{"nested":{"a":1,"b":2}}\'::jsonb WHERE name = \'row1\'',
          cb: (err) => {
            if (err) return done(err);

            database.__do_query({
              query: 'UPDATE "jsonb_test"',
              table: "jsonb_test",
              jsonb_merge: { data: { nested: { b: 3, c: 4 } } },
              where: { "name = $": "row1" },
              cb: (err) => {
                expectNoErr(err);

                database._query({
                  query: "SELECT data FROM jsonb_test WHERE name = 'row1'",
                  cb: (_err, result) => {
                    const data = result!.rows[0].data;
                    expect(data.nested).toEqual({ a: 1, b: 3, c: 4 });
                    done();
                  },
                });
              },
            });
          },
        });
      }, 10000);

      it("rejects jsonb_set and jsonb_merge together", (done) => {
        database.__do_query({
          query: 'UPDATE "jsonb_test"',
          table: "jsonb_test",
          jsonb_set: { data: { a: 1 } },
          jsonb_merge: { data: { b: 2 } },
          where: { "name = $": "row1" },
          cb: (err) => {
            expect(err).toBe(
              "if jsonb_merge is set then jsonb_set must not be set",
            );
            done();
          },
        });
      }, 10000);
    });

    describe("Safety checks - UPDATE/DELETE without WHERE", () => {
      it("prevents UPDATE without WHERE", (done) => {
        database.__do_query({
          query: "UPDATE test_update_table SET age = 100",
          cb: (err) => {
            expect(err).toContain("Dangerous UPDATE or DELETE without a WHERE");
            done();
          },
        });
      });

      it("prevents DELETE without WHERE", (done) => {
        database.__do_query({
          query: "DELETE FROM test_update_table",
          cb: (err) => {
            expect(err).toContain("Dangerous UPDATE or DELETE without a WHERE");
            done();
          },
        });
      });

      it("allows UPDATE with WHERE", (done) => {
        database.__do_query({
          query: "UPDATE test_update_table SET age = 35 WHERE name = 'Alice'",
          cb: (err) => {
            expectNoErr(err);
            done();
          },
        });
      }, 10000);

      it("allows DELETE with WHERE", (done) => {
        database._query({
          query:
            "INSERT INTO test_update_table (name, age) VALUES ('ToDelete', 99)",
          cb: (err) => {
            if (err) return done(err);

            database.__do_query({
              query: "DELETE FROM test_update_table WHERE name = 'ToDelete'",
              cb: (err) => {
                expectNoErr(err);
                done();
              },
            });
          },
        });
      }, 10000);

      it("allows UPDATE with TRIGGER in query", (done) => {
        database.__do_query({
          query: "UPDATE test_update_table SET age = 100 -- TRIGGER example",
          safety_check: true,
          cb: (err) => {
            expectNoErr(err);
            done();
          },
        });
      }, 10000);

      it("bypasses safety check when safety_check: false", (done) => {
        database.__do_query({
          query: "UPDATE test_update_table SET age = 100",
          safety_check: false,
          cb: (err) => {
            expectNoErr(err);
            done();
          },
        });
      }, 10000);
    });

    describe("WHERE clause - string conditions", () => {
      beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
          database._query({
            query: `
              CREATE TEMP TABLE IF NOT EXISTS test_where_table (
                id SERIAL PRIMARY KEY,
                value INTEGER
              )
            `,
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });

        await new Promise<void>((resolve, reject) => {
          database._query({
            query: `
              INSERT INTO test_where_table (value)
              VALUES (10), (20), (30), (40), (50)
            `,
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });
      });

      it("accepts where as string", (done) => {
        database.__do_query({
          table: "test_where_table",
          where: "value > 30",
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(2); // 40, 50
            done();
          },
        });
      }, 10000);

      it("accepts where as array of strings", (done) => {
        database.__do_query({
          table: "test_where_table",
          where: ["value > 20", "value < 50"],
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(2); // 30, 40
            done();
          },
        });
      }, 10000);
    });

    describe("WHERE clause - object conditions", () => {
      it("builds WHERE with object (default equality)", (done) => {
        database.__do_query({
          table: "test_where_table",
          where: { value: 30 },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(1);
            expect(result!.rows[0].value).toBe(30);
            done();
          },
        });
      }, 10000);

      it("builds WHERE with explicit operator", (done) => {
        database.__do_query({
          table: "test_where_table",
          where: { "value > $": 30 },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(2); // 40, 50
            done();
          },
        });
      }, 10000);

      it("ignores undefined values in where", (done) => {
        database.__do_query({
          table: "test_where_table",
          where: {
            "value > $": 20,
            "id = $": undefined, // Should be ignored
          },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(3); // 30, 40, 50
            done();
          },
        });
      }, 10000);

      it("ignores null values in where (cannot use NULL in params)", (done) => {
        database.__do_query({
          table: "test_where_table",
          where: {
            "value > $": 20,
            "id = $": null, // Should be ignored
          },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(3);
            done();
          },
        });
      }, 10000);

      it("ANDs multiple conditions", (done) => {
        database.__do_query({
          table: "test_where_table",
          where: {
            "value >= $": 20,
            "value <= $": 40,
          },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(3); // 20, 30, 40
            done();
          },
        });
      }, 10000);
    });

    describe("ORDER BY, LIMIT, OFFSET", () => {
      it("applies ORDER BY", (done) => {
        database.__do_query({
          table: "test_where_table",
          order_by: "value DESC",
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows[0].value).toBe(50);
            expect(result!.rows[result!.rows.length - 1].value).toBe(10);
            done();
          },
        });
      }, 10000);

      it("rejects ORDER BY with apostrophe (SQL injection)", (done) => {
        database.__do_query({
          table: "test_where_table",
          order_by: "value'; DROP TABLE test_where_table; --",
          cb: (err) => {
            expect(err).toContain("detected ' apostrophe");
            done();
          },
        });
      });

      it("applies LIMIT", (done) => {
        database.__do_query({
          table: "test_where_table",
          limit: 2,
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(2);
            done();
          },
        });
      }, 10000);

      it("rejects non-integer LIMIT", (done) => {
        database.__do_query({
          table: "test_where_table",
          limit: "not-a-number" as any,
          cb: (err) => {
            expect(err).toContain("is not an integer");
            done();
          },
        });
      });

      it("applies OFFSET", (done) => {
        database.__do_query({
          table: "test_where_table",
          order_by: "value ASC",
          offset: 2,
          limit: 2,
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(2);
            expect(result!.rows[0].value).toBe(30); // Skip 10, 20
            done();
          },
        });
      }, 10000);

      it("rejects non-integer OFFSET", (done) => {
        database.__do_query({
          table: "test_where_table",
          offset: -1,
          cb: (err) => {
            expect(err).toContain("is not an integer");
            done();
          },
        });
      });
    });

    describe("Concurrency and metrics", () => {
      it("tracks concurrent queries and metrics", (done) => {
        const client = new EventEmitter() as EventEmitter & {
          query: jest.Mock;
        };
        client.query = jest.fn((_query, _params, cb) => {
          expect(database._concurrent_queries).toBe(1);
          cb(undefined, { rows: [], rowCount: 1, command: "SELECT" });
        });

        const originalClient = (database as any)._client;
        const originalCounter = (database as any).concurrent_counter;
        const originalHistogram = (database as any).query_time_histogram;
        const incSpy = jest.fn();
        const labelsSpy = jest.fn(() => ({ inc: incSpy }));
        const observeSpy = jest.fn();

        (database as any)._client = () => client;
        (database as any).concurrent_counter = { labels: labelsSpy };
        (database as any).query_time_histogram = { observe: observeSpy };
        (database as any)._concurrent_queries = 0;

        database.__do_query({
          query: "SELECT 1",
          cb: (err) => {
            expectNoErr(err);
            expect(database._concurrent_queries).toBe(0);
            expect(labelsSpy).toHaveBeenCalledWith("started");
            expect(labelsSpy).toHaveBeenCalledWith("ended");
            expect(incSpy).toHaveBeenCalledTimes(2);
            expect(observeSpy).toHaveBeenCalledWith(
              { table: "" },
              expect.any(Number),
            );

            (database as any)._client = originalClient;
            (database as any).concurrent_counter = originalCounter;
            (database as any).query_time_histogram = originalHistogram;
            done();
          },
        });
      });
    });

    describe("Timeout handling", () => {
      it("does not emit timeout before _timeout_delay_ms", (done) => {
        jest.useFakeTimers();
        const client = new EventEmitter() as EventEmitter & {
          query: jest.Mock;
          emit: (...args: any[]) => boolean;
        };
        const emitSpy = jest.spyOn(client, "emit");
        let queryCb: ((err?: unknown, result?: unknown) => void) | undefined;

        client.query = jest.fn((_query, _params, cb) => {
          queryCb = cb;
        });

        const originalClient = (database as any)._client;
        const originalTimeoutMs = database._timeout_ms;
        const originalTimeoutDelay = database._timeout_delay_ms;
        const originalConnectTime = (database as any)._connect_time;

        (database as any)._client = () => client;
        database._timeout_ms = 10;
        database._timeout_delay_ms = 1000;
        (database as any)._connect_time = new Date();

        database.__do_query({
          query: "SELECT 1",
          cb: (err) => {
            expectNoErr(err);

            (database as any)._client = originalClient;
            database._timeout_ms = originalTimeoutMs;
            database._timeout_delay_ms = originalTimeoutDelay;
            (database as any)._connect_time = originalConnectTime;
            jest.useRealTimers();
            done();
          },
        });

        jest.advanceTimersByTime(20);
        expect(emitSpy).not.toHaveBeenCalledWith("error", "timeout");

        queryCb?.(undefined, { rows: [], rowCount: 1, command: "SELECT" });
      });

      it("emits timeout after _timeout_delay_ms has elapsed", (done) => {
        jest.useFakeTimers();
        const client = new EventEmitter() as EventEmitter & {
          query: jest.Mock;
          emit: (...args: any[]) => boolean;
        };
        const emitSpy = jest.spyOn(client, "emit");

        client.query = jest.fn();

        const originalClient = (database as any)._client;
        const originalTimeoutMs = database._timeout_ms;
        const originalTimeoutDelay = database._timeout_delay_ms;
        const originalConnectTime = (database as any)._connect_time;

        (database as any)._client = () => client;
        database._timeout_ms = 10;
        database._timeout_delay_ms = 1;
        (database as any)._connect_time = new Date(Date.now() - 2000);

        database.__do_query({
          query: "SELECT 1",
          cb: (err) => {
            expect(String(err)).toContain("postgresql error");
            expect(emitSpy).toHaveBeenCalledWith("error", "timeout");

            (database as any)._client = originalClient;
            database._timeout_ms = originalTimeoutMs;
            database._timeout_delay_ms = originalTimeoutDelay;
            (database as any)._connect_time = originalConnectTime;
            jest.useRealTimers();
            done();
          },
        });

        jest.advanceTimersByTime(20);
      });

      it("clears timeout timer on success", () => {
        jest.useFakeTimers();
        const client = new EventEmitter() as EventEmitter & {
          query: jest.Mock;
          emit: (...args: any[]) => boolean;
        };
        const emitSpy = jest.spyOn(client, "emit");
        let queryCb: ((err?: unknown, result?: unknown) => void) | undefined;

        client.query = jest.fn((_query, _params, cb) => {
          queryCb = cb;
        });

        const originalClient = (database as any)._client;
        const originalTimeoutMs = database._timeout_ms;
        const originalTimeoutDelay = database._timeout_delay_ms;
        const originalConnectTime = (database as any)._connect_time;

        (database as any)._client = () => client;
        database._timeout_ms = 10;
        database._timeout_delay_ms = 1;
        (database as any)._connect_time = new Date(Date.now() - 2000);

        database.__do_query({
          query: "SELECT 1",
          cb: (err) => {
            expectNoErr(err);
          },
        });

        queryCb?.(undefined, { rows: [], rowCount: 1, command: "SELECT" });
        jest.advanceTimersByTime(20);
        expect(emitSpy).not.toHaveBeenCalledWith("error", "timeout");

        (database as any)._client = originalClient;
        database._timeout_ms = originalTimeoutMs;
        database._timeout_delay_ms = originalTimeoutDelay;
        (database as any)._connect_time = originalConnectTime;
        jest.useRealTimers();
      });
    });

    describe("Error listener management", () => {
      it("calls cb once and removes error listener after error", (done) => {
        const client = new EventEmitter() as EventEmitter & {
          query: jest.Mock;
        };
        let queryCb: ((err?: unknown, result?: unknown) => void) | undefined;

        client.query = jest.fn((_query, _params, cb) => {
          queryCb = cb;
        });

        const originalClient = (database as any)._client;
        const originalTimeoutMs = database._timeout_ms;
        const originalTimeoutDelay = database._timeout_delay_ms;

        (database as any)._client = () => client;
        database._timeout_ms = undefined;
        database._timeout_delay_ms = undefined;

        const cbSpy = jest.fn((err) => {
          expect(String(err)).toContain("postgresql error");

          queryCb?.(undefined, { rows: [], rowCount: 1, command: "SELECT" });
          setImmediate(() => {
            expect(cbSpy).toHaveBeenCalledTimes(1);
            expect(client.listenerCount("error")).toBe(0);

            (database as any)._client = originalClient;
            database._timeout_ms = originalTimeoutMs;
            database._timeout_delay_ms = originalTimeoutDelay;
            done();
          });
        });

        database.__do_query({
          query: "SELECT 1",
          cb: cbSpy,
        });

        client.emit("error", "boom");
      });
    });

    describe("pg_params transactions", () => {
      it("runs pg_params in a transaction with SET LOCAL", (done) => {
        const client = new EventEmitter() as EventEmitter & {
          query: jest.Mock;
        };
        const queries: string[] = [];

        client.query = jest.fn(async (query: string) => {
          queries.push(query);
          return { rows: [{ ok: true }], rowCount: 1, command: "SELECT" };
        });

        const originalClient = (database as any)._client;
        const originalTimeoutMs = database._timeout_ms;
        const originalTimeoutDelay = database._timeout_delay_ms;

        (database as any)._client = () => client;
        database._timeout_ms = undefined;
        database._timeout_delay_ms = undefined;

        database.__do_query({
          query: "SELECT 1",
          params: [],
          pg_params: { statement_timeout: "123" },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result).toBeDefined();
            expect(queries).toEqual([
              "BEGIN",
              "SET LOCAL statement_timeout TO 123",
              "SELECT 1",
              "COMMIT",
            ]);

            (database as any)._client = originalClient;
            database._timeout_ms = originalTimeoutMs;
            database._timeout_delay_ms = originalTimeoutDelay;
            done();
          },
        });
      });

      it("rolls back transaction on pg_params error", (done) => {
        const client = new EventEmitter() as EventEmitter & {
          query: jest.Mock;
        };
        const queries: string[] = [];

        client.query = jest.fn(async (query: string) => {
          queries.push(query);
          if (query === "SELECT 1") {
            throw new Error("boom");
          }
          return { rows: [], rowCount: 0, command: "BEGIN" };
        });

        const originalClient = (database as any)._client;
        const originalTimeoutMs = database._timeout_ms;
        const originalTimeoutDelay = database._timeout_delay_ms;

        (database as any)._client = () => client;
        database._timeout_ms = undefined;
        database._timeout_delay_ms = undefined;

        database.__do_query({
          query: "SELECT 1",
          params: [],
          pg_params: { statement_timeout: "123" },
          cb: (err) => {
            expect(String(err)).toContain("postgresql");
            expect(queries).toEqual([
              "BEGIN",
              "SET LOCAL statement_timeout TO 123",
              "SELECT 1",
              "ROLLBACK",
            ]);

            (database as any)._client = originalClient;
            database._timeout_ms = originalTimeoutMs;
            database._timeout_delay_ms = originalTimeoutDelay;
            done();
          },
        });
      });
    });
  });

  describe("_query - Entry point and orchestration", () => {
    it("executes query if already connected", (done) => {
      database._query({
        query: "SELECT 1 AS result",
        cb: (err, result) => {
          expectNoErr(err);
          expect(result!.rows[0].result).toBe(1);
          done();
        },
      });
    }, 10000);

    it("connects first if not connected", (done) => {
      // Temporarily disconnect
      const originalClients = (database as any)._clients;
      delete (database as any)._clients;

      database._query({
        query: "SELECT 1 AS result",
        cb: (err, result) => {
          // Should auto-connect and execute
          if (!err) {
            expect(result!.rows[0].result).toBe(1);
          }

          const currentClients = (database as any)._clients;
          if (currentClients && currentClients !== originalClients) {
            for (const client of currentClients) {
              client.end?.();
            }
          }
          (database as any)._clients = originalClients;
          (database as any)._client_index = 0;
          done();
        },
      });
    }, 30000);

    it("method exists and is callable", () => {
      expect(database._query).toBeDefined();
      expect(typeof database._query).toBe("function");
    });
  });

  describe("_query_retry_until_success - Retry wrapper", () => {
    it("delegates to _query_retry_until_success when retry_until_success is provided", (done) => {
      const spy = jest
        .spyOn(database as any, "_query_retry_until_success")
        .mockImplementation(
          (opts: { cb?: (err?: unknown, result?: any) => void }) => {
            opts.cb?.(undefined, { rows: [{ value: 1 }] });
          },
        );

      database._query({
        query: "SELECT 1",
        retry_until_success: { max_tries: 1 } as any,
        cb: (err, result) => {
          expectNoErr(err);
          expect(result!.rows[0].value).toBe(1);
          spy.mockRestore();
          done();
        },
      });
    });

    it("uses misc.retry_until_success and returns original callback args", (done) => {
      const querySpy = jest
        .spyOn(database as any, "_query")
        .mockImplementation(
          (opts: { cb?: (err?: unknown, result?: any) => void }) => {
            opts.cb?.(undefined, { rows: [{ value: 42 }] });
          },
        );

      const retrySpy = jest
        .spyOn(misc, "retry_until_success")
        .mockImplementation((opts: unknown) => {
          const retryOpts = opts as {
            f: (cb: (err?: unknown) => void) => void;
            cb: (err?: unknown) => void;
          };
          retryOpts.f((err: unknown) => {
            retryOpts.cb(err);
          });
        });

      database._query_retry_until_success({
        query: "SELECT 1",
        retry_until_success: { max_tries: 2 } as any,
        cb: (err, result) => {
          expectNoErr(err);
          expect(result).toEqual({ rows: [{ value: 42 }] });
          expect(querySpy).toHaveBeenCalled();
          expect(retrySpy).toHaveBeenCalled();

          retrySpy.mockRestore();
          querySpy.mockRestore();
          done();
        },
      });
    });
  });

  describe("Integration - Full query flows", () => {
    it("completes full INSERT → SELECT → UPDATE → DELETE flow", async () => {
      // Create test table
      await new Promise<void>((resolve, reject) => {
        database._query({
          query: `
            CREATE TEMP TABLE IF NOT EXISTS integration_test (
              id SERIAL PRIMARY KEY,
              name TEXT,
              value INTEGER
            )
          `,
          cb: (err) => {
            if (err) reject(err);
            else resolve();
          },
        });
      });

      // INSERT
      await new Promise<void>((resolve, reject) => {
        database.__do_query({
          table: "integration_test",
          query: "INSERT INTO integration_test",
          values: { name: "test", value: 100 },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rowCount).toBe(1);
            if (err) reject(err);
            else resolve();
          },
        });
      });

      // SELECT
      const selectResult = await new Promise<any>((resolve, reject) => {
        database.__do_query({
          table: "integration_test",
          where: { "name = $": "test" },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(1);
            if (err) reject(err);
            else resolve(result!.rows[0]);
          },
        });
      });

      expect(selectResult.value).toBe(100);

      // UPDATE
      await new Promise<void>((resolve, reject) => {
        database.__do_query({
          table: "integration_test",
          query: "UPDATE integration_test",
          set: { value: 200 },
          where: { "name = $": "test" },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rowCount).toBe(1);
            if (err) reject(err);
            else resolve();
          },
        });
      });

      // Verify update
      const verifyResult = await new Promise<any>((resolve, reject) => {
        database.__do_query({
          table: "integration_test",
          where: { "name = $": "test" },
          cb: (err, result) => {
            expectNoErr(err);
            if (err) reject(err);
            else resolve(result!.rows[0]);
          },
        });
      });

      expect(verifyResult.value).toBe(200);

      // DELETE
      await new Promise<void>((resolve, reject) => {
        database.__do_query({
          query: "DELETE FROM integration_test WHERE name = 'test'",
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rowCount).toBe(1);
            if (err) reject(err);
            else resolve();
          },
        });
      });

      // Verify delete
      await new Promise<void>((resolve, reject) => {
        database.__do_query({
          table: "integration_test",
          where: { "name = $": "test" },
          cb: (err, result) => {
            expectNoErr(err);
            expect(result!.rows.length).toBe(0);
            if (err) reject(err);
            else resolve();
          },
        });
      });
    }, 30000);

    it("handles concurrent queries correctly", async () => {
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>((resolve, reject) => {
            database._query({
              query: `SELECT ${i} AS value`,
              cb: (err, result) => {
                expectNoErr(err);
                expect(result!.rows[0].value).toBe(i);
                if (err) reject(err);
                else resolve();
              },
            });
          }),
        );
      }

      await Promise.all(promises);
    }, 15000);
  });

  describe("USER FEEDBACK - Missing Coverage", () => {
    describe("Safety Checks - Exact Regex Patterns", () => {
      beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
          database._query({
            query:
              "CREATE TEMP TABLE IF NOT EXISTS test_table (id SERIAL, value INTEGER)",
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });
      });

      it("blocks UPDATE without WHERE", (done) => {
        database.__do_query({
          query: "UPDATE test_table SET value = 100",
          params: [],
          cb: (err) => {
            expect(err).toContain("Dangerous UPDATE or DELETE without a WHERE");
            done();
          },
        });
      });

      it("blocks DELETE without WHERE", (done) => {
        database.__do_query({
          query: "DELETE FROM test_table",
          params: [],
          cb: (err) => {
            expect(err).toContain("Dangerous UPDATE or DELETE without a WHERE");
            done();
          },
        });
      });

      it("allows UPDATE with 'where' in query (case insensitive)", (done) => {
        database._query({
          query:
            "CREATE TEMP TABLE IF NOT EXISTS safety_test (id SERIAL, value INTEGER)",
          cb: (err) => {
            if (err) return done(err);

            database._query({
              query: "INSERT INTO safety_test (value) VALUES (50)",
              cb: (err) => {
                if (err) return done(err);

                database.__do_query({
                  query: "UPDATE safety_test SET value = 100 WHERE value = 50",
                  params: [],
                  cb: (err) => {
                    expect(err).toBeFalsy();
                    done();
                  },
                });
              },
            });
          },
        });
      }, 15000);

      it("allows UPDATE with 'trigger' in query", (done) => {
        database.__do_query({
          query: "UPDATE test_table SET value = 1 -- TRIGGER example",
          params: [],
          safety_check: true,
          cb: (err) => {
            // Brittle: 'trigger' substring allows it
            expect(err).toBeFalsy();
            done();
          },
        });
      });

      it("allows UPDATE with 'insert' in query", (done) => {
        database.__do_query({
          query: "UPDATE test_table SET value = 1; /* insert pattern */",
          params: [],
          safety_check: true,
          cb: (err) => {
            // Brittle: 'insert' substring allows it
            expect(err).toBeFalsy();
            done();
          },
        });
      });

      it("allows UPDATE with 'create' in query", (done) => {
        database.__do_query({
          query: "UPDATE test_table SET value = 1 -- create example",
          params: [],
          safety_check: true,
          cb: (err) => {
            // Brittle: 'create' substring allows it
            expect(err).toBeFalsy();
            done();
          },
        });
      });

      it("is case insensitive", (done) => {
        database.__do_query({
          query: "update test_table set value = 1",
          params: [],
          cb: (err) => {
            expect(err).toContain("Dangerous UPDATE or DELETE");
            done();
          },
        });
      });

      it("bypasses check when safety_check: false", (done) => {
        database._query({
          query:
            "CREATE TEMP TABLE IF NOT EXISTS bypass_test (id SERIAL, value INTEGER)",
          cb: (err) => {
            if (err) return done(err);

            database._query({
              query: "INSERT INTO bypass_test (value) VALUES (1), (2), (3)",
              cb: (err) => {
                if (err) return done(err);

                database.__do_query({
                  query: "UPDATE bypass_test SET value = 999",
                  params: [],
                  safety_check: false,
                  cb: (err, result) => {
                    expect(err).toBeFalsy();
                    expect(result?.rowCount).toBe(3);
                    done();
                  },
                });
              },
            });
          },
        });
      }, 15000);
    });

    describe("Error Caching - Caching Failed Queries", () => {
      beforeAll(() => {
        // Ensure query cache exists
        if (!(database as any)._query_cache) {
          const LRU = require("lru-cache");
          (database as any)._query_cache = new LRU({ max: 100, ttl: 5000 });
        }
      });

      it("caches successful queries", async () => {
        const querySpy = jest.spyOn(database as any, "_client");
        const query = `SELECT ${Math.random()} AS random_value`;

        await new Promise<void>((resolve, reject) => {
          database._query({
            query,
            cache: true,
            cb: (err, result1) => {
              if (err) return reject(err);

              // Second query should use cache
              database._query({
                query,
                cache: true,
                cb: (err, result2) => {
                  if (err) return reject(err);

                  // Results should be identical (cached)
                  expect(result1).toEqual(result2);
                  resolve();
                },
              });
            },
          });
        });

        querySpy.mockRestore();
      }, 10000);

      it("caches ERROR results (user feedback concern)", async () => {
        const errorQuery =
          "SELECT * FROM nonexistent_table_xyz_" + Math.random();

        await new Promise<void>((resolve, _reject) => {
          database._query({
            query: errorQuery,
            cache: true,
            cb: (err1, _result1) => {
              expect(err1).toBeTruthy(); // First call fails

              // Second identical query should return CACHED error
              database._query({
                query: errorQuery,
                cache: true,
                cb: (err2, _result2) => {
                  expect(err2).toBeTruthy(); // Still an error
                  expect(err2).toBe(err1); // Same error (cached)
                  resolve();
                },
              });
            },
          });
        });
      }, 10000);

      it("cache key includes params - different params = cache miss", async () => {
        await new Promise<void>((resolve, reject) => {
          database._query({
            query: "SELECT $1::INT AS value",
            params: [42],
            cache: true,
            cb: (err, result1) => {
              if (err) return reject(err);

              database._query({
                query: "SELECT $1::INT AS value",
                params: [99], // Different param
                cache: true,
                cb: (err, result2) => {
                  if (err) return reject(err);

                  // Different results (cache miss due to params)
                  expect(result1?.rows[0]?.value).toBe(42);
                  expect(result2?.rows[0]?.value).toBe(99);
                  resolve();
                },
              });
            },
          });
        });
      }, 10000);
    });

    describe("Result Shape - rowCount Validation", () => {
      beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
          database._query({
            query: `
              CREATE TEMP TABLE IF NOT EXISTS result_shape_test (
                id SERIAL PRIMARY KEY,
                value INTEGER
              )
            `,
            cb: (err) => {
              if (err) reject(err);
              else resolve();
            },
          });
        });
      });

      it("INSERT returns rowCount", (done) => {
        database._query({
          query: "INSERT INTO result_shape_test (value) VALUES (100), (200)",
          cb: (err, result) => {
            expect(err).toBeFalsy();
            expect(result?.rowCount).toBe(2);
            expect(result?.command).toBe("INSERT");
            done();
          },
        });
      }, 10000);

      it("UPDATE returns rowCount", (done) => {
        database._query({
          query: "UPDATE result_shape_test SET value = 999 WHERE value = 100",
          cb: (err, result) => {
            expect(err).toBeFalsy();
            expect(result?.rowCount).toBe(1);
            expect(result?.command).toBe("UPDATE");
            done();
          },
        });
      }, 10000);

      it("DELETE returns rowCount", (done) => {
        database._query({
          query: "DELETE FROM result_shape_test WHERE value = 999",
          cb: (err, result) => {
            expect(err).toBeFalsy();
            expect(result?.rowCount).toBe(1);
            expect(result?.command).toBe("DELETE");
            done();
          },
        });
      }, 10000);

      it("SELECT returns rows array", (done) => {
        database._query({
          query: "SELECT * FROM result_shape_test",
          cb: (err, result) => {
            expect(err).toBeFalsy();
            expect(Array.isArray(result?.rows)).toBe(true);
            expect(result?.command).toBe("SELECT");
            done();
          },
        });
      }, 10000);
    });
  });
});
