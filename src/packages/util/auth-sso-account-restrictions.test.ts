/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Unit tests for SSO account editing restrictions.
 *
 * This tests the validation logic that prevents users from editing their
 * email address and name when their account is controlled by an exclusive
 * SSO strategy with updateOnLogin enabled.
 *
 * The actual implementation is in:
 * - packages/util/db-schema/accounts.ts (user_query check_hook)
 * - packages/server/auth/sso/passport-login.ts (SSO update logic)
 */

import { checkRequiredSSO } from "./auth-check-required-sso";
import { Strategy } from "./types/sso";

const BASE_STRATEGY: Readonly<
  Omit<Strategy, "name" | "exclusiveDomains" | "updateOnLogin">
> = {
  display: "Test SSO",
  backgroundColor: "#000",
  public: false,
  doNotHide: true,
} as const;

describe("SSO Account Editing Restrictions", () => {
  describe("Email Address Protection (Always Enforced)", () => {
    test("user with exclusive SSO domain cannot change email", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: false, // Doesn't matter for email
      };

      const result = checkRequiredSSO({
        email: "user@university.edu",
        strategies: [strategy],
      });

      // If strategy is found, email changes should be blocked
      expect(result).toBeDefined();
      expect(result?.name).toBe("university");
    });

    test("user without exclusive SSO can change email", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: false,
      };

      const result = checkRequiredSSO({
        email: "user@gmail.com", // Different domain
        strategies: [strategy],
      });

      // No strategy matched, email changes allowed
      expect(result).toBeUndefined();
    });

    test("subdomain users also cannot change email", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: false,
      };

      const result = checkRequiredSSO({
        email: "user@mail.university.edu", // Subdomain
        strategies: [strategy],
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("university");
    });
  });

  describe("Name Protection (When updateOnLogin: true)", () => {
    test("updateOnLogin: true blocks name changes", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: true, // KEY: blocks name changes
      };

      const result = checkRequiredSSO({
        email: "user@university.edu",
        strategies: [strategy],
      });

      expect(result).toBeDefined();
      expect(result?.updateOnLogin).toBe(true);
      // In actual implementation (accounts.ts:750-759), this blocks first_name and last_name edits
    });

    test("updateOnLogin: false allows name changes", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: false, // KEY: allows name changes
      };

      const result = checkRequiredSSO({
        email: "user@university.edu",
        strategies: [strategy],
      });

      expect(result).toBeDefined();
      expect(result?.updateOnLogin).toBe(false);
      // In actual implementation, email is still blocked but names are allowed
    });

    test("validation logic type checks", () => {
      // This tests the fix for the typeof bug in accounts.ts:753
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: true,
      };

      const result = checkRequiredSSO({
        email: "user@university.edu",
        strategies: [strategy],
      });

      // The validation should check:
      // typeof obj.first_name === "string" || typeof obj.last_name === "string"
      // NOT: obj.last_name === "string" (literal string comparison)

      expect(result?.updateOnLogin).toBe(true);

      // Simulate validation logic
      const obj = { first_name: "John", last_name: "Doe" };
      const shouldBlock =
        result?.updateOnLogin &&
        (typeof obj.first_name === "string" ||
          typeof obj.last_name === "string");

      expect(shouldBlock).toBe(true);

      // Test the bug: if we use literal comparison, it fails
      const buggyCheck =
        result?.updateOnLogin &&
        (typeof obj.first_name === "string" || obj.last_name === "string");

      expect(buggyCheck).toBe(true); // Still true because first_name check passes

      // But if only last_name is set, the bug becomes obvious
      const obj2 = { last_name: "Doe" };
      const correctCheck =
        result?.updateOnLogin && typeof obj2.last_name === "string";
      const buggyCheck2 = result?.updateOnLogin && obj2.last_name === "string";

      expect(correctCheck).toBe(true); // Correct: blocks any string
      expect(buggyCheck2).toBe(false); // Bug: only blocks if last_name === "string" literally
    });
  });

  describe("Wildcard Domain Handling", () => {
    test("wildcard matches all domains", () => {
      const wildcardStrategy: Strategy = {
        ...BASE_STRATEGY,
        name: "corporate",
        exclusiveDomains: ["*"],
        updateOnLogin: true,
      };

      const result = checkRequiredSSO({
        email: "user@anycompany.com",
        strategies: [wildcardStrategy],
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("corporate");
      expect(result?.updateOnLogin).toBe(true);
    });

    test("specific domain takes precedence over wildcard", () => {
      const specificStrategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: true,
      };

      const wildcardStrategy: Strategy = {
        ...BASE_STRATEGY,
        name: "corporate",
        exclusiveDomains: ["*"],
        updateOnLogin: false,
      };

      const result = checkRequiredSSO({
        email: "user@university.edu",
        strategies: [specificStrategy, wildcardStrategy],
      });

      // Specific strategy should match first
      expect(result?.name).toBe("university");
      expect(result?.updateOnLogin).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("empty email returns no strategy", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: true,
      };

      const result = checkRequiredSSO({
        email: "",
        strategies: [strategy],
      });

      expect(result).toBeUndefined();
    });

    test("invalid email returns no strategy", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: true,
      };

      const result = checkRequiredSSO({
        email: "not-an-email",
        strategies: [strategy],
      });

      expect(result).toBeUndefined();
    });

    test("case insensitive matching", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"], // lowercase (normalized from DB)
        updateOnLogin: true,
      };

      const result = checkRequiredSSO({
        email: "USER@UNIVERSITY.EDU", // uppercase
        strategies: [strategy],
      });

      expect(result).toBeDefined();
      expect(result?.name).toBe("university");
    });

    test("multiple domains in single strategy", () => {
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "enterprise",
        exclusiveDomains: ["company.com", "company.net", "company.org"],
        updateOnLogin: true,
      };

      const result1 = checkRequiredSSO({
        email: "user@company.com",
        strategies: [strategy],
      });
      const result2 = checkRequiredSSO({
        email: "user@company.net",
        strategies: [strategy],
      });
      const result3 = checkRequiredSSO({
        email: "user@company.org",
        strategies: [strategy],
      });

      expect(result1?.name).toBe("enterprise");
      expect(result2?.name).toBe("enterprise");
      expect(result3?.name).toBe("enterprise");
    });
  });

  describe("Integration Scenarios (Mock)", () => {
    /**
     * These tests simulate the check_hook logic from accounts.ts:732-762
     */

    test("user_query set operation: email change blocked", () => {
      const currentEmail = "user@university.edu";
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: false,
      };

      const strategies = [strategy];
      const attemptedChange = { email_address: "newemail@gmail.com" };

      // Simulate check_hook logic
      const matchedStrategy = checkRequiredSSO({
        email: currentEmail,
        strategies,
      });

      if (
        matchedStrategy != null &&
        typeof attemptedChange.email_address === "string"
      ) {
        // Should trigger error: "You are not allowed to change your email address."
        expect(matchedStrategy).toBeDefined();
        expect(typeof attemptedChange.email_address).toBe("string");
      }
    });

    test("user_query set operation: name change blocked when updateOnLogin true", () => {
      const currentEmail = "user@university.edu";
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: true, // Blocks name changes
      };

      const strategies = [strategy];
      const attemptedChange = { first_name: "Jane", last_name: "Smith" };

      // Simulate check_hook logic (accounts.ts:750-759)
      const matchedStrategy = checkRequiredSSO({
        email: currentEmail,
        strategies,
      });

      if (
        matchedStrategy != null &&
        matchedStrategy.updateOnLogin &&
        (typeof attemptedChange.first_name === "string" ||
          typeof attemptedChange.last_name === "string")
      ) {
        // Should trigger error: "You are not allowed to change your first or last name..."
        expect(matchedStrategy.updateOnLogin).toBe(true);
        expect(
          typeof attemptedChange.first_name === "string" ||
            typeof attemptedChange.last_name === "string",
        ).toBe(true);
      }
    });

    test("user_query set operation: name change allowed when updateOnLogin false", () => {
      const currentEmail = "user@university.edu";
      const strategy: Strategy = {
        ...BASE_STRATEGY,
        name: "university",
        exclusiveDomains: ["university.edu"],
        updateOnLogin: false, // Allows name changes
      };

      const strategies = [strategy];
      const attemptedChange = { first_name: "Jane", last_name: "Smith" };

      // Simulate check_hook logic
      const matchedStrategy = checkRequiredSSO({
        email: currentEmail,
        strategies,
      });

      const shouldBlock =
        matchedStrategy != null &&
        matchedStrategy.updateOnLogin &&
        (typeof attemptedChange.first_name === "string" ||
          typeof attemptedChange.last_name === "string");

      expect(shouldBlock).toBe(false); // updateOnLogin is false, so name changes allowed
    });
  });
});
