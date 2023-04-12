/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Task Editor Actions
*/

import {
  Actions as CodeEditorActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";

import { TaskActions } from "@cocalc/frontend/editors/task-editor/actions";
import { TaskStore } from "@cocalc/frontend/editors/task-editor/store";
import { redux_name } from "../../app-framework";
import { aux_file } from "@cocalc/util/misc";
import { Map } from "immutable";

interface TaskEditorState extends CodeEditorState {
  // nothing yet
}

export class Actions extends CodeEditorActions<TaskEditorState> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["task_id"];
  protected string_cols: string[] = ["desc"];
  taskActions: { [frameId: string]: TaskActions } = {};
  taskStore: TaskStore;
  auxPath: string;

  _init2(): void {
    this.auxPath = aux_file(this.path, "tasks");
    this.taskStore = this.redux.createStore(
      redux_name(this.project_id, this.auxPath),
      TaskStore
    );
    const syncdb = this._syncstring;
    syncdb.on("change", this.syncdbChange);
    syncdb.once("change", this.ensurePositionsAreUnique);
    syncdb.once("ready", this.syncdbMetadata);
    syncdb.on("metadata-change", this.syncdbMetadata);
  }

  private syncdbChange(changes) {
    const syncdb = this._syncstring;
    const store = this.taskStore;
    if (syncdb == null || store == null) {
      // may happen during close
      return;
    }
    let tasks = store.get("tasks") ?? Map();
    changes.forEach((x) => {
      const task_id = x.get("task_id");
      const t = syncdb.get_one(x);
      if (t == null) {
        // deleted
        tasks = tasks.delete(task_id);
      } else {
        // changed
        tasks = tasks.set(task_id, t as any);
      }
    });

    store.setState({ tasks });
    for (const id in this.taskActions) {
      this.updateVisible(id);
    }
  }

  private updateVisible(id: string) {
    const store = this.taskStore;
    const visible = store.get("tasks")?.keySeq().toList().toJS();
    // todo
    this.set_frame_data({ id, visible });
  }

  private ensurePositionsAreUnique() {
    // TODO
  }

  private syncdbMetadata() {
    const syncdb = this._syncstring;
    const store = this.taskStore;
    if (syncdb == null || store == null) {
      return;
    }
    const read_only = syncdb.is_read_only();
    if (read_only !== store.get("read_only")) {
      this.setState({ read_only });
    }
  }

  getTaskActions(frameId?): TaskActions {
    if (frameId == null) {
      for (const actions of Object.values(this.taskActions)) {
        return actions;
      }
      throw Error("no task frames");
    }
    if (this.taskActions[frameId] != null) {
      return this.taskActions[frameId];
    }
    const auxPath = this.auxPath + frameId;
    const reduxName = redux_name(this.project_id, auxPath);
    const actions = this.redux.createActions(reduxName, TaskActions);
    actions._init(
      this.project_id,
      this.auxPath,
      this._syncstring,
      this.taskStore
    );
    this.taskActions[frameId] = actions;
    return actions;
  }

  undo() {
    this.getTaskActions().undo();
  }
  redo() {
    this.getTaskActions().redo();
  }

  help() {
    this.getTaskActions().help();
  }

  close_frame(frameId: string): void {
    super.close_frame(frameId); // actually closes the frame itself
    // now clean up if it is a task frame:

    if (this.taskActions[frameId] != null) {
      this.closeTaskFrame(frameId);
    }
  }

  closeTaskFrame(frameId: string): void {
    const actions = this.taskActions[frameId];
    if (actions == null) {
      return;
    }
    delete this.taskActions[frameId];
    const name = actions.name;
    this.redux.removeActions(name);
    actions.close();
  }

  close(): void {
    if (this._state == "closed") {
      return;
    }
    for (const frameId in this.taskActions) {
      this.closeTaskFrame(frameId);
    }
    this.redux.removeStore(this.taskStore.name);
    super.close();
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "tasks" };
  }

  async export_to_markdown(): Promise<void> {
    try {
      await this.getTaskActions().export_to_markdown();
    } catch (error) {
      this.set_error(`${error}`);
    }
  }

  public focus(id?: string): void {
    if (id === undefined) {
      id = this._get_active_id();
    }
    if (this._get_frame_type(id) == "tasks") {
      this.getTaskActions(id).show();
      return;
    }
    super.focus(id);
  }
}
