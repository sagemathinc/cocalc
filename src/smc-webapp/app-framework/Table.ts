import { AppRedux } from "../app-framework";
declare var Primus;

export type TableConstructor<T extends Table> = new (name, redux) => T;

export abstract class Table {
  public name: string;
  public _table: any;
  protected redux: AppRedux;

  // override in derived class to pass in options to the query -- these only impact initial query, not changefeed!
  abstract options(): any[];
  abstract query(): void;
  protected abstract _change(table: any, keys: string[]): void;

  constructor(name, redux) {
    this.set = this.set.bind(this);
    if (this.options) {
      this.options.bind(this);
    }
    this.name = name;
    this.redux = redux;
    if (typeof Primus === "undefined" || Primus === null) {
      // hack for now -- not running in browser (instead in testing server)
      return;
    }
    this._table = require("../webapp_client").webapp_client.sync_table2(
      this.query(),
      this.options ? this.options() : []
    );
    if (this._change !== undefined) {
      this._table.on("change", keys => {
        this._change(this._table, keys);
      });
    }
  }

  set(changes: object, merge, cb): void {
    this._table.set(changes, merge, cb);
  }
}