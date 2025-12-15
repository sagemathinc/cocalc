/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { uuid } from "@cocalc/util/misc";
import { sanitizeUserSetQueryProjectUsers } from "./user-set-query-project-users";

describe("_user_set_query_project_users sanitizer", () => {
  const accountId = uuid();
  const otherId = uuid();

  test("returns undefined when users is not provided", () => {
    const value = sanitizeUserSetQueryProjectUsers({}, accountId);
    expect(value).toBeUndefined();
  });

  test("allows updating own hide and upgrades", () => {
    const value = sanitizeUserSetQueryProjectUsers(
      {
        users: {
          [accountId]: { hide: true, upgrades: { memory: 1024 } },
        },
      },
      accountId,
    );
    expect(value).toEqual({
      [accountId]: { hide: true, upgrades: { memory: 1024 } },
    });
  });

  test("rejects modifying another account", () => {
    expect(() =>
      sanitizeUserSetQueryProjectUsers(
        {
          users: {
            [otherId]: { hide: true },
          },
        },
        accountId,
      ),
    ).toThrow("users set queries may only modify the requesting account");
  });

  test("rejects group changes", () => {
    expect(() =>
      sanitizeUserSetQueryProjectUsers(
        {
          users: {
            [accountId]: { group: "owner" },
          },
        },
        accountId,
      ),
    ).toThrow("changing collaborator group via user_set_query is not allowed");
  });

  test("rejects invalid upgrade field", () => {
    expect(() =>
      sanitizeUserSetQueryProjectUsers(
        {
          users: {
            [accountId]: { upgrades: { invalidQuota: 1 } },
          },
        },
        accountId,
      ),
    ).toThrow("invalid upgrades field 'invalidQuota'");
  });
});
