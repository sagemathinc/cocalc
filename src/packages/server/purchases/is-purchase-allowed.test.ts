/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { uuid } from "@cocalc/util/misc";
import createAccount from "../accounts/create-account";
import createPurchase from "./create-purchase";
import { isPurchaseAllowed } from "./is-purchase-allowed";
import { before, after } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("test checking whether or not purchase is allowed under various conditions", () => {
  const account_id = uuid();

  it("check small membership purchase not allowed for a new user", async () => {
    await createAccount({
      email: `${account_id}@example.com`,
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });

    const { allowed, chargeAmount } = await isPurchaseAllowed({
      account_id,
      service: "membership",
      cost: 1,
    });
    expect(allowed).toBe(false);
    const { pay_as_you_go_min_payment } = await getServerSettings();
    expect(chargeAmount).toBe(pay_as_you_go_min_payment);
  });

  it("check larger membership purchase also not allowed for new user", async () => {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    const { allowed, chargeAmount } = await isPurchaseAllowed({
      account_id,
      service: "membership",
      cost: 10 + pay_as_you_go_min_payment,
    });
    expect(allowed).toBe(false);
    expect(chargeAmount).toBe(10 + pay_as_you_go_min_payment);
  });

  it("small membership purchase is allowed after we add some credit, but user has to pay the min", async () => {
    await createPurchase({
      account_id,
      service: "credit",
      description: {} as any,
      client: null,
      cost: -1000,
    });
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "membership",
      cost: 1,
    });
    expect(allowed).toBe(true);
  });

  it("larger membership purchase is also allowed", async () => {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "membership",
      cost: 10 + pay_as_you_go_min_payment,
    });
    expect(allowed).toBe(true);
  });

  it("says no with an appropriate message if the account doesn't exist", async () => {
    // Create a non-existent account ID
    const nonExistentAccountId = uuid();
    const { allowed, reason } = await isPurchaseAllowed({
      account_id: nonExistentAccountId,
      service: "membership",
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
      service: "membership",
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

  it("does not allow zero-cost membership purchases", async () => {
    const { allowed } = await isPurchaseAllowed({
      account_id,
      service: "membership",
      cost: 0,
    });
    expect(allowed).toBe(false);
  });

});
