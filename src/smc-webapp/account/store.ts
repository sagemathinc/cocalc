/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as lodash from "lodash";
import { Store } from "../app-framework/Store";
import { AccountState } from "./types";
import { get_total_upgrades } from "smc-util/upgrades";
import * as misc from "smc-util/misc";
import { Map, List } from "immutable";
import { store as customizeStore } from "../customize";

// Define account store
export class AccountStore extends Store<AccountState> {
  // User type
  //   - 'public'     : user is not signed in at all, and not trying to sign in
  //   - 'signing_in' : user is currently waiting to see if sign-in attempt will succeed
  //   - 'signed_in'  : user has successfully authenticated and has an id
  constructor(name, redux) {
    super(name, redux);
    this.setup_selectors();
  }

  get_user_type(): string {
    return this.get("user_type");
  }

  get_account_id(): string {
    return this.get("account_id");
  }

  selectors = {
    is_anonymous: {
      fn: () => {
        return is_anonymous(
          this.get("is_logged_in"),
          this.get("email_address"),
          this.get("passports"),
          this.get("lti_id")
        );
      },
      dependencies: [
        "email_address",
        "passports",
        "is_logged_in",
        "lti_id",
      ] as const,
    },
    is_admin: {
      fn: () => {
        const groups = this.get("groups");
        return !!groups && groups.includes("admin");
      },
      dependencies: ["groups"] as const,
    },
  };

  get_terminal_settings(): { [key: string]: any } | undefined {
    return this.get("terminal") ? this.get("terminal").toJS() : undefined;
  }

  get_editor_settings(): { [key: string]: any } | undefined {
    return this.get("editor_settings")
      ? this.get("editor_settings").toJS()
      : undefined;
  }

  get_fullname(): string {
    const first_name = this.get("first_name");
    const last_name = this.get("last_name");
    if (first_name == null && last_name == null) {
      return "Anonymous";
    } else if (first_name == undefined) {
      return last_name ?? "";
    } else if (last_name == undefined) {
      return first_name ?? "";
    } else {
      return `${first_name} ${last_name}`;
    }
  }

  get_first_name(): string {
    return this.get("first_name", "Anonymous");
  }

  get_color(): string {
    return this.getIn(
      ["profile", "color"],
      this.get("account_id", "f00").slice(0, 6)
    );
  }

  get_username(): string {
    return misc.make_valid_name(this.get_fullname());
  }

  get_email_address(): string | undefined {
    return this.get("email_address");
  }

  get_confirm_close(): string {
    return this.getIn(["other_settings", "confirm_close"]);
  }

  // Total ugprades this user is paying for (sum of all upgrades from subscriptions)
  get_total_upgrades(): { [key: string]: number } | undefined {
    const stripe_data = this.getIn([
      "stripe_customer",
      "subscriptions",
      "data",
    ]);
    return stripe_data && get_total_upgrades(stripe_data.toJS());
  }

  // uses the total upgrades information to determine, if this is a paying member
  // TODO: this is not used anywhere; but, if it was, it should also take into account
  // being a license manager...
  is_paying_member(): boolean {
    const ups = this.get_total_upgrades();
    return (
      ups != null && lodash.reduce(ups, (a: number, b: number) => a + b, 0) > 0
    );
  }

  get_page_size(): number {
    return this.getIn(["other_settings", "page_size"], 500);
  }
}

// A user is anonymous if they have not provided a way to sign
// in later (besides their cookie), i.e., if they have no
// passport strategies and have not provided an email address.
// In is_personal mode, user is never anonymous.
function is_anonymous(
  is_logged_in: boolean,
  email_address: string | undefined | null,
  passports: Map<string, any> | undefined | null,
  lti_id: List<string> | undefined | null
): boolean {
  if (!is_logged_in) {
    return false;
  }
  if (email_address) {
    return false;
  }
  if (passports != null && passports.size > 0) {
    return false;
  }
  if (lti_id != null && lti_id.size > 0) {
    return false;
  }
  if (customizeStore.get("is_personal")) {
    return false;
  }
  return true;
}
