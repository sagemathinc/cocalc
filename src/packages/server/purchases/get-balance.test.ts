/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getBalance from "./get-balance";
import getPool, { enablePgMem } from "@cocalc/database/pool";

describe("test renewing a license", () => {
  const account_id = "752be8c3-ff74-41d8-ad1c-b2fb92c3e7eb";

  beforeAll(async () => {
    await enablePgMem();
    const pool = getPool();
  });

  it("get the balance for a new user with no purchases", async () => {
    expect(await getBalance(account_id)).toBe(0);
  });
});
