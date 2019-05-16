import { JupyterEditorActions } from "../actions";
import { NotebookFrameStore } from "./store";
import { create_key_handler } from "../../../jupyter/keyboard";
import { JupyterActions } from "../../../jupyter/actions";

export class NotebookFrameActions {
  private frame_tree_actions: JupyterEditorActions;
  private jupyter_actions: JupyterActions;
  private frame_id: string;
  private store: NotebookFrameStore;
  private key_handler?: Function;

  constructor(actions: JupyterEditorActions, frame_id: string) {
    // General frame tree editor actions:
    this.frame_tree_actions = actions;

    // Actions for the Jupyter notebook:
    this.jupyter_actions = actions.jupyter_actions;

    this.frame_id = frame_id;
    this.store = new NotebookFrameStore(actions, frame_id);
  }

  private dbg(f: string, ...args): void {
    console.log(
      `NotebookFrameActions(frame_id='${this.frame_id}').${f}`,
      ...args
    );
  }

  setState(obj: object): void {
    this.store.setState(obj);
  }

  set_mode(mode: "escape" | "edit"): void {
    this.dbg("set_mode", mode);
    this.setState({ mode });
  }

  public focus(): void {
    this.enable_key_handler();
  }

  public cut(): void {
    this.dbg("cut");
  }

  public copy(): void {
    this.dbg("copy");
  }

  public paste(): void {
    this.dbg("paste");
  }

  public enable_key_handler(): void {
    if (this.key_handler == null) {
      this.key_handler = create_key_handler(this);
    }
    this.frame_tree_actions.set_active_key_handler(this.key_handler);
  }

  public disable_key_handler(): void {
    if (this.key_handler == null) return;
    this.frame_tree_actions.erase_active_key_handler(this.key_handler);
  }

  public shift_enter_run_selected_cells(): void {
    this.dbg("shift_enter_run_selected_cells");
  }

  public scroll(pos: string): void {
    this.dbg("scroll", pos);
  }

  private valid_id(id: string): boolean {
    const store = this.jupyter_actions.store;
    if (store.getIn(["cells", id]) === undefined) {
      console.trace();
      console.warn(`NotebookFrameActions.valid_id -- invalid id ${id}`);
      return false;
    }
    return true;
  }

  public set_md_cell_editing(id: string): void {
    this.dbg("set_md_cell_editing", id);
  }

  // Set which cell is currently the cursor.
  public set_cur_id(cur_id: string): void {
    if (!this.valid_id(cur_id)) return;
    const store = this.jupyter_actions.store;
    if (
      store.getIn(["cells", cur_id, "cell_type"]) === "markdown" &&
      this.store.get("mode") === "edit"
    ) {
      if (store.is_cell_editable(cur_id)) {
        this.set_md_cell_editing(cur_id);
      }
    }
    this.setState({ cur_id });
  }
}
