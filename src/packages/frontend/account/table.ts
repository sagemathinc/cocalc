/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "@cocalc/frontend/app-framework/Table";

// Create and register account table, which gets automatically
// synchronized with the server.
export class AccountTable extends Table {
  private first_set: boolean = true;

  constructor(name, redux) {
    super(name, redux);
    this.query = this.query.bind(this);
    this._change = this._change.bind(this);
  }

  options() {
    return [];
  }

  query() {
    return {
      accounts: [
        {
          account_id: null,
          balance: null,
          min_balance: null,
          balance_alert: null,
          auto_balance: null,
          email_address: null,
          email_address_verified: null,
          email_address_problem: null,
          editor_settings: null,
          other_settings: null,
          name: null,
          first_name: null,
          last_name: null,
          terminal: null,
          autosave: null,
          evaluate_key: null,
          font_size: null,
          passports: null,
          groups: null,
          last_active: null,
          ssh_keys: null,
          created: null,
          ephemeral: null,
          customize: null,
          unlisted: null,
          tags: null,
          tours: null,
          purchase_closing_day: null,
          email_daily_statements: null,
          stripe_checkout_session: null,
          stripe_usage_subscription: null,
          stripe_customer: null,
          unread_message_count: null,
        },
      ],
    };
  }

  _change(table: { get_one: () => { toJS: () => any } }) {
    const changes = table.get_one();
    if (!changes) return;
    const actions = this.redux.getActions("account");
    const obj = changes.toJS();
    actions.setState(obj);
    if (this.first_set) {
      this.first_set = false;
      actions.setState({ is_ready: true });
      this.redux.getStore("account").emit("is_ready");
    }
  }
}
