import { Table } from "../app-framework/Table";

// Create and register account table, which gets automatically
// synchronized with the server.
export class AccountTable extends Table {
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
    return this.redux.getActions("account").setState(changes && changes.toJS());
  }
}
