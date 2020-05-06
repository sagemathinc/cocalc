/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
String or undefined. undefined => 'account'
*/
export function parse_target(
  target?: string
):
  | { page: "projects" | "help" | "file-use" | "notifications" | "admin" }
  | { page: "project"; target: string }
  | {
      page: "account";
      tab: "account" | "billing" | "upgrades" | "support" | "ssh-keys";
    }
  | {
      page: "notifications";
      tab: "mentions";
    } {
  if (target == undefined) {
    return { page: "account", tab: "account" };
  }
  const segments = target.split("/");
  switch (segments[0]) {
    case "projects":
      if (segments.length < 2 || (segments.length == 2 && segments[1] == "")) {
        return { page: "projects" };
      } else {
        return { page: "project", target: segments.slice(1).join("/") };
      }
    case "settings":
      switch (segments[1]) {
        case "account":
        case "billing":
        case "upgrades":
        case "support":
        case "ssh-keys":
          return {
            page: "account",
            tab: segments[1] as
              | "account"
              | "billing"
              | "upgrades"
              | "support"
              | "ssh-keys",
          };
        default:
          return { page: "account", tab: "account" };
      }
    case "notifications":
      return { page: "notifications" };
    case "help":
      return { page: "help" };
    case "file-use":
      return { page: "file-use" };
    case "admin":
      return { page: "admin" };
    default:
      return { page: "account", tab: "account" };
  }
}
