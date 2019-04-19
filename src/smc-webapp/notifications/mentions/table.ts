import { Table } from "../../app-framework";

export class MentionsTable extends Table {
  query() {
    return "mentions";
  }

  options(): any[] {
    return [];
  }

  _change(table, _keys): void {
    const actions = this.redux.getActions("mentions");
    if (actions == null) throw Error("actions must be defined");

    const mentions = table.get();
    console.log("Table got", mentions.toJS());
    actions.update_state(mentions);
  }
}
