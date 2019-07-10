import * as immutable from "immutable";

import { JupyterActions } from "../browser-actions";

import { ImmutableMetadata, Metadata } from "./types";

import { NBGraderStore } from "./store";

export class NBGraderActions {
  private jupyter_actions: JupyterActions;

  constructor(jupyter_actions) {
    this.jupyter_actions = jupyter_actions;
    this.jupyter_actions.store.nbgrader = new NBGraderStore(
      jupyter_actions.store
    );
  }

  public close(): void {
    delete this.jupyter_actions;
  }

  private get_metadata(id: string): ImmutableMetadata {
    return this.jupyter_actions.store.getIn(
      ["cells", id, "metadata", "nbgrader"],
      immutable.Map()
    );
  }

  public set_metadata(
    id: string,
    metadata: Metadata | undefined = undefined,
    save: boolean = true
  ): void {
    let nbgrader: Metadata | undefined = undefined;
    if (metadata != null) {
      nbgrader = this.get_metadata(id).toJS();
      if (nbgrader == null) throw Error("must not be null");
      nbgrader.schema_version = 1; // always
      for (let k in metadata) {
        nbgrader[k] = metadata[k];
      }
    }
    this.jupyter_actions.set_cell_metadata({
      id,
      metadata: { nbgrader },
      merge: true,
      save
    });
  }

  public async validate(): Promise<void> {
    // Without confirmation: (1) restart, (2) run all -- without stopping for errors.
    // Validate button should be disabled while this happens.
    // As running happens number of failing tests and total score
    // gets updated at top.
    console.log("validate");
    await this.jupyter_actions.restart();
    this.jupyter_actions.run_all_cells(true);
  }
}
