/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Test suite for PostgreSQL synctable extension methods
// Tests the CoffeeScript implementation first to establish baseline

import type { CB } from "@cocalc/util/types/callback";

import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import type { ChangefeedSelect, PostgreSQL } from "../postgres/types";
import type { ProjectAndUserTracker } from "../postgres/project/project-and-user-tracker";
import { PostgreSQL as PostgreSQLClass } from "../postgres";

let projectTrackerInit: jest.Mock;
let projectTrackerOnce: jest.Mock;

jest.mock("../postgres/changefeed/changefeed", () => ({
  Changes: jest.fn(),
}));

jest.mock("../postgres/project/project-and-user-tracker", () => ({
  ProjectAndUserTracker: jest.fn().mockImplementation(() => ({
    init: projectTrackerInit,
    once: projectTrackerOnce,
  })),
}));

describe("PostgreSQL Synctable Methods", () => {
  type SynctablePostgreSQL = PostgreSQL & {
    _listening?: Record<string, number>;
    _close_test_query?: () => void;
    _ensure_trigger_exists: (
      table: string,
      select: ChangefeedSelect,
      watch: string[],
      cb: CB,
    ) => void;
    _notification: (mesg: { channel: string; payload: string }) => void;
    _clear_listening_state: () => void;
    _project_and_user_tracker?: ProjectAndUserTracker;
    _project_and_user_tracker_cbs?: Array<CB<ProjectAndUserTracker>>;
  };

  let db: SynctablePostgreSQL;

  beforeAll(async () => {
    await initEphemeralDatabase({});
  });

  beforeEach(() => {
    // Create a PostgreSQL instance for testing
    // Connect to the ephemeral database so method wrappers are available
    db = new PostgreSQLClass({ timeout_ms: 0 }) as SynctablePostgreSQL;
    projectTrackerInit = jest.fn().mockResolvedValue(undefined);
    projectTrackerOnce = jest.fn();
  });

  afterEach(() => {
    db?._close_test_query?.();
    db?.disconnect?.();
  });

  afterAll(async () => {
    if (db) {
      db.disconnect?.();
    }
    await testCleanup(db);
  });

  describe("extension methods exist", () => {
    it("should have _ensure_trigger_exists method", () => {
      expect(typeof db._ensure_trigger_exists).toBe("function");
    });

    it("should have _listen method", () => {
      expect(typeof db._listen).toBe("function");
    });

    it("should have _notification method", () => {
      expect(typeof db._notification).toBe("function");
    });

    it("should have _clear_listening_state method", () => {
      expect(typeof db._clear_listening_state).toBe("function");
    });

    it("should have _stop_listening method", () => {
      expect(typeof db._stop_listening).toBe("function");
    });

    it("should have synctable method", () => {
      expect(typeof db.synctable).toBe("function");
    });

    it("should have changefeed method", () => {
      expect(typeof db.changefeed).toBe("function");
    });

    it("should have project_and_user_tracker method", () => {
      expect(typeof db.project_and_user_tracker).toBe("function");
    });
  });

  describe("_clear_listening_state", () => {
    it("should clear listening state", () => {
      db._listening = { some_trigger: 5 };

      db._clear_listening_state();

      expect(db._listening).toEqual({});
    });

    it("should initialize listening state if not exists", () => {
      delete db._listening;

      db._clear_listening_state();

      expect(db._listening).toEqual({});
    });
  });

  describe("_ensure_trigger_exists", () => {
    it("should error when select is empty", (done) => {
      db._query = jest.fn();
      db._ensure_trigger_exists("projects", {}, [], (err) => {
        expect(err).toContain("at least one column selected");
        expect(db._query).not.toHaveBeenCalled();
        done();
      });
    });

    it("should skip trigger creation when trigger already exists", (done) => {
      db._query = jest.fn().mockImplementationOnce((opts) => {
        opts.cb?.(undefined, { rows: [{ count: "1" }] });
      });

      db._ensure_trigger_exists(
        "projects",
        { project_id: "uuid" },
        [],
        (err) => {
          expect(err).toBeFalsy();
          expect(db._query).toHaveBeenCalledTimes(1);
          done();
        },
      );
    });

    it("should create trigger when missing", (done) => {
      db._query = jest.fn().mockImplementation((opts) => {
        if (opts.query.includes("SELECT count(*) FROM pg_trigger")) {
          opts.cb?.(undefined, { rows: [{ count: "0" }] });
          return;
        }
        opts.cb?.(undefined);
      });

      db._ensure_trigger_exists(
        "projects",
        { project_id: "uuid" },
        [],
        (err) => {
          expect(err).toBeFalsy();
          expect(db._query).toHaveBeenCalledWith(
            expect.objectContaining({
              query: expect.stringContaining("CREATE OR REPLACE FUNCTION"),
            }),
          );
          expect(db._query).toHaveBeenCalledWith(
            expect.objectContaining({
              query: expect.stringContaining("CREATE TRIGGER"),
            }),
          );
          done();
        },
      );
    });

    it("should propagate query errors", (done) => {
      db._query = jest.fn().mockImplementationOnce((opts) => {
        opts.cb?.("db-error");
      });

      db._ensure_trigger_exists(
        "projects",
        { project_id: "uuid" },
        [],
        (err) => {
          expect(err).toBe("db-error");
          done();
        },
      );
    });

    it("should propagate function creation errors", (done) => {
      db._query = jest.fn().mockImplementation((opts) => {
        if (opts.query.includes("SELECT count(*) FROM pg_trigger")) {
          opts.cb?.(undefined, { rows: [{ count: "0" }] });
          return;
        }
        if (opts.query.includes("CREATE OR REPLACE FUNCTION")) {
          opts.cb?.("create-function-error");
          return;
        }
        opts.cb?.(undefined);
      });

      db._ensure_trigger_exists(
        "projects",
        { project_id: "uuid" },
        [],
        (err) => {
          expect(err).toBe("create-function-error");
          expect(db._query).toHaveBeenCalledTimes(2);
          done();
        },
      );
    });

    it("should propagate trigger creation errors", (done) => {
      db._query = jest.fn().mockImplementation((opts) => {
        if (opts.query.includes("SELECT count(*) FROM pg_trigger")) {
          opts.cb?.(undefined, { rows: [{ count: "0" }] });
          return;
        }
        if (opts.query.includes("CREATE TRIGGER")) {
          opts.cb?.("create-trigger-error");
          return;
        }
        opts.cb?.(undefined);
      });

      db._ensure_trigger_exists(
        "projects",
        { project_id: "uuid" },
        [],
        (err) => {
          expect(err).toBe("create-trigger-error");
          done();
        },
      );
    });
  });

  describe("_listen", () => {
    it("should validate select and watch arguments", (done) => {
      const invalidSelect = "invalid" as unknown as ChangefeedSelect;
      const invalidWatch = "bad" as unknown as string[];

      db._listen("projects", invalidSelect, [], (err) => {
        expect(err).toBe("select must be an object");

        db._listen("projects", {}, [], (err2) => {
          expect(err2).toBe("there must be at least one column");

          db._listen("projects", { id: "uuid" }, invalidWatch, (err3) => {
            expect(err3).toBe("watch must be an array");
            done();
          });
        });
      });
    });

    it("should listen and increment counters", (done) => {
      const synctable = require("../dist/synctable/trigger");
      const tgname = synctable.trigger_name("projects", { id: "uuid" }, []);

      db._ensure_trigger_exists = jest.fn((_t, _s, _w, cb) => cb());
      db._query = jest.fn((opts) => {
        expect(opts.query).toBe(`LISTEN ${tgname}`);
        opts.cb?.(undefined);
      });

      db._listen("projects", { id: "uuid" }, [], (err, name) => {
        expect(err).toBeUndefined();
        expect(name).toBe(tgname);
        expect(db._listening?.[tgname]).toBe(1);
        done();
      });
    });

    it("should reuse existing listener", (done) => {
      const synctable = require("../dist/synctable/trigger");
      const tgname = synctable.trigger_name("projects", { id: "uuid" }, []);
      db._listening = { [tgname]: 1 };
      db._ensure_trigger_exists = jest.fn();
      db._query = jest.fn();

      db._listen("projects", { id: "uuid" }, [], (err, name) => {
        expect(err).toBeUndefined();
        expect(name).toBe(tgname);
        expect(db._listening?.[tgname]).toBe(2);
        expect(db._ensure_trigger_exists).not.toHaveBeenCalled();
        expect(db._query).not.toHaveBeenCalled();
        done();
      });
    });

    it("should propagate trigger creation errors", (done) => {
      const synctable = require("../dist/synctable/trigger");
      const tgname = synctable.trigger_name("projects", { id: "uuid" }, []);
      db._ensure_trigger_exists = jest.fn((_t, _s, _w, cb) =>
        cb("trigger-error"),
      );
      db._query = jest.fn();

      db._listen("projects", { id: "uuid" }, [], (err) => {
        expect(err).toBe("trigger-error");
        expect(db._query).not.toHaveBeenCalled();
        expect(db._listening?.[tgname]).toBeUndefined();
        done();
      });
    });

    it("should propagate listen errors", (done) => {
      const synctable = require("../dist/synctable/trigger");
      const tgname = synctable.trigger_name("projects", { id: "uuid" }, []);
      db._ensure_trigger_exists = jest.fn((_t, _s, _w, cb) => cb());
      const client = {
        query: jest.fn((query, cb) => {
          expect(query).toBe(`LISTEN ${tgname}`);
          cb?.("listen-error");
        }),
      };
      (db as any)._get_listen_client = jest.fn(async () => client);

      db._listen("projects", { id: "uuid" }, [], (err) => {
        expect(err).toBe("listen-error");
        expect(db._listening?.[tgname]).toBeUndefined();
        done();
      });
    });
  });

  describe("synctable", () => {
    it("should return a SyncTable instance", (done) => {
      db._listen = jest.fn((_table, _select, _watch, cb) => {
        cb?.(undefined, "test_trigger");
      });
      db._query = jest.fn((opts) => {
        opts.cb?.(undefined, { rows: [], rowCount: 0, command: "SELECT" });
      });

      const st = db.synctable({
        table: "projects",
        cb: (err, instance) => {
          expect(err).toBeUndefined();
          expect(instance).toBe(st);
          done();
        },
      });
    });
  });

  describe("changefeed", () => {
    it("should create a Changes instance", () => {
      const { Changes } = require("../postgres/changefeed/changefeed");
      db.changefeed({
        table: "projects",
        select: { project_id: "uuid" },
        watch: ["title"],
        where: { project_id: "uuid" },
        cb: jest.fn(),
      });

      expect(Changes).toHaveBeenCalledWith(
        db,
        "projects",
        { project_id: "uuid" },
        ["title"],
        { project_id: "uuid" },
        expect.any(Function),
      );
    });
  });

  describe("_notification", () => {
    it("should emit parsed JSON message on channel", () => {
      const emitSpy = jest.spyOn(db, "emit");

      const message = {
        channel: "test_channel",
        payload: JSON.stringify({ action: "UPDATE", data: { id: 1 } }),
      };

      db._notification(message);

      expect(emitSpy).toHaveBeenCalledWith("test_channel", {
        action: "UPDATE",
        data: { id: 1 },
      });
    });

    it("should handle complex nested objects", () => {
      const emitSpy = jest.spyOn(db, "emit");

      const payload = {
        action: "INSERT",
        new_val: { id: "uuid1", nested: { deep: { value: 42 } } },
        old_val: null,
      };

      const message = {
        channel: "change_abc123",
        payload: JSON.stringify(payload),
      };

      db._notification(message);

      expect(emitSpy).toHaveBeenCalledWith("change_abc123", payload);
    });

    it("should throw if payload is invalid JSON", () => {
      const message = {
        channel: "bad",
        payload: "{",
      };

      expect(() => db._notification(message)).toThrow();
    });
  });

  describe("_stop_listening", () => {
    it("should do nothing if trigger not being listened to", () => {
      db._listening = {};

      const cb = jest.fn();

      db._stop_listening("projects", { id: "uuid" }, [], cb);

      expect(cb).toHaveBeenCalled();
    });

    it("should handle missing listening state", () => {
      delete db._listening;
      db._query = jest.fn();
      const cb = jest.fn();

      db._stop_listening("projects", { id: "uuid" }, [], cb);

      expect(cb).toHaveBeenCalled();
      expect(db._query).not.toHaveBeenCalled();
    });

    it("should decrement listener count", () => {
      // Mock trigger_name to generate consistent name
      const trigger_name = require("../dist/synctable/trigger").trigger_name;
      const tgname = trigger_name("projects", { id: "uuid" }, []);

      db._listening = { [tgname]: 3 };

      db._stop_listening("projects", { id: "uuid" }, []);

      expect(db._listening?.[tgname]).toBe(2);
    });

    it("should not call UNLISTEN if count still > 0", () => {
      const trigger_name = require("../dist/synctable/trigger").trigger_name;
      const tgname = trigger_name("projects", { id: "uuid" }, []);

      db._listening = { [tgname]: 2 };
      db._query = jest.fn();

      db._stop_listening("projects", { id: "uuid" }, []);

      expect(db._query).not.toHaveBeenCalled();
      expect(db._listening?.[tgname]).toBe(1);
    });

    it("should UNLISTEN when count reaches zero", (done) => {
      const trigger_name = require("../dist/synctable/trigger").trigger_name;
      const tgname = trigger_name("projects", { id: "uuid" }, []);

      db._listening = { [tgname]: 1 };
      db._query = jest.fn((opts) => {
        expect(opts.query).toBe(`UNLISTEN ${tgname}`);
        opts.cb?.();
      });

      db._stop_listening("projects", { id: "uuid" }, [], () => {
        expect(db._listening?.[tgname]).toBe(0);
        done();
      });
    });
  });

  describe("project_and_user_tracker", () => {
    it("should create and cache a tracker", (done) => {
      db.project_and_user_tracker({
        cb: (err, tracker) => {
          expect(err).toBeUndefined();
          expect(tracker).toBeDefined();
          expect(db._project_and_user_tracker).toBe(tracker);
          done();
        },
      });
    });

    it("should reuse cached tracker", (done) => {
      const cached = { cached: true } as unknown as ProjectAndUserTracker;
      db._project_and_user_tracker = cached;

      db.project_and_user_tracker({
        cb: (err, tracker) => {
          expect(err).toBeUndefined();
          expect(tracker).toBe(cached);
          done();
        },
      });
    });

    it("should fan out callbacks while initializing", (done) => {
      let resolveInit: (() => void) | undefined;
      const initPromise = new Promise<void>((resolve) => {
        resolveInit = resolve;
      });
      projectTrackerInit.mockImplementation(() => initPromise);

      const cb1 = jest.fn();
      const cb2 = jest.fn();

      db.project_and_user_tracker({ cb: cb1 });
      db.project_and_user_tracker({ cb: cb2 });

      expect(projectTrackerInit).toHaveBeenCalledTimes(1);

      resolveInit?.();

      setImmediate(() => {
        expect(cb1).toHaveBeenCalledWith(undefined, expect.any(Object));
        expect(cb2).toHaveBeenCalledWith(undefined, expect.any(Object));
        done();
      });
    });

    it("should clear cache on tracker error", (done) => {
      db.project_and_user_tracker({
        cb: (err, _tracker) => {
          expect(err).toBeUndefined();
          const errorHandler = projectTrackerOnce.mock.calls[0][1];
          errorHandler();
          expect(db._project_and_user_tracker).toBeUndefined();
          done();
        },
      });
    });

    it("should propagate init errors to all callbacks", (done) => {
      projectTrackerInit.mockRejectedValue("init-failed");

      const cb1 = jest.fn();
      const cb2 = jest.fn();

      db.project_and_user_tracker({ cb: cb1 });
      db.project_and_user_tracker({ cb: cb2 });

      setImmediate(() => {
        expect(cb1).toHaveBeenCalledWith("init-failed");
        expect(cb2).toHaveBeenCalledWith("init-failed");
        done();
      });
    });
  });
});
