/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as immutable from "immutable";
import { JupyterActions } from "../browser-actions";
import { ImmutableMetadata, Metadata } from "./types";
import { NBGraderStore } from "./store";
import { clear_solution } from "./clear-solutions";
import { clear_hidden_tests } from "./clear-hidden-tests";
import { clear_mark_regions } from "./clear-mark-regions";
import { set_checksum } from "./compute-checksums";
import { delay } from "awaiting";
import { path_split } from "smc-util/misc2";
import { STUDENT_SUBDIR } from "../../course/assignments/actions";

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

  // Ensure all nbgrader metadata is updated to the latest version we support.
  // The update is done as a single commit to the syncdb.
  public update_metadata(): void {
    const cells = this.jupyter_actions.store.get("cells");
    let changed: boolean = false; // did something change.
    cells.forEach((cell, id: string): void => {
      if (cell == null) return;
      const nbgrader = cell.getIn(["metadata", "nbgrader"]);
      if (nbgrader == null || nbgrader.get("schema_version") === 3) return;
      // Doing this set
      // make the actual change via the syncdb mechanism (NOT updating cells directly; instead
      // that is a side effect that happens at some point later).
      this.set_metadata(id, {}, false);
      changed = true;
    });
    if (changed) {
      this.jupyter_actions._sync();
    }
  }

  private get_metadata(id: string): ImmutableMetadata {
    return this.jupyter_actions.store.getIn(
      ["cells", id, "metadata", "nbgrader"],
      immutable.Map()
    );
  }

  // Sets the metadata and also ensures the schema is properly updated.
  public set_metadata(
    id: string,
    metadata: Metadata | undefined = undefined, // if undefined, deletes the nbgrader metadata entirely
    save: boolean = true
  ): void {
    let nbgrader: Metadata | undefined = undefined;
    if (metadata != null) {
      nbgrader = this.get_metadata(id).toJS();
      if (nbgrader == null) throw Error("must not be null");

      // Merge in the requested changes.
      for (const k in metadata) {
        nbgrader[k] = metadata[k];
      }

      // Update the schema, if necessary:
      if (nbgrader.schema_version == null || nbgrader.schema_version < 3) {
        // The docs of the schema history are at
        //   https://nbgrader.readthedocs.io/en/stable/contributor_guide/metadata.html
        // They were not updated even after schema 3 came out, so I'm just guessing
        // based on reading source code and actual ipynb files.
        nbgrader.schema_version = 3;
        // nbgrader schema_version=3 requires that all these are set:

        // We only set "remove" if it is true. This violates the nbgrader schema, so *should*
        // break processing the ipynb file in nbgrader, which is *good* since instructors
        // won't silently push out content to students that students are not supposed to see.
        // We do NOT put nbgrader['remove']=false in explicitly, since no point in
        // breaking compatibility with official nbgrader if this cell type isn't being used.
        if (!nbgrader["remove"]) {
          delete nbgrader["remove"];
        }

        for (const k of ["grade", "locked", "solution", "task"]) {
          if (nbgrader[k] == null) {
            nbgrader[k] = false;
          }
        }
      }
    }
    this.jupyter_actions.set_cell_metadata({
      id,
      metadata: { nbgrader },
      merge: true,
      save,
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
        { title: "Validate", style: "danger", default: true },
      ],
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
      head = `${STUDENT_SUBDIR}/`;
    } else {
      head = `${head}/${STUDENT_SUBDIR}/`;
    }
    const target = head + tail;
    const choice = await this.jupyter_actions.confirm_dialog({
      title: "Generate Student Version of Notebook",
      body: `Generating the student version of the notebook will create a new Jupyter notebook "${target}" that is ready to distribute to your students.  This process locks cells and writes metadata so parts of the notebook can't be accidentally edited or deleted; it removes solutions, and replaces them with code or text stubs saying (for example) "YOUR ANSWER HERE"; and it clears all outputs. Once done, you can easily inspect the resulting notebook to make sure everything looks right.   (This is analogous to 'nbgrader assign'.)  The CoCalc course management system will *only* copy the ${STUDENT_SUBDIR} subdirectory that contains this generated notebook to students.`,
      choices: [
        { title: "Cancel" },
        {
          title: "Create or update student version",
          style: "success",
          default: true,
        },
      ],
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
    while (actions == null) {
      await delay(200);
      actions = this.redux.getEditorActions(project_id, filename);
    }
    await actions.jupyter_actions.wait_until_ready();
    actions.jupyter_actions.syncdb.from_str(
      this.jupyter_actions.syncdb.to_str()
    );
    // Important: we also have to fire a changes event with all
    // records, since otherwise the Jupyter store doesn't get
    // updated since we're using from_str.
    // The complicated map/filter thing below is just to grab
    // only the {type:?,id:?} parts of all the records.
    actions.jupyter_actions.syncdb.emit("change", "all");
    await actions.jupyter_actions.save();
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
    //const log = (...args) => console.log("assign:", ...args);
    // log("unlock everything");
    this.assign_unlock_all_cells();
    // log("clear solutions");
    this.assign_clear_solutions(); // step 3a
    // log("clear hidden tests");
    this.assign_clear_hidden_tests(); // step 3b
    // log("clear mark regions");
    this.assign_clear_mark_regions(); // step 3c
    // this is a nonstandard extension to nbgrader in cocalc only.
    this.assign_delete_remove_cells();
    // log("clear all outputs");
    this.jupyter_actions.clear_all_outputs(false); // step 4
    // log("assign save checksums");
    this.assign_save_checksums(); // step 5
    // log("lock readonly cells");
    this.assign_lock_readonly_cells(); // step 2 -- needs to be last, since it stops cells from being editable!
    this.jupyter_actions.save_asap();
  }

  private assign_clear_solutions(): void {
    const kernel_language: string = this.jupyter_actions.store.get_kernel_language();
    this.jupyter_actions.store.get("cells").forEach((cell) => {
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
    this.jupyter_actions.store.get("cells").forEach((cell) => {
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

  private assign_clear_mark_regions(): void {
    this.jupyter_actions.store.get("cells").forEach((cell) => {
      if (!cell.getIn(["metadata", "nbgrader", "grade"])) {
        // We clear mark regions for any cell that is graded.
        // In the official nbgrader docs, it seems that mark
        // regions are only for **task** cells.  However,
        // I've seen nbgrader use "in nature" that uses
        // the mark regions in other grading cells, and also
        // it just makes sense to be able to easily record
        // how you will grade things even for non-task cells!
        return;
      }
      const cell2 = clear_mark_regions(cell);
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

  private assign_delete_remove_cells(): void {
    const cells: string[] = [];
    this.jupyter_actions.store.get("cells").forEach((cell) => {
      if (!cell.getIn(["metadata", "nbgrader", "remove"])) {
        // we delete cells that have remote true and this one doesn't.
        return;
      }
      // delete the cell
      cells.push(cell.get("id"));
    });
    if (cells.length == 0) return;
    this.jupyter_actions.delete_cells(cells, false);
  }

  private assign_save_checksums(): void {
    this.jupyter_actions.store.get("cells").forEach((cell) => {
      if (!cell.getIn(["metadata", "nbgrader", "solution"])) return;
      const cell2 = set_checksum(cell);
      if (cell !== cell2) {
        // set nbgrader metadata, which is all that should have changed
        this.jupyter_actions.set_cell_metadata({
          id: cell.get("id"),
          metadata: { nbgrader: cell2.get("nbgrader") },
          merge: true,
          save: false,
        });
      }
    });
  }

  private assign_unlock_all_cells(): void {
    this.jupyter_actions.store.get("cells").forEach((cell) => {
      if (cell == null || !cell.getIn(["metadata", "nbgrader", "locked"]))
        return;
      for (const key of ["editable", "deletable"]) {
        this.jupyter_actions.set_cell_metadata({
          id: cell.get("id"),
          metadata: { [key]: true },
          merge: true,
          save: false,
        });
      }
    });
  }

  private assign_lock_readonly_cells(): void {
    // For every cell for which the nbgrader metadata says it should be locked, set
    // the editable and deletable metadata to false.
    // "metadata":{"nbgrader":{"locked":true,...
    //console.log("assign_lock_readonly_cells");
    this.jupyter_actions.store.get("cells").forEach((cell) => {
      if (cell == null || !cell.getIn(["metadata", "nbgrader", "locked"]))
        return;
      for (const key of ["editable", "deletable"]) {
        this.jupyter_actions.set_cell_metadata({
          id: cell.get("id"),
          metadata: { [key]: false },
          merge: true,
          save: false,
        });
      }
    });
  }
}
