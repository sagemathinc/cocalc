import { JupyterEditorActions } from "../actions";

// The actual data is stored in the desc of the leaf node.

export class NotebookFrameStore {
  private actions: JupyterEditorActions;
  private id: string;

  constructor(actions: JupyterEditorActions, id: string) {
    this.actions = actions;
    this.id = id;
  }

  get(key: string, def: any): any {
    return this.actions._get_frame_data(this.id, key, def);
  }

  getIn(key: string[], def: any): any {
    if (key.length == 0) return;
    if (key.length == 1)
      return this.actions._get_frame_data(this.id, key[0], def);
    const x = this.actions._get_frame_data(this.id, key[0]);
    if (x != null && typeof x.getIn === "function") {
      return x.getIn(key.slice(1), def);
    } else {
      return def;
    }
  }

  set(key: string, value: any): void {
    this.actions.set_frame_data({ id: this.id, [key]: value });
  }
}
