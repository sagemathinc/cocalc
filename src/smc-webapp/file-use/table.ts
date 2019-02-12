/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

import { Table } from "../app-framework";

export class FileUseTable extends Table {
  constructor(...args) {
    super(...args);
    this._change = this._change.bind(this);
  }

  query() {
    return "file_use";
  }

  _change(table, keys) {
    this.redux.getStore("file_use")._clear_cache();
    this.redux.getActions("file_use").setState({ file_use: table.get() });
  }
}
