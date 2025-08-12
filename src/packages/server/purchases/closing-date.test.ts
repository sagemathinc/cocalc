/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  getLastClosingDate,
  getNextClosingDate,
  getClosingDay,
  setClosingDay,
} from "./closing-date";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import { before, after } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("basic consistency checks for closing date functions", () => {
  const account_id = uuid();

  it("'works' when the account doesn't exist (doesn't change db)", async () => {
    const d = await getClosingDay(uuid());
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(28);
  });

  it("'make account and get closing day", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
    const d = await getClosingDay(account_id);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(28);
  });

  it("check that next closing date is in the future", async () => {
    const d = await getNextClosingDate(account_id);
    expect(d >= new Date()).toBe(true);
  });

  it("check that last closing date is in the past", async () => {
    const d = await getLastClosingDate(account_id);
    expect(d < new Date()).toBe(true);
  });

  it("set and read the closing date", async () => {
    await setClosingDay(account_id, 3);
    const d = await getClosingDay(account_id);
    expect(d).toBe(3);
  });
});
