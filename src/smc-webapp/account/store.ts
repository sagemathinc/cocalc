import { Store } from "../app-framework/Store";
import { AccountState } from "./types";
import { get_total_upgrades } from "smc-util/upgrades";
import * as misc from "smc-util/misc2";
import * as lodash from "lodash";

// Define account store
export class AccountStore extends Store<AccountState> {
  // User type
  //   - 'public'     : user is not signed in at all, and not trying to sign in
  //   - 'signing_in' : user is currently waiting to see if sign-in attempt will succeed
  //   - 'signed_in'  : user has successfully authenticated and has an id
  constructor(name, redux) {
    super(name, redux);
    misc.bind_methods(this, [
      "get_user_type",
      "get_account_id",
      "is_admin",
      "get_terminal_settings",
      "get_editor_settings",
      "get_fullname",
      "get_first_name",
      "get_color",
      "get_username",
      "get_email_address",
      "get_confirm_close",
      "get_total_upgrades",
      "is_paying_member",
      "get_page_size"
    ]);
  }

  get_user_type(): string {
    return this.get("user_type");
  }

  get_account_id(): string {
    return this.get("account_id");
  }

  is_admin(): boolean {
    const groups = this.get("groups");
    return !!groups && groups.includes("admin");
  }

  get_terminal_settings(): Object | undefined {
    return this.get("terminal") ? this.get("terminal").toJS() : undefined;
  }

  get_editor_settings(): Object | undefined {
    return this.get("editor_settings")
      ? this.get("terminal").toJS()
      : undefined;
  }

  get_fullname(): string {
    const first_name = this.get("first_name");
    const last_name = this.get("last_name");
    if (first_name == undefined && last_name == undefined) {
      return "";
    } else if (first_name == undefined) {
      return last_name;
    } else if (last_name == undefined) {
      return first_name;
    } else {
      return `${first_name} ${last_name}`;
    }
  }

  get_first_name(): string {
    return this.get("first_name", "");
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

  get_email_address(): string {
    return this.get("email_address");
  }

  get_confirm_close(): string {
    return this.getIn(["other_settings", "confirm_close"]);
  }

  // Total ugprades this user is paying for (sum of all upgrades from subscriptions)
  get_total_upgrades(): number[] {
    const stripe_data = this.getIn([
      "stripe_customer",
      "subscriptions",
      "data"
    ]);
    return stripe_data && get_total_upgrades(stripe_data.toJS());
  }

  // uses the total upgrades information to determine, if this is a paying member
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
