/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { MAX_COST } from "@cocalc/util/db-schema/purchases";
import { uuid } from "@cocalc/util/misc";
import createAccount from "../accounts/create-account";
import createPurchase from "./create-purchase";
import {
  assertPurchaseAllowed,
  isPurchaseAllowed,
} from "./is-purchase-allowed";
import { getPurchaseQuota, setPurchaseQuota } from "./purchase-quotas";
import { before, after } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("test checking whether or not purchase is allowed under various conditions", () => {
  const account_id = uuid();

  it("check small purchase not allowed for a new user", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });

    const { allowed, chargeAmount } = await isPurchaseAllowed({
      account_id,
      service: "license",
      cost: 1,
    });
    expect(allowed).toBe(false);
    const { pay_as_you_go_min_payment } = await getServerSettings();
    expect(chargeAmount).toBe(pay_as_you_go_min_payment);
  });

  it("check larger purchase also not allowed for new user", async () => {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    const { allowed, chargeAmount } = await isPurchaseAllowed({
      account_id,
      service: "license",
      cost: 10 + pay_as_you_go_min_payment,
    });
    expect(allowed).toBe(false);
    expect(chargeAmount).toBe(10 + pay_as_you_go_min_payment);
  });

  it("small purchase is allowed after we add some credit, but user has to pay the min", async () => {
    await createPurchase({
      account_id,
      service: "credit",
      description: {} as any,
      client: null,
      cost: -1000,
    });
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "license",
      cost: 1,
    });
    expect(allowed).toBe(true);
  });

  it("larger purchase is also allowed", async () => {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "license",
      cost: 10 + pay_as_you_go_min_payment,
    });
    expect(allowed).toBe(true);
  });

  it("says no with an appropriate message if the account doesn't exist", async () => {
    // Create a non-existent account ID
    const nonExistentAccountId = uuid();
    const { allowed, reason } = await isPurchaseAllowed({
      account_id: nonExistentAccountId,
      service: "license",
      cost: 1,
    });
    expect(allowed).toBe(false);
    expect(reason).toContain("is not a valid account");
  });

  it("says 'no' for non-existent services", async () => {
    const { allowed, reason } = await isPurchaseAllowed({
      account_id,
      service: "this-is-a-fake-made-up-service-that-does-not-exist" as any,
      cost: 1,
    });
    expect(allowed).toBe(false);
    expect(reason).toContain("unknown service");
  });

  it("says 'no' for non-finite cost", async () => {
    const { allowed, reason } = await isPurchaseAllowed({
      account_id,
      service: "license",
      cost: 1 / 0,
    });
    expect(allowed).toBe(false);
    expect(reason).toContain("cost must be finite");
  });

  it("refuses to allow credit less than the minimum, but does allow if >= min", async () => {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "credit",
      cost: -pay_as_you_go_min_payment / 2,
    });
    expect(allowed).toBe(false);

    const x = await isPurchaseAllowed({
      account_id,
      service: "credit",
      cost: -pay_as_you_go_min_payment,
    });
    expect(x.allowed).toBe(true);

    const y = await isPurchaseAllowed({
      account_id,
      service: "credit",
      cost: -2 * pay_as_you_go_min_payment,
    });
    expect(y.allowed).toBe(true);
  });

  it("allows edit-license to have cost 0, but not other services", async () => {
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "edit-license",
      cost: 0,
    });
    expect(allowed).toBe(true);

    const x = await isPurchaseAllowed({
      account_id,
      service: "license",
      cost: 0,
    });
    expect(x.allowed).toBe(false);
  });

  it("allows but DISCOURAGES purchase for service with a quota even though our balance is large, since the quota default is 0", async () => {
    const { allowed, reason, discouraged } = await isPurchaseAllowed({
      account_id,
      service: "compute-server",
      cost: 0.5,
    });
    expect(allowed).toBe(true);
    expect(discouraged).toBe(true);
    expect(reason).toMatch("may exceed your personal monthly spending budget");
  });

  it("allows and does not DISCOURAGES purchase for an LLM with a quota even though our balance is large, since the quota default is 10 ", async () => {
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "openai-gpt-4.1",
      cost: 0.5,
    });
    expect(allowed).toBe(true);
  });

  it("raise the quota and now purchase *is* not discouraged", async () => {
    await setPurchaseQuota({
      account_id,
      service: "compute-server",
      value: 2,
    });
    const { allowed, discouraged } = await isPurchaseAllowed({
      account_id,
      service: "compute-server",
      cost: 0.5,
    });
    expect(allowed).toBe(true);
    expect(!!discouraged).toBe(false);
  });

  it("raise the quota and now purchase *is* allowed BUT ONLY UP TO A POINT", async () => {
    await setPurchaseQuota({
      account_id,
      service: "compute-server",
      value: 5000,
    });
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "compute-server",
      cost: 5000,
    });
    expect(allowed).toBe(false); // because balance
  });

  it("raise the quota to well beyond the purchase limit, and now purchase *is* not allowed because of purchase limit", async () => {
    await setPurchaseQuota({
      account_id,
      service: "compute-server",
      value: 10 * MAX_COST,
    });
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "compute-server",
      cost: MAX_COST,
    });
    expect(allowed).toBe(false); // because balance
  });

  it("also test assertPurchaseAllowed in one case that throws", async () => {
    await expect(
      async () =>
        await assertPurchaseAllowed({
          account_id,
          service: "compute-server",
          cost: 100000,
        }),
    ).rejects.toThrow();
  });

  it("default quota for LLMs is about 10", async () => {
    const minBalance = await getPurchaseQuota(account_id, "openai-o1");
    const { llm_default_quota } = await getServerSettings();
    expect(minBalance).toBe(llm_default_quota);
  });
});
