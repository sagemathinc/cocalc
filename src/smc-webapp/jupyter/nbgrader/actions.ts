import * as immutable from "immutable";

import { JupyterActions } from "../browser-actions";

/* "nbgrader": {
     "grade": false,
     "grade_id": "cell-4c4eddcf91556a9e",
     "locked": true,
     "schema_version": 1,
     "solution": false
    }
*/

export interface Metadata {
  grade?: boolean;
  grade_id?: string;
  locked?: boolean;
  schema_version?: number;
  solution?: boolean;
}

export type ImmutableMetadata = immutable.Map<string, any>;

export class NBGraderActions {
  private jupyter_actions: JupyterActions;

  constructor(jupyter_actions) {
    this.jupyter_actions = jupyter_actions;
  }

  public close(): void {
    delete this.jupyter_actions;
    console.log("TODO -- close NBGraderActions");
  }

  private get_metadata(id: string): ImmutableMetadata {
    return this.jupyter_actions.store.getIn(
      ["cells", id, "metadata", "nbconvert"],
      immutable.Map()
    );
  }

  public set_metadata(
    id: string,
    metadata: Metadata,
    save: boolean = true
  ): void {
    const nbgrader: Metadata = this.get_metadata(id).toJS();
    for (let k in metadata) {
      nbgrader[k] = metadata[k];
    }
    this.jupyter_actions.set_cell_metadata({
      id,
      metadata: { nbgrader },
      merge: true,
      save
    });
  }

  public toolbar_create_assignment(id: string, value: string): void {
    console.log("create_assignment_toolbar", id, value);
  }
}
