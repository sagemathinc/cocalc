/*
Course Frame Editor Actions
*/

import { FrameTree } from "../frame-tree/types";
import { Actions, CodeEditorState } from "../code-editor/actions";

interface CourseEditorState extends CodeEditorState {}

import {
  CourseActions,
  init_course_actions_and_store,
  close_course_actions_and_store,
} from "./course-actions";

export class CourseEditorActions extends Actions<CourseEditorState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  public course_actions: CourseActions;

  _raw_default_frame_tree(): FrameTree {
    return { type: "course_students" };
  }

  _init2(): void {
    this.init_course_actions_and_store();
    this.init_changes_state();
  }

  public close(): void {
    this.close_course_actions_and_store();
    super.close();
  }

  // We manually handle the "unsaved changes" state, since we're using
  // our own separate syncdb file.  The same thing is done for the
  // Jupyter frame editor.
  private init_changes_state(): void {
    const syncdb = this.course_actions.syncdb;
    syncdb.on("has-uncommitted-changes", (has_uncommitted_changes) =>
      this.setState({ has_uncommitted_changes })
    );
    syncdb.on("has-unsaved-changes", (has_unsaved_changes) => {
      this.setState({ has_unsaved_changes });
    });
  }

  private init_course_actions_and_store(): void {
    // We use a different name for the redux store managed by the course actions,
    // since otherwise it would conflict with the frame tree's own store.
    this.course_actions = init_course_actions_and_store({
      redux: this.redux,
      path: this.path,
      project_id: this.project_id,
    });
  }

  private close_course_actions_and_store(): void {
    close_course_actions_and_store({
      redux: this.redux,
      path: this.path,
      project_id: this.project_id,
    });
  }

  async save(explicit: boolean = true): Promise<void> {
    explicit = explicit; // not used
    if (
      this.course_actions == null ||
      this.course_actions.syncdb == null ||
      !this.course_actions.syncdb.has_unsaved_changes()
    )
      return;

    // Do the save itself, using try/finally to ensure proper
    // setting of is_saving.
    try {
      this.setState({ is_saving: true });
      await this.course_actions.save();
    } catch (err) {
      console.warn("save_to_disk", this.path, "ERROR", err);
      if (this._state == "closed") return;
      this.set_error(`error saving file to disk -- ${err}`);
    } finally {
      this.setState({ is_saving: false });
    }
  }

  exit_undo_mode(): void {
    this.course_actions.syncdb.exit_undo_mode();
  }

  // per-session sync-aware undo
  undo(_id: string): void {
    this.course_actions.syncdb.undo();
    this.course_actions.syncdb.commit();
  }

  // per-session sync-aware redo
  redo(_id: string): void {
    this.course_actions.syncdb.redo();
    this.course_actions.syncdb.commit();
  }
}
