import { JupyterStore } from "../store";

export class NBGraderStore {
  private store: JupyterStore;
  constructor(store: JupyterStore) {
    this.store = store;
  }

  public autograder_tests_info(): { count: number } {
    console.log(this.store);
    return { count: 1 };
  }
}
