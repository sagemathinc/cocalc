import { JupyterActions } from "../browser-actions";

export class NBGraderActions {
  private jupyter_actions: JupyterActions;

  constructor(jupyter_actions) {
    this.jupyter_actions = jupyter_actions;
  }

  public close(): void {
    delete this.jupyter_actions;
    console.log("TODO -- close NBGraderActions");
  }

  public create_assignment_toolbar(id: string, value: string): void {
    console.log("create_assignment_toolbar", id, value);
  }
}
