import { Table } from "../app-framework";

export class FileUseTable extends Table {
  query() {
    return "file_use";
  }
  _change = (table: any) => {
    this.redux.getStore("file_use")._clear_cache();
    this.redux.getActions("file_use").setState({ file_use: table.get() });
  };
  options() {
    return [];
  }
}
