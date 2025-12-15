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
            [otherId]: { upgrades: { memory: 1024 } },
          },
        },
        accountId,
      ),
    ).toThrow(
      "users set queries may only change upgrades for the requesting account",
    );
  });

  test("allows system-style updates when no account_id is provided", () => {
    const value = sanitizeUserSetQueryProjectUsers({
      users: {
        [accountId]: { hide: false, ssh_keys: {} },
      },
    });
    expect(value).toEqual({
      [accountId]: { hide: false, ssh_keys: {} },
    });
  });

  test("allows system operations to set group to owner", () => {
    const value = sanitizeUserSetQueryProjectUsers({
      users: {
        [accountId]: { group: "owner", hide: false },
      },
    });
    expect(value).toEqual({
      [accountId]: { group: "owner", hide: false },
    });
  });

  test("allows system operations to set group to collaborator", () => {
    const value = sanitizeUserSetQueryProjectUsers({
      users: {
        [accountId]: { group: "collaborator" },
      },
    });
    expect(value).toEqual({
      [accountId]: { group: "collaborator" },
    });
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

  test("rejects invalid group values in system operations", () => {
    expect(() =>
      sanitizeUserSetQueryProjectUsers({
        users: {
          [accountId]: { group: "admin" },
        },
      }),
    ).toThrow(
      "invalid group value 'admin' - must be 'owner' or 'collaborator'",
    );
  });

  test("allows hiding another collaborator", () => {
    const value = sanitizeUserSetQueryProjectUsers(
      {
        users: {
          [otherId]: { hide: true },
        },
      },
      accountId,
    );
    expect(value).toEqual({
      [otherId]: { hide: true },
    });
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
