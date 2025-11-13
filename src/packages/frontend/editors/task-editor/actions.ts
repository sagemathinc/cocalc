/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Task Actions
*/

import { fromJS, Map } from "immutable";
import { throttle } from "lodash";
import {
  close,
  copy_with,
  cmp,
  uuid,
  history_path,
  search_split,
} from "@cocalc/util/misc";
import { update_visible } from "./update-visible";
import { create_key_handler } from "./keyboard";
import { toggle_checkbox } from "./desc-rendering";
import { Actions } from "../../app-framework";
import {
  Align,
  HashtagState,
  Headings,
  HeadingsDir,
  LocalViewStateMap,
  SelectedHashtags,
  Sort,
  Task,
  TaskMap,
  TaskState,
} from "./types";
import { SyncDB } from "@cocalc/sync/editor/db";
import { webapp_client } from "../../webapp-client";
import type {
  Actions as TaskFrameActions,
  Store as TaskStore,
} from "@cocalc/frontend/frame-editors/task-editor/actions";
import Fragment from "@cocalc/frontend/misc/fragment-id";

const LAST_EDITED_THRESH_S = 30;
const TASKS_HELP_URL = "https://doc.cocalc.com/tasks.html";

export class TaskActions extends Actions<TaskState> {
  public syncdb: SyncDB;
  private project_id: string;
  private path: string;
  private truePath: string;
  public store: TaskStore;
  _update_visible: Function;
  private is_closed: boolean = false;
  private key_handler?: (any) => void;
  private set_save_status?: () => void;
  private frameId: string;
  private frameActions: TaskFrameActions;
  private virtuosoRef?;

  public _init(
    project_id: string,
    path: string,
    syncdb: SyncDB,
    store: TaskStore,
    truePath: string, // because above path is auxpath for each frame.
  ): void {
    this._update_visible = throttle(this.__update_visible, 500);
    this.project_id = project_id;
    this.path = path;
    this.truePath = truePath;
    this.syncdb = syncdb;
    this.store = store;
  }

  public _init_frame(frameId: string, frameActions) {
    this.frameId = frameId;
    this.frameActions = frameActions;
    // Ensure that the list of visible tasks is updated soon.
    // Can't do without waiting a moment, do this being called
    // during a react render loop and also triggering one.
    // This is triggered if you close all of the frames and
    // then the default frame tree comes back, and it would
    // otherwise just sit there waiting on a syncdoc change.
    setTimeout(() => {
      if (this.is_closed) return;
      this._update_visible();
    }, 1);
  }

  public setFrameData(obj): void {
    this.frameActions.set_frame_data({ ...obj, id: this.frameId });
  }

  public getFrameData(key: string) {
    return this.frameActions._get_frame_data(this.frameId, key);
  }

  public close(): void {
    if (this.is_closed) {
      return;
    }
    this.is_closed = true;
    if (this.key_handler != null) {
      this.frameActions.erase_active_key_handler(this.key_handler);
    }
    close(this);
    this.is_closed = true;
  }

  public enable_key_handler(): void {
    if (this.is_closed) {
      return;
    }
    if (this.key_handler == null) {
      this.key_handler = create_key_handler(this);
    }
    this.frameActions.set_active_key_handler(this.key_handler);
  }

  public disable_key_handler(): void {
    if (this.key_handler == null || this.redux == null) {
      return;
    }
    this.frameActions.erase_active_key_handler(this.key_handler);
    delete this.key_handler;
  }

  private __update_visible(): void {
    if (this.store == null) return;
    const tasks = this.store.get("tasks");
    if (tasks == null) return;
    const view: LocalViewStateMap =
      this.getFrameData("local_view_state") ?? fromJS({});
    const local_task_state =
      this.getFrameData("local_task_state") ?? fromJS({});
    const current_task_id = this.getFrameData("current_task_id");
    const counts = this.getFrameData("counts") ?? fromJS({});

    let obj: any = update_visible(
      tasks,
      local_task_state,
      view,
      counts,
      current_task_id,
    );

    if (obj.visible.size == 0 && view.get("search")?.trim().length == 0) {
      // Deal with a weird edge case: https://github.com/sagemathinc/cocalc/issues/4763
      // If nothing is visible and the search is blank, clear any selected hashtags.
      this.clear_all_hashtags();
      obj = update_visible(
        tasks,
        local_task_state,
        view,
        counts,
        current_task_id,
      );
    }

    // We make obj explicit to avoid giving update_visible power to
    // change anything about state...
    // This is just "explicit is better than implicit".
    obj = copy_with(obj, [
      "visible",
      "current_task_id",
      "counts",
      "hashtags",
      "search_desc",
      "search_terms",
    ]);
    this.setFrameData(obj);
    if (obj.redoSoonMs > 0) {
      // do it again a few times, so the recently marked done task disappears.
      setTimeout(() => this.__update_visible(), obj.redoSoonMs);
    }
  }

  public set_local_task_state(task_id: string | undefined, obj: object): void {
    if (this.is_closed) {
      return;
    }
    if (task_id == null) {
      task_id = this.getFrameData("current_task_id");
    }
    if (task_id == null) {
      return;
    }
    // Set local state related to a specific task -- this is NOT sync'd between clients
    const local = this.getFrameData("local_task_state") ?? fromJS({});
    obj["task_id"] = task_id;
    let x = local.get(obj["task_id"]);
    if (x == null) {
      x = fromJS(obj);
    } else {
      for (let k in obj) {
        const v = obj[k];
        x = x.set(k, fromJS(v));
      }
    }
    this.setFrameData({
      local_task_state: local.set(obj["task_id"], x),
    });
  }

  public set_local_view_state(obj, update_visible = true): void {
    if (this.is_closed) {
      return;
    }
    // Set local state related to what we see/search for/etc.
    let local: LocalViewStateMap =
      this.getFrameData("local_view_state") ?? fromJS({});
    for (let key in obj) {
      const value = obj[key];
      if (
        key == "show_deleted" ||
        key == "show_done" ||
        key == "show_max" ||
        key == "font_size" ||
        key == "sort" ||
        key == "selected_hashtags" ||
        key == "search" ||
        key == "scrollState"
      ) {
        local = local.set(key as any, fromJS(value));
      } else {
        throw Error(`bug setting local_view_state -- invalid field "${key}"`);
      }
    }
    this.setFrameData({
      local_view_state: local,
    });
    if (update_visible) {
      this._update_visible();
    }
  }

  clearAllFilters = (obj?) => {
    this.set_local_view_state(
      {
        show_deleted: false,
        show_done: false,
        show_max: false,
        selected_hashtags: {},
        search: "",
        ...obj,
      },
      false,
    );
    this.__update_visible();
  };

  public async save(): Promise<void> {
    if (this.is_closed) {
      return;
    }
    try {
      await this.syncdb.save_to_disk();
    } catch (err) {
      if (this.is_closed) {
        // expected to fail when closing
        return;
      }
      // somehow report that save to disk failed.
      console.warn("Tasks save to disk failed ", err);
    }
    this.set_save_status?.();
  }

  public new_task(): void {
    // create new task positioned before the current task
    const cur_pos = this.store.getIn([
      "tasks",
      this.getFrameData("current_task_id") ?? "",
      "position",
    ]);

    const positions = getPositions(this.store.get("tasks"));
    let position: number | undefined = undefined;
    if (cur_pos != null && positions.length > 0) {
      for (
        let i = 1, end = positions.length, asc = 1 <= end;
        asc ? i < end : i > end;
        asc ? i++ : i--
      ) {
        if (cur_pos === positions[i]) {
          position = (positions[i - 1] + positions[i]) / 2;
          break;
        }
      }
      if (position == null) {
        position = positions[0] - 1;
      }
    } else {
      // There is no current visible task, so just put new task at the very beginning.
      if (positions.length > 0) {
        position = positions[0] - 1;
      } else {
        position = 0;
      }
    }

    // Default new task is search description, but
    // do not include any negations.  This is handy and also otherwise
    // you wouldn't see the new task!
    const search = this.getFrameData("search_desc");
    const desc = search_split(search)
      .filter((x) => x[0] !== "-")
      .join(" ");

    const task_id = uuid();
    this.set_task(task_id, { desc, position });
    this.set_current_task(task_id);
    this.edit_desc(task_id);
  }

  public set_task(
    task_id?: string,
    obj?: object,
    setState: boolean = false,
    save: boolean = true, // make new commit to syncdb state
  ): void {
    if (obj == null || this.is_closed) {
      return;
    }
    if (task_id == null) {
      task_id = this.getFrameData("current_task_id");
    }
    if (task_id == null) {
      return;
    }
    let task = this.store.getIn(["tasks", task_id]) as any;
    // Update last_edited if desc or due date changes
    if (
      task == null ||
      (obj["desc"] != null && obj["desc"] !== task.get("desc")) ||
      (obj["due_date"] != null && obj["due_date"] !== task.get("due_date")) ||
      (obj["done"] != null && obj["done"] !== task.get("done"))
    ) {
      const last_edited =
        this.store.getIn(["tasks", task_id, "last_edited"]) ?? 0;
      const now = Date.now();
      if (now - last_edited >= LAST_EDITED_THRESH_S * 1000) {
        obj["last_edited"] = now;
      }
    }

    obj["task_id"] = task_id;
    this.syncdb.set(obj);
    if (save) {
      this.commit();
    }
    if (setState) {
      // also set state directly in the tasks object locally
      // **immediately**; this would happen
      // eventually as a result of the syncdb set above.
      let tasks = this.store.get("tasks") ?? fromJS({});
      task = tasks.get(task_id) ?? (fromJS({ task_id }) as any);
      if (task == null) throw Error("bug");
      for (let k in obj) {
        const v = obj[k];
        if (
          k == "desc" ||
          k == "done" ||
          k == "deleted" ||
          k == "task_id" ||
          k == "position" ||
          k == "due_date" ||
          k == "last_edited"
        ) {
          task = task.set(k as keyof Task, fromJS(v));
        } else {
          throw Error(`bug setting task -- invalid field "${k}"`);
        }
      }
      tasks = tasks.set(task_id, task);
      this.setState({ tasks });
    }
  }

  public delete_task(task_id: string): void {
    this.set_task(task_id, { deleted: true });
  }

  public undelete_task(task_id: string): void {
    this.set_task(task_id, { deleted: false });
  }

  public delete_current_task(): void {
    const task_id = this.getFrameData("current_task_id");
    if (task_id == null) return;
    this.delete_task(task_id);
  }

  public undelete_current_task(): void {
    const task_id = this.getFrameData("current_task_id");
    if (task_id == null) return;
    this.undelete_task(task_id);
  }

  // only delta = 1 or -1 is supported!
  public move_task_delta(delta: -1 | 1): void {
    if (delta !== 1 && delta !== -1) {
      return;
    }
    const task_id = this.getFrameData("current_task_id");
    if (task_id == null) {
      return;
    }
    const visible = this.getFrameData("visible");
    if (visible == null) {
      return;
    }
    const i = visible.indexOf(task_id);
    if (i === -1) {
      return;
    }
    const j = i + delta;
    if (j < 0 || j >= visible.size) {
      return;
    }
    // swap positions for i and j
    const tasks = this.store.get("tasks");
    if (tasks == null) return;
    const pos_i = tasks.getIn([task_id, "position"]);
    const pos_j = tasks.getIn([visible.get(j), "position"]);
    this.set_task(task_id, { position: pos_j }, true);
    this.set_task(visible.get(j), { position: pos_i }, true);
    this.scrollIntoView();
  }

  public time_travel(): void {
    this.redux.getProjectActions(this.project_id).open_file({
      path: history_path(this.path),
      foreground: true,
    });
  }

  public help(): void {
    window.open(TASKS_HELP_URL, "_blank")?.focus();
  }

  set_current_task = (task_id: string): void => {
    if (this.getFrameData("current_task_id") == task_id) {
      return;
    }
    this.setFrameData({ current_task_id: task_id });
    this.scrollIntoView();
    this.setFragment(task_id);
  };

  public set_current_task_delta(delta: number): void {
    const task_id = this.getFrameData("current_task_id");
    if (task_id == null) {
      return;
    }
    const visible = this.getFrameData("visible");
    if (visible == null) {
      return;
    }
    let i = visible.indexOf(task_id);
    if (i === -1) {
      return;
    }
    i += delta;
    if (i < 0) {
      i = 0;
    } else if (i >= visible.size) {
      i = visible.size - 1;
    }
    const new_task_id = visible.get(i);
    if (new_task_id != null) {
      this.set_current_task(new_task_id);
    }
  }

  public undo(): void {
    if (this.syncdb == null) {
      return;
    }
    this.syncdb.undo();
    this.commit();
  }

  public redo(): void {
    if (this.syncdb == null) {
      return;
    }
    this.syncdb.redo();
    this.commit();
  }

  public commit(): void {
    this.syncdb.commit();
  }

  public set_task_not_done(task_id: string | undefined): void {
    if (task_id == null) {
      task_id = this.getFrameData("current_task_id");
    }
    this.set_task(task_id, { done: false });
  }

  public set_task_done(task_id: string | undefined): void {
    if (task_id == null) {
      task_id = this.getFrameData("current_task_id");
    }
    this.set_task(task_id, { done: true });
  }

  public toggle_task_done(task_id: string | undefined): void {
    if (task_id == null) {
      task_id = this.getFrameData("current_task_id");
    }
    if (task_id != null) {
      this.set_task(
        task_id,
        { done: !this.store.getIn(["tasks", task_id, "done"]) },
        true,
      );
    }
  }

  public stop_editing_due_date(task_id: string | undefined): void {
    this.set_local_task_state(task_id, { editing_due_date: false });
  }

  public edit_due_date(task_id: string | undefined): void {
    this.set_local_task_state(task_id, { editing_due_date: true });
  }

  public stop_editing_desc(task_id: string | undefined): void {
    this.set_local_task_state(task_id, { editing_desc: false });
  }

  isEditing = () => {
    const task_id = this.getFrameData("current_task_id");
    return !!this.getFrameData("local_task_state")?.getIn([
      task_id,
      "editing_desc",
    ]);
  };

  // null=unselect all.
  public edit_desc(task_id: string | undefined | null): void {
    // close any that were currently in edit state before opening new one
    const local = this.getFrameData("local_task_state") ?? fromJS({});
    for (const [id, state] of local) {
      if (state.get("editing_desc")) {
        this.stop_editing_desc(id);
      }
    }
    if (task_id !== null) {
      this.set_local_task_state(task_id, { editing_desc: true });
    }
    this.disable_key_handler();
    setTimeout(() => {
      this.disable_key_handler();
    }, 1);
  }

  public set_due_date(
    task_id: string | undefined,
    date: number | undefined,
  ): void {
    this.set_task(task_id, { due_date: date });
  }

  public set_desc(
    task_id: string | undefined,
    desc: string,
    save: boolean = true,
  ): void {
    this.set_task(task_id, { desc }, false, save);
  }

  public set_color(task_id: string, color: string, save: boolean = true): void {
    this.set_task(task_id, { color }, false, save);
  }

  public toggleHideBody(task_id: string | undefined): void {
    if (task_id == null) {
      task_id = this.getFrameData("current_task_id");
    }
    if (task_id == null) {
      return;
    }
    const hideBody = !this.store.getIn(["tasks", task_id, "hideBody"]);
    this.set_task(task_id, { hideBody });
  }

  public show_deleted(): void {
    this.set_local_view_state({ show_deleted: true });
  }

  public stop_showing_deleted(): void {
    this.set_local_view_state({ show_deleted: false });
  }

  public show_done(): void {
    this.set_local_view_state({ show_done: true });
  }

  public stop_showing_done(): void {
    this.set_local_view_state({ show_done: false });
  }

  public empty_trash(): void {
    this.store.get("tasks")?.forEach((task: TaskMap, task_id: string) => {
      if (task.get("deleted")) {
        this.syncdb.delete({ task_id });
      }
    });
  }

  public set_hashtag_state(tag: string, state?: HashtagState): void {
    let selected_hashtags: SelectedHashtags =
      this.getFrameData("local_view_state")?.get("selected_hashtags") ??
      Map<string, HashtagState>();
    if (state == null) {
      selected_hashtags = selected_hashtags.delete(tag);
    } else {
      selected_hashtags = selected_hashtags.set(tag, state);
    }
    this.set_local_view_state({ selected_hashtags });
  }

  public clear_all_hashtags(): void {
    this.set_local_view_state({
      selected_hashtags: Map<string, HashtagState>(),
    });
  }

  public set_sort_column(column: Headings, dir: HeadingsDir): void {
    let view = this.getFrameData("local_view_state") ?? fromJS({});
    let sort = view.get("sort") ?? (fromJS({}) as unknown as Sort);
    sort = sort.set("column", column);
    sort = sort.set("dir", dir);
    view = view.set("sort", sort);
    this.setFrameData({ local_view_state: view });
    this._update_visible();
  }

  // Move task that was at position old_index to now be at
  // position new_index.   NOTE: This is NOT a swap.
  public reorder_tasks(old_index: number, new_index: number): void {
    if (old_index === new_index) {
      return;
    }
    const visible = this.getFrameData("visible");
    const old_id = visible.get(old_index);
    const new_id = visible.get(new_index);
    if (new_id == null) return;
    const new_pos = this.store.getIn(["tasks", new_id, "position"]);
    if (new_pos == null) {
      return;
    }
    let position;
    if (new_index === 0) {
      // moving to very beginning
      position = new_pos - 1;
    } else if (new_index < old_index) {
      const before_id = visible.get(new_index - 1);
      const before_pos =
        this.store.getIn(["tasks", before_id ?? "", "position"]) ?? new_pos - 1;
      position = (new_pos + before_pos) / 2;
    } else if (new_index > old_index) {
      const after_id = visible.get(new_index + 1);
      const after_pos =
        this.store.getIn(["tasks", after_id ?? "", "position"]) ?? new_pos + 1;
      position = (new_pos + after_pos) / 2;
    }
    this.set_task(old_id, { position }, true);
    this.__update_visible();
  }

  public focus_find_box(): void {
    this.disable_key_handler();
    this.setFrameData({ focus_find_box: true });
  }

  public blur_find_box(): void {
    this.setFrameData({ focus_find_box: false });
  }

  setVirtuosoRef = (virtuosoRef) => {
    this.virtuosoRef = virtuosoRef;
  };

  // scroll the current_task_id into view, possibly changing filters
  // in order to make it visibile, if necessary.
  scrollIntoView = async (align: Align = "view") => {
    if (this.virtuosoRef?.current == null) {
      return;
    }
    const current_task_id = this.getFrameData("current_task_id");
    if (current_task_id == null) {
      return;
    }
    let visible = this.getFrameData("visible");
    if (visible == null) {
      return;
    }
    // Figure out the index of current_task_id.
    let index = visible.indexOf(current_task_id);
    if (index === -1) {
      const task = this.store.getIn(["tasks", current_task_id]);
      if (task == null) {
        // no such task anywhere, not even in trash, etc
        return;
      }
      if (
        this.getFrameData("search_desc")?.trim() ||
        task.get("deleted") ||
        task.get("done")
      ) {
        // active search -- try clearing it.
        this.clearAllFilters({
          show_deleted: !!task.get("deleted"),
          show_done: !!task.get("done"),
        });
        visible = this.getFrameData("visible");
        index = visible.indexOf(current_task_id);
        if (index == -1) {
          return;
        }
      } else {
        return;
      }
    }
    if (align == "start" || align == "center" || align == "end") {
      this.virtuosoRef.current.scrollToIndex({ index, align });
    } else {
      this.virtuosoRef.current.scrollIntoView({ index });
    }
  };

  public set_show_max(show_max: number): void {
    this.set_local_view_state({ show_max }, false);
  }

  // TODO: implement
  /*
  public start_timer(task_id: string): void {}
  public stop_timer(task_id: string): void {}
  public delete_timer(task_id: string): void {}
  */

  public toggle_desc_checkbox(
    task_id: string,
    index: number,
    checked: boolean,
  ): void {
    let desc = this.store.getIn(["tasks", task_id, "desc"]);
    if (desc == null) {
      return;
    }
    desc = toggle_checkbox(desc, index, checked);
    this.set_desc(task_id, desc);
  }

  public hide(): void {
    this.disable_key_handler();
  }

  public async show(): Promise<void> {}

  chatgptGetText(scope: "cell" | "all", current_id?): string {
    if (scope == "all") {
      // TODO: it would be better to uniformly shorten long tasks, rather than just truncating at the end...
      return this.toMarkdown();
    } else if (scope == "cell") {
      if (current_id == null) return "";
      return this.store.getIn(["tasks", current_id, "desc"]) ?? "";
    } else {
      return "";
    }
  }

  toMarkdown(): string {
    const visible = this.getFrameData("visible");
    if (visible == null) return "";
    const tasks = this.store.get("tasks");
    if (tasks == null) return "";
    const v: string[] = [];
    visible.forEach((task_id) => {
      const task = tasks.get(task_id);
      if (task == null) return;
      let s = "";
      if (task.get("deleted")) {
        s += "**Deleted**\n\n";
      }
      if (task.get("done")) {
        s += "**Done**\n\n";
      }
      const due = task.get("due_date");
      if (due) {
        s += `Due: ${new Date(due).toLocaleString()}\n\n`;
      }
      s += task.get("desc") ?? "";
      v.push(s);
    });
    return v.join("\n\n---\n\n");
  }
  // Exports the currently visible tasks to a markdown file and opens it.
  public async export_to_markdown(): Promise<void> {
    const content = this.toMarkdown();
    const path = this.truePath + ".md";
    await webapp_client.project_client.write_text_file({
      project_id: this.project_id,
      path,
      content,
    });
    this.redux
      .getProjectActions(this.project_id)
      .open_file({ path, foreground: true });
  }

  setFragment = (id?) => {
    if (!id) {
      Fragment.clear();
    } else {
      Fragment.set({ id });
    }
  };
}

function getPositions(tasks): number[] {
  const v: number[] = [];
  tasks?.forEach((task: TaskMap) => {
    const position = task.get("position");
    if (position != null) {
      v.push(position);
    }
  });
  return v.sort(cmp); // cmp by <, > instead of string!
}
