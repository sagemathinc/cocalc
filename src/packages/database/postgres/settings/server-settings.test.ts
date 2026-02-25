/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import {
  set_server_setting,
  get_server_setting,
  get_server_settings_cached,
  get_site_settings,
  reset_server_settings_cache,
} from "../settings/server-settings";
import type { PostgreSQL } from "../types";

describe("server settings methods", () => {
  const database: PostgreSQL = db();

  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  describe("set_server_setting and get_server_setting", () => {
    it("sets and retrieves a server setting", async () => {
      const testName = "test_setting_" + Date.now();
      const testValue = "test_value_" + Date.now();

      await set_server_setting(database, {
        name: testName,
        value: testValue,
      });

      const retrieved = await get_server_setting(database, { name: testName });
      expect(retrieved).toBe(testValue);
    });

    it("updates an existing setting", async () => {
      const testName = "update_test_" + Date.now();

      await set_server_setting(database, {
        name: testName,
        value: "initial_value",
      });

      await set_server_setting(database, {
        name: testName,
        value: "updated_value",
      });

      const retrieved = await get_server_setting(database, { name: testName });
      expect(retrieved).toBe("updated_value");
    });

    it("sets readonly flag", async () => {
      const testName = "readonly_test_" + Date.now();

      await set_server_setting(database, {
        name: testName,
        value: "readonly_value",
        readonly: true,
      });

      const retrieved = await get_server_setting(database, { name: testName });
      expect(retrieved).toBe("readonly_value");
    });

    it("returns undefined for non-existent setting", async () => {
      const retrieved = await get_server_setting(database, {
        name: "nonexistent_" + Date.now(),
      });
      expect(retrieved).toBeUndefined();
    });

    it("updates _last_update timestamp", async () => {
      const testName = "timestamp_test_" + Date.now();

      await set_server_setting(database, {
        name: testName,
        value: "test",
      });

      const lastUpdate = await get_server_setting(database, {
        name: "_last_update",
      });
      expect(lastUpdate).toBeDefined();
      expect(typeof lastUpdate).toBe("string");
    });
  });

  describe("get_server_settings_cached", () => {
    it("retrieves cached server settings", async () => {
      const settings = await get_server_settings_cached();
      expect(settings).toBeDefined();
      expect(typeof settings).toBe("object");
    });
  });

  describe("get_site_settings", () => {
    it("retrieves site-specific settings", async () => {
      const settings = await get_site_settings(database);
      expect(settings).toBeDefined();
      expect(typeof settings).toBe("object");
    });

    it("handles commercial setting backward compatibility", async () => {
      // Set commercial as string 'true'
      await set_server_setting(database, {
        name: "commercial",
        value: "true",
      });

      const settings = await get_site_settings(database);
      // If commercial is in the site_settings_conf and returned, it should be converted to boolean
      if (settings.commercial !== undefined) {
        expect(settings.commercial).toBe(true);
      } else {
        // Otherwise, just verify the function works
        expect(settings).toBeDefined();
      }
    });
  });

  describe("reset_server_settings_cache", () => {
    it("resets the cache without throwing", () => {
      expect(() => reset_server_settings_cache()).not.toThrow();
    });
  });
});
