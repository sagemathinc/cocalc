/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import dayjs from "dayjs";
import { uuid } from "@cocalc/util/misc";
import { before, after } from "@cocalc/server/test";
import createSubscription from "./create-subscription";
import { createTestAccount } from "./test-data";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("createSubscription membership metadata validation", () => {
  const account_id = uuid();

  it("creates an account", async () => {
    await createTestAccount(account_id);
  });

  it("rejects membership metadata without class", async () => {
    expect.assertions(1);
    try {
      await createSubscription(
        {
          account_id,
          cost: 10,
          interval: "month",
          current_period_start: dayjs().toDate(),
          current_period_end: dayjs().add(1, "month").toDate(),
          status: "active",
          metadata: { type: "membership" } as any,
          latest_purchase_id: 0,
        },
        null,
      );
    } catch (err) {
      expect(err.message).toMatch("membership metadata must include class");
    }
  });

  it("accepts membership metadata with class", async () => {
    const id = await createSubscription(
      {
        account_id,
        cost: 10,
        interval: "month",
        current_period_start: dayjs().toDate(),
        current_period_end: dayjs().add(1, "month").toDate(),
        status: "active",
        metadata: { type: "membership", class: "member" },
        latest_purchase_id: 0,
      },
      null,
    );
    expect(typeof id).toBe("number");
  });
});
