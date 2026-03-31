/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { uuid } from "@cocalc/util/misc";
import { validateOpts } from "./utils";

describe("validateOpts", () => {
  describe("UUID validation", () => {
    it("accepts valid UUIDs for fields ending in 'id'", () => {
      const opts = {
        project_id: uuid(),
        account_id: uuid(),
      };
      expect(validateOpts(opts)).toBe(true);
    });

    it("rejects invalid UUIDs for fields ending in 'id'", () => {
      const opts = {
        project_id: "not-a-uuid",
      };
      expect(() => validateOpts(opts)).toThrow(/invalid project_id/);
    });

    it("accepts null/undefined for id fields", () => {
      const opts = {
        project_id: null,
        account_id: undefined,
      };
      expect(validateOpts(opts)).toBe(true);
    });

    it("validates multiple id fields", () => {
      const opts = {
        project_id: uuid(),
        account_id: "invalid",
        user_id: uuid(),
      };
      expect(() => validateOpts(opts)).toThrow(/invalid account_id/);
    });
  });

  describe("UUID array validation", () => {
    it("accepts valid UUID arrays for fields ending in 'ids'", () => {
      const opts = {
        account_ids: [uuid(), uuid(), uuid()],
      };
      expect(validateOpts(opts)).toBe(true);
    });

    it("rejects invalid UUIDs in arrays", () => {
      const opts = {
        project_ids: [uuid(), "invalid-uuid", uuid()],
      };
      expect(() => validateOpts(opts)).toThrow(/invalid uuid invalid-uuid/);
    });

    it("provides helpful error message with full array", () => {
      const badArray = [uuid(), "bad", uuid()];
      const opts = {
        user_ids: badArray,
      };
      expect(() => validateOpts(opts)).toThrow(/in user_ids/);
    });
  });

  describe("lti_id validation", () => {
    it("accepts valid lti_id array", () => {
      const opts = {
        lti_id: ["lti-course-1", "lti-user-123"],
      };
      expect(validateOpts(opts)).toBe(true);
    });

    it("rejects empty lti_id array", () => {
      const opts = {
        lti_id: [],
      };
      expect(() => validateOpts(opts)).toThrow(/can't be an empty array/);
    });

    it("rejects non-array lti_id", () => {
      const opts = {
        lti_id: "not-an-array",
      };
      expect(() => validateOpts(opts)).toThrow(/can't be an empty array/);
    });

    it("rejects lti_id with empty strings", () => {
      const opts = {
        lti_id: ["valid", ""],
      };
      expect(() => validateOpts(opts)).toThrow(/invalid lti_id/);
    });

    it("rejects lti_id with non-string values", () => {
      const opts = {
        lti_id: ["valid", 123, "also-valid"],
      };
      expect(() => validateOpts(opts)).toThrow(/invalid lti_id/);
    });
  });

  describe("project group validation", () => {
    it("accepts valid project groups", () => {
      expect(validateOpts({ group: "owner" })).toBe(true);
      expect(validateOpts({ group: "collaborator" })).toBe(true);
    });

    it("rejects invalid project group", () => {
      const opts = {
        group: "invalid-group",
      };
      expect(() => validateOpts(opts)).toThrow(/unknown project group/);
    });

    it("accepts valid project groups array", () => {
      const opts = {
        groups: ["owner", "collaborator"],
      };
      expect(validateOpts(opts)).toBe(true);
    });

    it("rejects invalid group in groups array", () => {
      const opts = {
        groups: ["owner", "invalid-group", "collaborator"],
      };
      expect(() => validateOpts(opts)).toThrow(
        /unknown project group 'invalid-group' in groups/,
      );
    });
  });

  describe("combined validation", () => {
    it("validates multiple field types together", () => {
      const opts = {
        project_id: uuid(),
        account_id: uuid(),
        group: "owner",
        user_ids: [uuid(), uuid()],
      };
      expect(validateOpts(opts)).toBe(true);
    });

    it("stops at first validation error", () => {
      const opts = {
        project_id: "bad-uuid", // This will fail first
        group: "bad-group", // This won't be checked
      };
      expect(() => validateOpts(opts)).toThrow(/invalid project_id/);
    });

    it("handles empty options object", () => {
      expect(validateOpts({})).toBe(true);
    });

    it("handles options with non-validated fields", () => {
      const opts = {
        project_id: uuid(),
        title: "My Project",
        description: "Some description",
        count: 42,
      };
      expect(validateOpts(opts)).toBe(true);
    });
  });
});
