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
import { aux_file, cmp } from "@cocalc/util/misc";
import { Map } from "immutable";
import Embeddings from "./embeddings";

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
  embeddings?: Embeddings;

  _init2(): void {
    this.auxPath = aux_file(this.path, "tasks");
    this.taskStore = this.redux.createStore(
      redux_name(this.project_id, this.auxPath),
      TaskStore
    );
    const syncdb = this._syncstring;
    syncdb.on("change", this.syncdbChange);
    syncdb.once("change", this.ensurePositionsAreUnique);
    this.initEmbeddings(syncdb);
  }

  private initEmbeddings(syncdb) {
    if (!this.redux.getStore("projects").hasOpenAI(this.project_id)) {
      return;
    }
    this.embeddings = new Embeddings({
      project_id: this.project_id,
      path: this.path,
      syncdb,
    });
    syncdb.on("closed", () => {
      this.embeddings?.close();
      delete this.embeddings;
    });
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
      this.taskActions[id]._update_visible();
    }
  }

  private ensurePositionsAreUnique() {
    let tasks = this.taskStore.get("tasks");
    if (tasks == null) {
      return;
    }
    // iterate through tasks adding their (string) positions to a
    // "set" (using a map)
    const s = {};
    let unique = true;
    tasks.forEach((task, id) => {
      if (tasks == null) return; // won't happpen, but TS doesn't know that.
      let pos = task.get("position");
      if (pos == null) {
        // no position set at all -- just arbitrarily set it to 0; it'll get
        // fixed below, if this conflicts.
        pos = 0;
        tasks = tasks.set(id, task.set("position", 0));
      }
      if (s[pos]) {
        // already got this position -- so they can't be unique
        unique = false;
        return false;
      }
      s[pos] = true;
    });
    if (unique) {
      // positions turned out to all be unique - done
      return;
    }
    // positions are NOT unique - this could happen, e.g., due to merging
    // offline changes.  We fix this by simply spreading them all out to be
    // 0 to n, arbitrarily breaking ties.
    const v: [number, string][] = [];
    tasks.forEach((task, id) => {
      v.push([task.get("position") ?? 0, id]);
    });
    v.sort((a, b) => cmp(a[0], b[0]));
    let position = 0;
    const actions = this.getTaskActions();
    if (actions == null) return;
    for (let x of v) {
      actions.set_task(x[1], { position });
      position += 1;
    }
  }

  getTaskActions(frameId?): TaskActions | undefined {
    if (frameId == null) {
      for (const actions of Object.values(this.taskActions)) {
        return actions;
      }
      return undefined;
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
      this.taskStore,
      this.path
    );
    actions._init_frame(frameId, this);
    this.taskActions[frameId] = actions;
    return actions;
  }

  undo() {
    this.getTaskActions()?.undo();
  }
  redo() {
    this.getTaskActions()?.redo();
  }

  help() {
    this.getTaskActions()?.help();
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
      await this.getTaskActions()?.export_to_markdown();
    } catch (error) {
      this.set_error(`${error}`);
    }
  }

  public focus(id?: string): void {
    if (id === undefined) {
      id = this._get_active_id();
    }
    if (this._get_frame_type(id) == "tasks") {
      this.getTaskActions(id)?.show();
      return;
    }
    super.focus(id);
  }

  public blur(id?: string): void {
    if (id === undefined) {
      id = this._get_active_id();
    }
    if (this._get_frame_type(id) == "tasks") {
      this.getTaskActions(id)?.hide();
    }
  }

  protected chatgptGetText(frameId: string, scope): string {
    if (this._get_frame_type(frameId) == "tasks") {
      const node = this._get_frame_node(frameId);
      return (
        this.getTaskActions(frameId)?.chatgptGetText(
          scope,
          node?.get("data-current_task_id")
        ) ?? ""
      );
    }
    return super.chatgptGetText(frameId, scope);
  }

  chatgptGetScopes() {
    return new Set<"cell">(["cell"]);
  }

  chatgptGetLanguage() {
    return "md";
  }

  //   async updateEmbeddings(): Promise<number> {
  //     if (this._syncstring == null) return 0;
  //     return (await this.getTaskActions()?.updateEmbeddings()) ?? 0;
  //   }
}
