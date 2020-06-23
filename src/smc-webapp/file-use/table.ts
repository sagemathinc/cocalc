/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "../app-framework";

import { FileUseStore } from "./store";

export class FileUseTable extends Table {
  constructor(name, redux) {
    super(name, redux);
    this._change = this._change.bind(this);
  }

  query() {
    return "file_use";
  }

  options(): any[] {
    return [];
  }

  _change(table, _keys): void {
    const store: FileUseStore | undefined = this.redux.getStore("file_use");
    if (store == null) throw Error("store must be defined");
    store.clear_cache();

    const actions = this.redux.getActions("file_use");
    if (actions == null) throw Error("actions must be defined");
    const file_use = table.get();
    actions.setState({ file_use });
  }
}
