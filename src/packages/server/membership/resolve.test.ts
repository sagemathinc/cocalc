/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { before, after } from "@cocalc/server/test";
import { uuid } from "@cocalc/util/misc";
import { resolveMembershipForAccount } from "./resolve";
import {
  createTestAccount,
  createTestMembershipSubscription,
} from "@cocalc/server/purchases/test-data";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("resolveMembershipForAccount", () => {
  const account_id = uuid();

  it("returns free when no membership subscription exists", async () => {
    await createTestAccount(account_id);
    const result = await resolveMembershipForAccount(account_id);
    expect(result.class).toBe("free");
    expect(result.source).toBe("free");
  });

  it("returns membership class when subscription exists", async () => {
    await createTestMembershipSubscription(account_id, { class: "member" });
    const result = await resolveMembershipForAccount(account_id);
    expect(result.class).toBe("member");
    expect(result.source).toBe("subscription");
  });
});
