import { Table } from "../app-framework/Table";

// Create and register account table, which gets automatically
// synchronized with the server.
class AccountTable extends Table {
  constructor(...args) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) {
        super();
      }
      let thisFn = (() => {
        return this;
      }).toString();
      let thisName = thisFn.match(
        /return (?:_assertThisInitialized\()*(\w+)\)*;/
      )[1];
      eval(`${thisName} = this;`);
    }
    this.query = this.query.bind(this);
    this._change = this._change.bind(this);
    super(...args);
  }

  query() {
    return "accounts";
  }

  _change(table) {
    return this.redux
      .getActions("account")
      .setState(__guardMethod__(table.get_one(), "toJS", o => o.toJS()));
  }
}
