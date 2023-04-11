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

interface TaskEditorState extends CodeEditorState {
  // nothing yet
}

export class Actions extends CodeEditorActions<TaskEditorState> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["task_id"];
  protected string_cols: string[] = ["desc"];
  taskActions: TaskActions;
  tasksAuxPath: string;
  tasksReduxName: string;

  _init2(): void {
    this.tasksAuxPath = aux_file(this.path, "tasks");
    this.tasksReduxName = redux_name(this.project_id, this.tasksAuxPath);
    const name = this.tasksReduxName;
    const actions = this.redux.createActions(name, TaskActions);
    const store = this.redux.createStore(name, TaskStore);

    actions._init(this.project_id, this.tasksAuxPath, this._syncstring, store);
    this.taskActions = actions;

    for (const name of ["undo", "redo", "help"]) {
      this[name] = actions[name].bind(name);
    }
  }

  close(): void {
    const name = this.tasksReduxName;
    const actions = this.redux.getActions(name);
    if (actions != null) {
      (actions as TaskActions).close();
    }
    this.redux.removeActions(name);
    this.redux.removeStore(name);
    super.close();
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "tasks" };
  }

  async export_to_markdown(): Promise<void> {
    try {
      await this.taskActions.export_to_markdown();
    } catch (error) {
      this.set_error(`${error}`);
    }
  }
}
