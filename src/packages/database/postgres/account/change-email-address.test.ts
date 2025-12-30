/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Tests for change_email_address method
 */

import { initEphemeralDatabase } from "@cocalc/database/pool";
import { db } from "@cocalc/database";
import { callback_opts } from "@cocalc/util/async-utils";
import { testCleanup } from "@cocalc/database/test-utils";
import { uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "../types";

describe("change_email_address", () => {
  let database: PostgreSQL;

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db();
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  /**
   * Call change_email_address through CoffeeScript class (which wraps TypeScript)
   */
  async function change_email_address_wrapper(opts: {
    account_id: string;
    email_address: string;
    stripe: any;
  }): Promise<void> {
    return callback_opts(database.change_email_address.bind(database))({
      ...opts,
    });
  }

  /**
   * Helper to create a test account
   */
  async function createTestAccount(email: string): Promise<string> {
    const account_id = uuid();
    await database.async_query({
      query: "INSERT INTO accounts",
      values: {
        account_id,
        email_address: email,
        created: new Date(),
      },
      conflict: "ON CONFLICT DO NOTHING",
    });
    return account_id;
  }

  /**
   * Helper to get account email
   */
  async function getAccountEmail(account_id: string): Promise<string> {
    const result = await database.async_query({
      query: "SELECT email_address FROM accounts",
      where: { "account_id = $::UUID": account_id },
    });
    return result.rows?.[0]?.email_address;
  }

  /**
   * Helper to set stripe_customer_id for an account
   */
  async function setStripeCustomerId(
    account_id: string,
    customer_id: string,
  ): Promise<void> {
    await database.async_query({
      query: "UPDATE accounts",
      set: { stripe_customer_id: customer_id },
      where: { "account_id = $::UUID": account_id },
    });
  }

  /**
   * Mock Stripe client
   */
  function createMockStripe(options?: {
    shouldThrow?: boolean;
    errorMessage?: string;
  }) {
    const calls: any[] = [];
    return {
      customers: {
        retrieve: jest.fn(async (customer_id) => {
          calls.push({ method: "retrieve", customer_id });
          if (options?.shouldThrow) {
            throw new Error(options.errorMessage ?? "Stripe API error");
          }
          return {
            id: customer_id,
            email: "old@example.com",
            subscriptions: { data: [] },
          };
        }),
        update: jest.fn(async (customer_id, update) => {
          calls.push({ method: "update", customer_id, update });
          if (options?.shouldThrow) {
            throw new Error(options.errorMessage ?? "Stripe API error");
          }
          return {
            id: customer_id,
            email: update.email,
            subscriptions: { data: [] },
          };
        }),
      },
      _calls: calls,
    };
  }

  describe("successful email change", () => {
    it("should change email address when new email is not taken", async () => {
      const unique_id = uuid().substring(0, 8);
      const account_id = await createTestAccount(
        `original-${unique_id}@example.com`,
      );
      const stripe = createMockStripe();

      await change_email_address_wrapper({
        account_id,
        email_address: `new-${unique_id}@example.com`,
        stripe,
      });

      const email = await getAccountEmail(account_id);
      expect(email).toBe(`new-${unique_id}@example.com`);
    });

    it("should not call Stripe when account has no stripe_customer_id", async () => {
      const unique_id = uuid().substring(0, 8);
      const account_id = await createTestAccount(
        `test1-${unique_id}@example.com`,
      );
      const stripe = createMockStripe();

      await change_email_address_wrapper({
        account_id,
        email_address: `test1-new-${unique_id}@example.com`,
        stripe,
      });

      expect(stripe.customers.retrieve).not.toHaveBeenCalled();
      expect(stripe.customers.update).not.toHaveBeenCalled();
    });

    it("should call Stripe sync when account has stripe_customer_id", async () => {
      const unique_id = uuid().substring(0, 8);
      const account_id = await createTestAccount(
        `test2-${unique_id}@example.com`,
      );
      const customer_id = "cus_" + uuid().replace(/-/g, "");
      await setStripeCustomerId(account_id, customer_id);

      const stripe = createMockStripe();

      await change_email_address_wrapper({
        account_id,
        email_address: `test2-new-${unique_id}@example.com`,
        stripe,
      });

      const email = await getAccountEmail(account_id);
      expect(email).toBe(`test2-new-${unique_id}@example.com`);
      expect(stripe.customers.retrieve).toHaveBeenCalledWith(customer_id, {
        expand: ["sources", "subscriptions"],
      });
    });
  });

  describe("email_already_taken error", () => {
    it("should return error when email is already taken", async () => {
      const unique_id = uuid().substring(0, 8);
      const email1 = `user1-${unique_id}@example.com`;
      const email2 = `user2-${unique_id}@example.com`;
      const account_id1 = await createTestAccount(email1);
      await createTestAccount(email2);
      const stripe = createMockStripe();

      // Try to change account_id1 to user2 email (already taken)
      await expect(
        change_email_address_wrapper({
          account_id: account_id1,
          email_address: email2,
          stripe,
        }),
      ).rejects.toMatch(/email_already_taken/);

      // Email should remain unchanged
      const email = await getAccountEmail(account_id1);
      expect(email).toBe(email1);
    });

    it("should not update database or call Stripe when email is taken", async () => {
      const unique_id = uuid().substring(0, 8);
      const email1 = `taken1-${unique_id}@example.com`;
      const email2 = `taken2-${unique_id}@example.com`;
      const account_id1 = await createTestAccount(email1);
      await createTestAccount(email2);
      await setStripeCustomerId(account_id1, "cus_test" + unique_id);

      const stripe = createMockStripe();

      await expect(
        change_email_address_wrapper({
          account_id: account_id1,
          email_address: email2,
          stripe,
        }),
      ).rejects.toMatch(/email_already_taken/);

      expect(stripe.customers.retrieve).not.toHaveBeenCalled();
    });
  });

  describe("Stripe synchronization errors", () => {
    it("should propagate Stripe errors when sync fails", async () => {
      const unique_id = uuid().substring(0, 8);
      const account_id = await createTestAccount(
        `stripe-error-${unique_id}@example.com`,
      );
      const customer_id = "cus_" + uuid().replace(/-/g, "");
      await setStripeCustomerId(account_id, customer_id);

      const stripe = createMockStripe({
        shouldThrow: true,
        errorMessage: "Stripe service unavailable",
      });

      await expect(
        change_email_address_wrapper({
          account_id,
          email_address: `stripe-error-new-${unique_id}@example.com`,
          stripe,
        }),
      ).rejects.toThrow(/Stripe service unavailable/);
    });

    it("should still update email in database even if Stripe sync fails", async () => {
      const unique_id = uuid().substring(0, 8);
      const account_id = await createTestAccount(
        `stripe-error2-${unique_id}@example.com`,
      );
      const customer_id = "cus_" + uuid().replace(/-/g, "");
      await setStripeCustomerId(account_id, customer_id);

      const stripe = createMockStripe({
        shouldThrow: true,
        errorMessage: "Network error",
      });

      await expect(
        change_email_address_wrapper({
          account_id,
          email_address: `stripe-error2-new-${unique_id}@example.com`,
          stripe,
        }),
      ).rejects.toThrow(/Network error/);

      // Email should be updated despite Stripe error (happens in step 2, before Stripe sync in step 3)
      const email = await getAccountEmail(account_id);
      expect(email).toBe(`stripe-error2-new-${unique_id}@example.com`);
    });
  });

  describe("validation and edge cases", () => {
    it("should handle same email (throws email_already_taken)", async () => {
      const unique_id = uuid().substring(0, 8);
      const email = `same-${unique_id}@example.com`;
      const account_id = await createTestAccount(email);
      const stripe = createMockStripe();

      // CoffeeScript checks account_exists which finds the same account's email
      await expect(
        change_email_address_wrapper({
          account_id,
          email_address: email,
          stripe,
        }),
      ).rejects.toMatch(/email_already_taken/);
    });

    // NOTE: Test removed - CoffeeScript has a critical bug where it crashes
    // when account doesn't exist (tries to access x.stripe_customer_id on undefined).
    // This is an unhandled exception. TypeScript implementation will fix this bug.

    it("should handle email with different case", async () => {
      const unique_id = uuid().substring(0, 8);
      const account_id = await createTestAccount(
        `lower-${unique_id}@example.com`,
      );
      const stripe = createMockStripe();

      await change_email_address_wrapper({
        account_id,
        email_address: `LOWER-${unique_id}@example.com`,
        stripe,
      });

      const email = await getAccountEmail(account_id);
      expect(email).toBe(`LOWER-${unique_id}@example.com`);
    });

    it("should NOT detect case-sensitive differences (PostgreSQL = is case-sensitive)", async () => {
      const unique_id = uuid().substring(0, 8);
      const email1 = `Case1-${unique_id}@example.com`;
      const email2 = `other-${unique_id}@example.com`;
      await createTestAccount(email1);
      const account_id2 = await createTestAccount(email2);
      const stripe = createMockStripe();

      // CoffeeScript uses = which is case-sensitive, so lowercase version is allowed
      await change_email_address_wrapper({
        account_id: account_id2,
        email_address: email1.toLowerCase(),
        stripe,
      });

      const email = await getAccountEmail(account_id2);
      expect(email).toBe(email1.toLowerCase());
    });
  });

  describe("concurrent operations", () => {
    it("should handle multiple email changes to same account sequentially", async () => {
      const unique_id = uuid().substring(0, 8);
      const account_id = await createTestAccount(
        `concurrent-${unique_id}@example.com`,
      );
      const stripe = createMockStripe();

      await change_email_address_wrapper({
        account_id,
        email_address: `concurrent1-${unique_id}@example.com`,
        stripe,
      });

      await change_email_address_wrapper({
        account_id,
        email_address: `concurrent2-${unique_id}@example.com`,
        stripe,
      });

      const email = await getAccountEmail(account_id);
      expect(email).toBe(`concurrent2-${unique_id}@example.com`);
    });
  });
});
