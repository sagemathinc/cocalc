import * as immutable from "immutable";
import { JupyterActions } from "../browser-actions";
import { ImmutableMetadata, Metadata } from "./types";
import { NBGraderStore } from "./store";
import { clear_solution } from "./clear-solutions";
import { clear_hidden_tests } from "./clear-hidden-tests";
import { set_checksum } from "./compute-checksums";
import { delay } from "awaiting";
import { once } from "smc-util/async-utils";
import { path_split } from "smc-util/misc2";

export class NBGraderActions {
  private jupyter_actions: JupyterActions;
  private redux;

  constructor(jupyter_actions, redux) {
    this.jupyter_actions = jupyter_actions;
    this.redux = redux;
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

  public async confirm_assign(): Promise<void> {
    const path = this.jupyter_actions.store.get("path");
    let { head, tail } = path_split(path);
    if (head == "") {
      head = "student/";
    } else {
      head = head + "/student/";
    }
    const target = head + tail;
    const choice = await this.jupyter_actions.confirm_dialog({
      title: "Create student version?",
      body: `Creating the student version of the notebook will make a new Jupyter notebook "${target}" that is ready to distribute to your students.  This process locks cells and writes metadata so parts of the notebook can't be accidentally edited or deleted; it removes solutions, and replaces them with code or text stubs saying (for example) "YOUR ANSWER HERE"; and it clears all outputs. Once done, you can easily inspect the resulting notebook to make sure everything looks right.   (This is analogous to 'nbgrader assign'.)`,
      choices: [
        { title: "Cancel" },
        {
          title: "Create or update student version",
          style: "success",
          default: true
        }
      ]
    });
    if (choice === "Cancel") return;
    await this.assign(target);
  }

  public async assign(filename: string): Promise<void> {
    // Create a copy of the current notebook at the location specified by
    // filename, and modify by applying the assign transformations.
    const project_id = this.jupyter_actions.store.get("project_id");
    const project_actions = this.redux.getProjectActions(project_id);
    await project_actions.open_file({ path: filename, foreground: true });
    let actions = this.redux.getEditorActions(project_id, filename);
    while (true) {
      if (actions != null) break;
      await delay(200);
    }
    if (actions.jupyter_actions.syncdb.get_state() == "init") {
      await once(actions.jupyter_actions.syncdb, "ready");
    }
    actions.jupyter_actions.syncdb.from_str(
      this.jupyter_actions.syncdb.to_str()
    );
    project_actions.close_file(filename);
    await delay(200);
    await project_actions.open_file({ path: filename, foreground: true });
    while (true) {
      actions = this.redux.getEditorActions(project_id, filename);
      if (actions != null) break;
      await delay(200);
    }
    if (actions.jupyter_actions.syncdb.get_state() == "init") {
      await once(actions.jupyter_actions.syncdb, "ready");
    }
    await actions.jupyter_actions.nbgrader_actions.apply_assign_transformations();
    await actions.jupyter_actions.save();
  }

  public apply_assign_transformations(): void {
    /* see https://nbgrader.readthedocs.io/en/stable/command_line_tools/nbgrader-assign.html
    Of which, we do:

        2. It locks certain cells so that they cannot be deleted by students
           accidentally (or on purpose!)

        3. It removes solutions from the notebooks and replaces them with
           code or text stubs saying (for example) "YOUR ANSWER HERE", and
           similarly for hidden tests.

        4. It clears all outputs from the cells of the notebooks.

        5. It saves information about the cell contents so that we can warn
           students if they have changed the tests, or if they have failed
           to provide a response to a written answer. Specifically, this is
           done by computing a checksum of the cell contents and saving it
           into the cell metadata.
    */
    this.assign_clear_solutions(); // step 3a
    this.assign_clear_hidden_tests(); // step 3b
    this.jupyter_actions.clear_all_outputs(false); // step 4
    this.assign_save_checksums(); // step 5
    this.assign_lock_readonly_cells(); // step 2 -- needs to be last, since it stops cells from being editable!
    this.jupyter_actions.save_asap();
  }

  private assign_clear_solutions(): void {
    //console.log("assign_clear_solutions");
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

  private assign_clear_hidden_tests(): void {
    //console.log("assign_clear_solutions");
    this.jupyter_actions.store.get("cells").forEach(cell => {
      // only care about test cells, which have: grade=true and solution=false.
      if (!cell.getIn(["metadata", "nbgrader", "grade"])) return;
      if (cell.getIn(["metadata", "nbgrader", "solution"])) return;
      const cell2 = clear_hidden_tests(cell);
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
    //console.log("assign_save_checksums");
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
    //console.log("assign_lock_readonly_cells");
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
