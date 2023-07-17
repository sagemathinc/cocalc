/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getBalance from "./get-balance";
import createPurchase from "./create-purchase";
import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import dayjs from "dayjs";

describe("test computing balance under various conditions", () => {
  const account_id = uuid();

  beforeAll(async () => {
    await initEphemeralDatabase();
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("get the balance for a new user with no purchases", async () => {
    expect(await getBalance(account_id)).toBe(0);
  });

  it("with one purchase", async () => {
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 3.89,
    });
    expect(await getBalance(account_id)).toBeCloseTo(-3.89, 2);
  });

  it("with an additional credit", async () => {
    await createPurchase({
      account_id,
      service: "credit",
      description: {} as any,
      client: null,
      cost: -5,
    });
    expect(await getBalance(account_id)).toBeCloseTo(-3.89 + 5, 2);
  });

  it("with a different account that has a purchase, which shouldn't impact anything", async () => {
    const account_id2 = uuid();
    await createPurchase({
      account_id: account_id2,
      service: "license",
      description: {} as any,
      client: null,
      cost: 1.23,
    });
    expect(await getBalance(account_id)).toBeCloseTo(-3.89 + 5, 2);
    expect(await getBalance(account_id2)).toBeCloseTo(-1.23, 2);
  });

  it("with a purchase that has an open range and a cost_per_hour", async () => {
    const account_id = uuid();
    const hours = 2;
    const period_start = dayjs().subtract(hours, "hour").toDate();
    await createPurchase({
      account_id,
      service: "project-upgrade",
      description: {} as any,
      client: null,
      cost_per_hour: 1.25,
      period_start,
    });
    expect(await getBalance(account_id)).toBeCloseTo(-1.25 * hours, 2);
  });

  it("with a purchase that has a closed range and a cost_per_hour", async () => {
    const period_start = dayjs().subtract(4, "hour").toDate();
    const period_end = dayjs().subtract(1, "hour").toDate();
    const account_id = uuid();
    await createPurchase({
      account_id,
      service: "project-upgrade",
      description: {} as any,
      client: null,
      cost_per_hour: 1.25,
      period_start,
      period_end,
    });
    expect(await getBalance(account_id)).toBeCloseTo(-1.25 * 3, 2);
  });
});
