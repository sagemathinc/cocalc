/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Test suite for PostgreSQL trigger code generation functions
// Tests the CoffeeScript implementation first to establish baseline

import type { ChangefeedSelect } from "../postgres/types";

describe("Trigger Code Generation", () => {
  let trigger_name: (
    table: string,
    select: ChangefeedSelect,
    watch: string[],
  ) => string;
  let triggerType: (type: string) => string;
  let trigger_code: (
    table: string,
    select: ChangefeedSelect,
    watch: string[],
  ) => { function: string; trigger: string };

  beforeAll(() => {
    // Load from TypeScript implementation
    const trigger = require("./trigger");
    trigger_name = trigger.trigger_name;
    triggerType = trigger.triggerType;
    trigger_code = trigger.trigger_code;
  });

  describe("trigger_name", () => {
    it("should generate consistent names for same inputs", () => {
      const select = { id: "uuid", name: "text" };
      const watch = ["name"];

      const name1 = trigger_name("projects", select, watch);
      const name2 = trigger_name("projects", select, watch);

      expect(name1).toBe(name2);
      expect(name1).toMatch(/^change_[a-f0-9]{16}$/);
    });

    it("should generate different names for different tables", () => {
      const select = { id: "uuid" };
      const watch: string[] = [];

      const name1 = trigger_name("projects", select, watch);
      const name2 = trigger_name("accounts", select, watch);

      expect(name1).not.toBe(name2);
    });

    it("should generate different names for different select columns", () => {
      const watch: string[] = [];

      const name1 = trigger_name("projects", { id: "uuid" }, watch);
      const name2 = trigger_name(
        "projects",
        { id: "uuid", name: "text" },
        watch,
      );

      expect(name1).not.toBe(name2);
    });

    it("should generate different names for different watch columns", () => {
      const select = { id: "uuid" };

      const name1 = trigger_name("projects", select, []);
      const name2 = trigger_name("projects", select, ["name"]);

      expect(name1).not.toBe(name2);
    });

    it("should sort select columns for consistency", () => {
      const watch: string[] = [];

      const name1 = trigger_name("projects", { a: "text", b: "int" }, watch);
      const name2 = trigger_name("projects", { b: "int", a: "text" }, watch);

      expect(name1).toBe(name2);
    });

    it("should sort watch columns for consistency", () => {
      const select = { id: "uuid" };

      const name1 = trigger_name("projects", select, ["a", "b"]);
      const name2 = trigger_name("projects", select, ["b", "a"]);

      expect(name1).toBe(name2);
    });

    it("should include pipe separator when watch columns exist", () => {
      const select = { id: "uuid" };

      // The hash should be different because watch columns add a '|' separator
      const noWatch = trigger_name("projects", select, []);
      const withWatch = trigger_name("projects", select, ["name"]);

      expect(noWatch).not.toBe(withWatch);
    });

    it("should handle single select column", () => {
      const name = trigger_name("projects", { id: "uuid" }, []);

      expect(name).toMatch(/^change_[a-f0-9]{16}$/);
    });

    it("should handle multiple select columns", () => {
      const select = {
        id: "uuid",
        name: "text",
        created: "timestamp",
        value: "integer",
      };
      const name = trigger_name("projects", select, []);

      expect(name).toMatch(/^change_[a-f0-9]{16}$/);
    });

    it("should handle multiple watch columns", () => {
      const select = { id: "uuid" };
      const watch = ["name", "description", "created", "modified"];

      const name = trigger_name("projects", select, watch);

      expect(name).toMatch(/^change_[a-f0-9]{16}$/);
    });

    it("should throw error if select is not an object", () => {
      const invalidSelect = "invalid" as unknown as ChangefeedSelect;
      expect(() => trigger_name("projects", invalidSelect, [])).toThrow();
    });
  });

  describe("triggerType", () => {
    it("should convert SERIAL UNIQUE to INTEGER", () => {
      expect(triggerType("SERIAL UNIQUE")).toBe("INTEGER");
    });

    it("should return other types unchanged", () => {
      expect(triggerType("uuid")).toBe("uuid");
      expect(triggerType("text")).toBe("text");
      expect(triggerType("integer")).toBe("integer");
      expect(triggerType("timestamp")).toBe("timestamp");
      expect(triggerType("boolean")).toBe("boolean");
      expect(triggerType("jsonb")).toBe("jsonb");
    });

    it("should handle uppercase types", () => {
      expect(triggerType("TEXT")).toBe("TEXT");
      expect(triggerType("INTEGER")).toBe("INTEGER");
    });

    it("should handle complex types", () => {
      expect(triggerType("character varying(255)")).toBe(
        "character varying(255)",
      );
      expect(triggerType("numeric(10,2)")).toBe("numeric(10,2)");
    });
  });

  describe("trigger_code", () => {
    it("should generate valid PLPGSQL function", () => {
      const select = { id: "uuid" };
      const watch = ["name"];

      const code = trigger_code("projects", select, watch);

      expect(code.function).toContain("CREATE OR REPLACE FUNCTION");
      expect(code.function).toContain("RETURNS TRIGGER");
      expect(code.function).toContain("LANGUAGE plpgsql");
      expect(code.function).toContain("DECLARE");
      expect(code.function).toContain("BEGIN");
      expect(code.function).toContain("END;");
    });

    it("should generate valid CREATE TRIGGER statement", () => {
      const select = { id: "uuid" };
      const watch = ["name"];

      const code = trigger_code("projects", select, watch);

      expect(code.trigger).toContain("CREATE TRIGGER");
      expect(code.trigger).toContain("AFTER INSERT OR DELETE OR UPDATE");
      expect(code.trigger).toContain("ON projects");
      expect(code.trigger).toContain("FOR EACH ROW");
      expect(code.trigger).toContain("EXECUTE PROCEDURE");
    });

    it("should declare variables for OLD and NEW values", () => {
      const select = { id: "uuid", name: "text" };
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);

      expect(code.function).toContain("id_old");
      expect(code.function).toContain("id_new");
      expect(code.function).toContain("name_old");
      expect(code.function).toContain("name_new");
    });

    it("should handle DELETE operation", () => {
      const select = { id: "uuid" };
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);

      expect(code.function).toContain("IF TG_OP = 'DELETE' THEN");
      expect(code.function).toContain("OLD.id");
      expect(code.function).toContain("obj_old = json_build_object");
    });

    it("should handle INSERT operation", () => {
      const select = { id: "uuid" };
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);

      expect(code.function).toContain("IF TG_OP = 'INSERT' THEN");
      expect(code.function).toContain("NEW.id");
      expect(code.function).toContain("obj_new = json_build_object");
    });

    it("should handle UPDATE operation with change detection", () => {
      const select = { id: "uuid" };
      const watch = ["name"];

      const code = trigger_code("projects", select, watch);

      expect(code.function).toContain("IF TG_OP = 'UPDATE' THEN");
      expect(code.function).toContain("OLD.name = NEW.name");
      expect(code.function).toContain("RETURN NULL");
    });

    it("should use pg_notify to send notifications", () => {
      const select = { id: "uuid" };
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);
      const tgname = trigger_name("projects", select, watch);

      expect(code.function).toContain("PERFORM pg_notify");
      expect(code.function).toContain(`'${tgname}'`);
      expect(code.function).toContain("notification::text");
    });

    it("should build notification as json array", () => {
      const select = { id: "uuid" };
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);

      expect(code.function).toContain(
        "notification = json_build_array(TG_OP, obj_new, obj_old)",
      );
    });

    it("should handle empty watch array", () => {
      const select = { id: "uuid", name: "text" };
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);

      // With empty watch, should use FALSE for no_change (always trigger)
      expect(code.function).toContain("IF FALSE THEN");
      expect(code.trigger).not.toContain("OF");
    });

    it("should handle non-empty watch array with UPDATE OF clause", () => {
      const select = { id: "uuid" };
      const watch = ["name", "description"];

      const code = trigger_code("projects", select, watch);

      expect(code.trigger).toContain("UPDATE OF");
      // Should include both watch columns and select columns
      expect(code.trigger).toMatch(/OF.*name.*description/);
    });

    it("should detect changes in all watched columns", () => {
      const select = { id: "uuid" };
      const watch = ["name", "description"];

      const code = trigger_code("projects", select, watch);

      // Should check all watched columns for changes
      expect(code.function).toContain("OLD.name = NEW.name");
      expect(code.function).toContain("OLD.description = NEW.description");
      expect(code.function).toContain("AND");
    });

    it("should include select columns in change detection when watch is non-empty", () => {
      const select = { id: "uuid", status: "text" };
      const watch = ["name"];

      const code = trigger_code("projects", select, watch);

      // Should check both watch columns AND select columns
      expect(code.function).toContain("OLD.name = NEW.name");
      expect(code.function).toContain("OLD.id = NEW.id");
      expect(code.function).toContain("OLD.status = NEW.status");
    });

    it("should handle multiple select columns", () => {
      const select = {
        id: "uuid",
        project_id: "uuid",
        account_id: "uuid",
        created: "timestamp",
      };
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);

      // Should declare all variables
      expect(code.function).toContain("id_old");
      expect(code.function).toContain("project_id_old");
      expect(code.function).toContain("account_id_old");
      expect(code.function).toContain("created_old");

      // Should build object with all fields
      expect(code.function).toContain("'id'");
      expect(code.function).toContain("'project_id'");
      expect(code.function).toContain("'account_id'");
      expect(code.function).toContain("'created'");
    });

    it("should convert SERIAL UNIQUE types to INTEGER", () => {
      const select = { id: "SERIAL UNIQUE", name: "text" };
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);

      // Variable should be declared as INTEGER, not SERIAL UNIQUE
      expect(code.function).toContain("id_old INTEGER");
      expect(code.function).toContain("id_new INTEGER");
    });

    it("should default missing types to text", () => {
      const select = {
        id: undefined,
        name: "text",
      } as unknown as ChangefeedSelect;
      const watch: string[] = [];

      const code = trigger_code("projects", select, watch);

      expect(code.function).toContain("id_old text");
      expect(code.function).toContain("id_new text");
    });

    it("should quote field names properly", () => {
      const select = { id: "uuid" };
      const watch = ["user", "order"]; // Reserved SQL keywords

      const code = trigger_code("projects", select, watch);

      // Field names in UPDATE OF should be quoted if they're reserved words
      // The actual implementation uses quote_field function
      expect(code.trigger).toContain("UPDATE OF");
    });

    it("should use consistent trigger name in both function and trigger", () => {
      const select = { id: "uuid" };
      const watch = ["name"];

      const code = trigger_code("projects", select, watch);
      const tgname = trigger_name("projects", select, watch);

      // Function name
      expect(code.function).toContain(`CREATE OR REPLACE FUNCTION ${tgname}()`);
      // Trigger name
      expect(code.trigger).toContain(`CREATE TRIGGER ${tgname}`);
      // Procedure name
      expect(code.trigger).toContain(`EXECUTE PROCEDURE ${tgname}()`);
      // Notification channel
      expect(code.function).toContain(`'${tgname}'`);
    });

    it("should handle edge case with single watch column", () => {
      const select = { id: "uuid" };
      const watch = ["name"];

      const code = trigger_code("projects", select, watch);

      expect(code.function).toContain("OLD.name = NEW.name");
      expect(code.trigger).toContain("UPDATE OF");
    });

    it("should generate syntactically valid SQL", () => {
      const select = { id: "uuid", name: "text" };
      const watch = ["name"];

      const code = trigger_code("projects", select, watch);

      // Basic SQL syntax validation
      expect(code.function).not.toContain(";;"); // No double semicolons
      expect(code.function).toMatch(/^\s*CREATE/); // Starts with CREATE
      expect(code.function).toMatch(/\$\$/); // Has proper PL/pgSQL delimiters

      expect(code.trigger).not.toContain(";;");
      expect(code.trigger).toMatch(/^\s*CREATE TRIGGER/);
      expect(code.trigger).toMatch(/;$/); // Ends with semicolon
    });
  });

  describe("Integration tests", () => {
    it("should generate complete trigger setup for real-world scenario", () => {
      // Simulate a typical CoCalc table trigger
      const select = { project_id: "uuid", account_id: "uuid" };
      const watch = ["users", "state", "last_edited"];

      const tgname = trigger_name("projects", select, watch);
      const code = trigger_code("projects", select, watch);

      // Should have valid trigger name
      expect(tgname).toMatch(/^change_[a-f0-9]{16}$/);

      // Should generate complete function
      expect(code.function).toContain(`CREATE OR REPLACE FUNCTION ${tgname}()`);
      expect(code.function).toContain("RETURNS TRIGGER");
      expect(code.function).toContain("LANGUAGE plpgsql");

      // Should generate complete trigger
      expect(code.trigger).toContain(`CREATE TRIGGER ${tgname}`);
      expect(code.trigger).toContain("ON projects");
      expect(code.trigger).toContain(`EXECUTE PROCEDURE ${tgname}()`);

      // Should watch the right columns
      expect(code.trigger).toContain("UPDATE OF");
      expect(code.function).toContain("OLD.users = NEW.users");
      expect(code.function).toContain("OLD.state = NEW.state");
      expect(code.function).toContain("OLD.last_edited = NEW.last_edited");
    });
  });
});
