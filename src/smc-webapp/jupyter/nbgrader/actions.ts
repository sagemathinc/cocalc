import * as immutable from "immutable";
import { JupyterActions } from "../browser-actions";
import { ImmutableMetadata, Metadata } from "./types";
import { NBGraderStore } from "./store";
import { clear_solution } from "./clear-solutions";
import { set_checksum } from "./compute-checksums";

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
    await this.jupyter_actions.restart();
    this.jupyter_actions.run_all_cells(true);
  }

  public async confirm_validate(): Promise<void> {
    const choice = await this.jupyter_actions.confirm_dialog({
      title: "Validate notebook?",
      body:
        "Validating the notebook will restart the kernel and run all cells in order, even those with errors.  This will ensure that all output is exactly what results from running all cells in order.",
      choices: [
        { title: "Cancel" },
        { title: "Validate", style: "danger", default: true }
      ]
    });
    if (choice === "Validate") {
      await this.jupyter_actions.restart();
    }
    await this.validate();
  }

  public assign(filename: string): void {
    // Create a copy of the current notebook at the location specified by
    // filename, and modify by applying the assign transformations.
    console.log("assign -- TODO", filename);
    this.apply_assign_transformations();
  }

  private apply_assign_transformations(): void {
    /* see https://nbgrader.readthedocs.io/en/stable/command_line_tools/nbgrader-assign.html
    Of which, we do:

        2. It locks certain cells so that they cannot be deleted by students
           accidentally (or on purpose!)

        3. It removes solutions from the notebooks and replaces them with
           code or text stubs saying (for example) "YOUR ANSWER HERE".

        4. It clears all outputs from the cells of the notebooks.

        5. It saves information about the cell contents so that we can warn
           students if they have changed the tests, or if they have failed
           to provide a response to a written answer. Specifically, this is
           done by computing a checksum of the cell contents and saving it
           into the cell metadata.
    */
    this.assign_clear_solutions(); // step 3
    this.jupyter_actions.clear_all_outputs(false); // step 4
    this.assign_save_checksums(); // step 5
    this.assign_lock_readonly_cells(); // step 2 -- needs to be last, since it stops cells from being editable!
    this.jupyter_actions.save_asap();
  }

  private assign_clear_solutions(): void {
    console.log("assign_clear_solutions");
    const kernel_language: string = this.jupyter_actions.store.get_kernel_language();
    this.jupyter_actions.store.get("cells").forEach(cell => {
      if (!cell.getIn(["metadata", "nbgrader", "solution"])) return;
      const cell2 = clear_solution(cell, kernel_language);
      if (cell !== cell2) {
        // set the input
        this.jupyter_actions.set_cell_input(
          cell.get("id"),
          cell2.get("input"),
          false
        );
      }
    });
  }

  private assign_save_checksums(): void {
    console.log("assign_save_checksums");
    this.jupyter_actions.store.get("cells").forEach(cell => {
      if (!cell.getIn(["metadata", "nbgrader", "solution"])) return;
      const cell2 = set_checksum(cell);
      if (cell !== cell2) {
        // set nbgrader metadata, which is all that should have changed
        this.jupyter_actions.set_cell_metadata({
          id: cell.get("id"),
          metadata: { nbgrader: cell2.get("nbgrader") },
          merge: true,
          save: false
        });
      }
    });
  }

  private assign_lock_readonly_cells(): void {
    // For every cell for which the nbgrader metadata says it should be locked, set
    // the editable and deletable metadata to false.
    // "metadata":{"nbgrader":{"locked":true,...
    console.log("assign_lock_readonly_cells");
    this.jupyter_actions.store.get("cells").forEach(cell => {
      if (cell == null || !cell.getIn(["metadata", "nbgrader", "locked"]))
        return;
      for (let key of ["editable", "deletable"]) {
        this.jupyter_actions.set_cell_metadata({
          id: cell.get("id"),
          metadata: { [key]: false },
          merge: true,
          save: false
        });
      }
    });
  }
}
