/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "../app-framework/Table";

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
    return "accounts";
  }

  _change(table: { get_one: () => { toJS: () => any } }) {
    const changes = table.get_one();
    if (!changes) return;
    const actions = this.redux.getActions("account");
    actions.setState(changes.toJS());
    if (this.first_set) {
      this.first_set = false;
      actions.setState({ is_ready: true });
      this.redux.getStore("account").emit("is_ready");
    }
  }
}
