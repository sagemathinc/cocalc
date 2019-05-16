import { JupyterEditorActions } from "../actions";
import { NotebookFrameStore } from "./store";
import { create_key_handler } from "../../../jupyter/keyboard";

export class NotebookFrameActions {
  private actions: JupyterEditorActions;
  private id: string;
  private store: NotebookFrameStore;
  private key_handler?: Function;

  constructor(actions: JupyterEditorActions, id: string) {
    this.actions = actions;
    this.id = id;
    this.store = new NotebookFrameStore(actions, id);
    console.log(this.actions, this.id, this.store);
  }

  public cut(): void {
    console.log("NotebookFrameActions.cut");
  }

  public copy(): void {
    console.log("NotebookFrameActions.copy");
  }

  public paste(): void {
    console.log("NotebookFrameActions.paste");
  }

  public enable_key_handler(): void {
    if (this.key_handler == null) {
      this.key_handler = create_key_handler(this);
    }
    this.actions.set_active_key_handler(this.key_handler);
  }

  public disable_key_handler(): void {
    if (this.key_handler == null) return;
    this.actions.erase_active_key_handler(this.key_handler);
  }

  public shift_enter_run_selected_cells(): void {
    console.log("shift_enter_run_selected_cells -- ", this.id);
  }

  public scroll(pos: string): void {
    console.log("scroll", pos);
  }
}
