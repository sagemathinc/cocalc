/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { parse_target } from "../history2";

describe("Testing inputs", () => {
  test("projects", () => {
    const matched_paths = ["projects/", "projects"];
    const account_settings_descriptor = { page: "projects" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("a single project with no additional target and a trailing slash", () => {
    const account_settings_descriptor = {
      page: "project",
      target: "some-kind-of-uuid/",
    };
    expect(parse_target("projects/some-kind-of-uuid/")).toEqual(
      account_settings_descriptor
    );
  });

  test("a single project with no additional target and no trailing slash", () => {
    const account_settings_descriptor = {
      page: "project",
      target: "some-kind-of-uuid",
    };
    expect(parse_target("projects/some-kind-of-uuid")).toEqual(
      account_settings_descriptor
    );
  });

  test("a single project with a target and a trailing slash", () => {
    const account_settings_descriptor = {
      page: "project",
      target: "some-kind-of-uuid/path-of/target/",
    };
    expect(parse_target("projects/some-kind-of-uuid/path-of/target/")).toEqual(
      account_settings_descriptor
    );
  });

  test("a single project with a target and no trailing slash", () => {
    const account_settings_descriptor = {
      page: "project",
      target: "some-kind-of-uuid/path-of/target",
    };
    expect(parse_target("projects/some-kind-of-uuid/path-of/target")).toEqual(
      account_settings_descriptor
    );
  });

  test("settings account", () => {
    const matched_paths = [
      "settings/",
      "settings",
      "settings/account",
      "settings/account/",
      "",
      undefined,
    ];
    const account_settings_descriptor = { page: "account", tab: "account" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("settings billing", () => {
    const matched_paths = ["settings/billing/", "settings/billing/"];
    const account_settings_descriptor = { page: "account", tab: "billing" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("settings upgrades", () => {
    const matched_paths = ["settings/upgrades/", "settings/upgrades/"];
    const account_settings_descriptor = { page: "account", tab: "upgrades" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("settings support", () => {
    const matched_paths = ["settings/support/", "settings/support/"];
    const account_settings_descriptor = { page: "account", tab: "support" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("settings ssh-keys", () => {
    const matched_paths = ["settings/ssh-keys/", "settings/ssh-keys/"];
    const account_settings_descriptor = { page: "account", tab: "ssh-keys" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("notifications", () => {
    const matched_paths = ["notifications/", "notifications"];
    const account_settings_descriptor = { page: "notifications" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("help", () => {
    const matched_paths = ["help/", "help"];
    const account_settings_descriptor = { page: "help" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("file-use", () => {
    const matched_paths = ["file-use/", "file-use"];
    const account_settings_descriptor = { page: "file-use" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });

  test("admin", () => {
    const matched_paths = ["admin/", "admin"];
    const account_settings_descriptor = { page: "admin" };
    for (const path of matched_paths) {
      expect(parse_target(path)).toEqual(account_settings_descriptor);
    }
  });
});
