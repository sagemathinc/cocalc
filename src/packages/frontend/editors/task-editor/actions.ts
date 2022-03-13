/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Task Actions
*/

const LAST_EDITED_THRESH_S = 30;
const TASKS_HELP_URL = "https://doc.cocalc.com/tasks.html";

import { fromJS, Map, Set } from "immutable";
import { debounce, throttle } from "lodash";
import { delay } from "awaiting";
import {
  close,
  copy_with,
  cmp,
  uuid,
  history_path,
  search_split,
} from "@cocalc/util/misc";
import { HEADINGS, HEADINGS_DIR } from "./headings-info";
import { update_visible } from "./update-visible";
import { create_key_handler } from "./keyboard";
import { toggle_checkbox } from "./desc-rendering";
import { Actions } from "../../app-framework";
import {
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
import { TaskStore } from "./store";
import { SyncDB } from "@cocalc/sync/editor/db";
import { webapp_client } from "../../webapp-client";
import {
  set_local_storage,
  get_local_storage,
} from "@cocalc/frontend/misc/local-storage";
export class TaskActions extends Actions<TaskState> {
  private syncdb: SyncDB;
  private project_id: string;
  private path: string;
  private store: TaskStore;
  private _save_local_view_state: Function;
  private _update_visible: Function;
  private is_closed: boolean = false;
  private key_handler?: (any) => void;
  private set_save_status?: () => void;

  public _init(
    project_id: string,
    path: string,
    syncdb: SyncDB,
    store: TaskStore
  ): void {
    this._save_local_view_state = debounce(this.__save_local_view_state, 1500);
    this._update_visible = throttle(this.__update_visible, 500);
    this.project_id = project_id;
    this.path = path;
    this.syncdb = syncdb;
    this.store = store;

    this.setState({
      local_task_state: Map(),
      local_view_state: this._load_local_view_state(),
      counts: fromJS({ done: 0, deleted: 0 }),
    });

    this._init_has_unsaved_changes();
    this.syncdb.on("change", this._syncdb_change);
    this.syncdb.once("change", this._ensure_positions_are_unique);
    this.syncdb.once("ready", this._syncdb_metadata);
    this.syncdb.on("metadata-change", this._syncdb_metadata);

    this.syncdb.once("load-time-estimate", (est) =>
      this.setState({ load_time_estimate: est })
    );
  }

  public close(): void {
    if (this.is_closed) {
      return;
    }
    this.is_closed = true;
    this.__save_local_view_state();
    this.syncdb.close();
    if (this.key_handler != null) {
      this.redux.getActions("page").erase_active_key_handler(this.key_handler);
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
    this.redux
      .getActions("page")
      .set_active_key_handler(this.key_handler, this.project_id, this.path);
  }

  public disable_key_handler(): void {
    if (this.key_handler == null) return;
    this.redux.getActions("page").erase_active_key_handler(this.key_handler);
    delete this.key_handler;
  }

  private __save_local_view_state(): void {
    // This will sometimes get called after close, since this is
    // called via debounce. See #4957.
    if (this.is_closed) return;
    const local_view_state = this.store.get("local_view_state");
    if (local_view_state != null && localStorage !== null) {
      set_local_storage(this.name, JSON.stringify(local_view_state.toJS()));
    }
  }

  private _load_local_view_state(): LocalViewStateMap {
    const x = get_local_storage(this.name);
    if (x == null) return fromJS({}); // no data, nothing to process
    let local_view_state: LocalViewStateMap;
    try {
      local_view_state = fromJS(
        typeof x === "string" ? JSON.parse(x) : x ?? {}
      );
    } catch (_) {
      local_view_state = fromJS({});
    }
    if (!local_view_state.has("show_deleted")) {
      local_view_state = local_view_state.set("show_deleted", false);
    }
    if (!local_view_state.has("show_done")) {
      local_view_state = local_view_state.set("show_done", false);
    }
    if (!local_view_state.has("show_max")) {
      local_view_state = local_view_state.set("show_max", 50);
    }
    if (!local_view_state.has("font_size")) {
      local_view_state = local_view_state.set(
        "font_size",
        this.redux.getStore("account").get("font_size") ?? 14
      );
    }
    if (!local_view_state.has("sort")) {
      const sort = fromJS({
        column: HEADINGS[0],
        dir: HEADINGS_DIR[0],
      });
      local_view_state = local_view_state.set("sort", sort);
    }
    local_view_state = local_view_state.set(
      "full_desc",
      local_view_state.get("full_desc")?.toSet() ?? Set()
    );

    return local_view_state;
  }

  private _init_has_unsaved_changes(): void {
    // basically copies from jupyter/actions.coffee -- opportunity to refactor
    const do_set = () => {
      if (this.is_closed) return;
      this.setState({
        has_unsaved_changes: this.syncdb?.has_unsaved_changes(),
        has_uncommitted_changes: this.syncdb?.has_uncommitted_changes(),
      });
    };
    const f = async () => {
      do_set();
      await delay(3000);
      do_set();
    };
    this.set_save_status = debounce(f, 500);
    this.syncdb.on("metadata-change", this.set_save_status);
    this.syncdb.on("connected", this.set_save_status);
  }

  private _syncdb_metadata(): void {
    if (this.syncdb == null || this.store == null) {
      // may happen during close
      return;
    }
    const read_only = this.syncdb.is_read_only();
    if (read_only !== this.store.get("read_only")) {
      this.setState({ read_only });
    }
  }

  private _syncdb_change(changes): void {
    if (this.syncdb == null || this.store == null) {
      // may happen during close
      return;
    }
    let tasks = this.store.get("tasks") ?? Map();
    changes.forEach((x) => {
      const task_id = x.get("task_id");
      const t = this.syncdb.get_one(x);
      if (t == null) {
        // deleted
        tasks = tasks.delete(task_id);
      } else {
        // changed
        tasks = tasks.set(task_id, t as any);
      }
    });

    this.setState({ tasks });
    this._update_visible();
    this.set_save_status?.();
  }

  private __update_visible(): void {
    const tasks = this.store.get("tasks");
    if (tasks == null) return;
    const view = this.store.get("local_view_state");
    const local_task_state = this.store.get("local_task_state");
    const current_task_id = this.store.get("current_task_id");
    const counts = this.store.get("counts");

    let obj: any = update_visible(
      tasks,
      local_task_state,
      view,
      counts,
      current_task_id
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
        current_task_id
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
    this.setState(obj);
  }

  private _ensure_positions_are_unique(): void {
    let tasks = this.store.get("tasks");
    if (tasks == null) {
      return;
    }
    // iterate through tasks adding their (string) positions to a "set" (using a map)
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
    for (let x of v) {
      this.set_task(x[1], { position });
      position += 1;
    }
  }

  public set_local_task_state(task_id: string | undefined, obj: object): void {
    if (this.is_closed) {
      return;
    }
    if (task_id == null) {
      task_id = this.store.get("current_task_id");
    }
    if (task_id == null) {
      return;
    }
    // Set local state related to a specific task -- this is NOT sync'd between clients
    const local = this.store.get("local_task_state");
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
    this.setState({
      local_task_state: local.set(obj["task_id"], x),
    });
  }

  public set_local_view_state(obj, update_visible = true): void {
    if (this.is_closed) {
      return;
    }
    // Set local state related to what we see/search for/etc.
    let local = this.store.get("local_view_state");
    for (let key in obj) {
      const value = obj[key];
      if (
        key == "show_deleted" ||
        key == "show_done" ||
        key == "show_max" ||
        key == "font_size" ||
        key == "sort" ||
        key == "full_desc" ||
        key == "selected_hashtags" ||
        key == "search" ||
        key == "scrollTop"
      ) {
        local = local.set(key as any, fromJS(value));
      } else {
        throw Error(`bug setting local_view_state -- invalid field "${key}"`);
      }
    }
    this.setState({
      local_view_state: local,
    });
    if (update_visible) {
      this._update_visible();
    }
    this._save_local_view_state();
  }

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
      this.store.get("current_task_id") ?? "",
      "position",
    ]);

    const positions = this.store.get_positions();
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
    const search = this.store.get("search_desc");
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
    save: boolean = true // make new commit to syncdb state
  ): void {
    if (obj == null || this.is_closed) {
      return;
    }
    if (task_id == null) {
      task_id = this.store.get("current_task_id");
    }
    if (task_id == null) {
      return;
    }
    let task = this.store.getIn(["tasks", task_id]);
    // Update last_edited if desc or due date changes
    if (
      task == null ||
      (obj["desc"] != null && obj["desc"] !== task.get("desc")) ||
      (obj["due_date"] != null && obj["due_date"] !== task.get("due_date")) ||
      (obj["done"] != null && obj["done"] !== task.get("done"))
    ) {
      const last_edited =
        this.store.getIn(["tasks", task_id, "last_edited"]) ?? 0;
      const now = new Date().valueOf();
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
      task = tasks.get(task_id) ?? fromJS({ task_id });
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
    const task_id = this.store.get("current_task_id");
    if (task_id == null) return;
    this.delete_task(task_id);
  }

  public undelete_current_task(): void {
    const task_id = this.store.get("current_task_id");
    if (task_id == null) return;
    this.undelete_task(task_id);
  }

  public move_task_to_top(): void {
    const task_id = this.store.get("current_task_id");
    if (task_id == null) return;
    this.set_task(task_id, {
      position: this.store.get_positions()[0] - 1,
    });
  }

  public move_task_to_bottom(): void {
    const task_id = this.store.get("current_task_id");
    if (task_id == null) return;
    this.set_task(task_id, {
      position: this.store.get_positions().slice(-1)[0] + 1,
    });
  }

  // only delta = 1 or -1 is supported!
  public move_task_delta(delta: -1 | 1): void {
    if (delta !== 1 && delta !== -1) {
      return;
    }
    const task_id = this.store.get("current_task_id");
    if (task_id == null) {
      return;
    }
    const visible = this.store.get("visible");
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
    this.scroll_into_view();
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

  public set_current_task(task_id: string): void {
    if (this.store.get("current_task_id") == task_id) return;
    this.setState({ current_task_id: task_id });
    this.scroll_into_view();
  }

  public set_current_task_delta(delta: number): void {
    const task_id = this.store.get("current_task_id");
    if (task_id == null) {
      return;
    }
    const visible = this.store.get("visible");
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
      task_id = this.store.get("current_task_id");
    }
    this.set_task(task_id, { done: false });
  }

  public set_task_done(task_id: string | undefined): void {
    if (task_id == null) {
      task_id = this.store.get("current_task_id");
    }
    this.set_task(task_id, { done: true });
  }

  public toggle_task_done(task_id: string | undefined): void {
    if (task_id == null) {
      task_id = this.store.get("current_task_id");
    }
    if (task_id != null) {
      this.set_task(
        task_id,
        { done: !this.store.getIn(["tasks", task_id, "done"]) },
        true
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

  public edit_desc(task_id: string | undefined): void {
    // close any that were currently in edit state before opening new one
    const local = this.store.get("local_task_state");
    for (const [id, state] of local) {
      if (state.get("editing_desc")) {
        this.stop_editing_desc(id);
      }
    }

    this.set_local_task_state(task_id, { editing_desc: true });
  }

  public set_due_date(
    task_id: string | undefined,
    date: number | undefined
  ): void {
    this.set_task(task_id, { due_date: date });
  }

  public set_desc(
    task_id: string | undefined,
    desc: string,
    save: boolean = true
  ): void {
    this.set_task(task_id, { desc }, false, save);
  }

  public set_color(task_id: string, color: string, save: boolean = true): void {
    this.set_task(task_id, { color }, false, save);
  }

  public toggle_full_desc(task_id: string | undefined): void {
    if (task_id == null) {
      task_id = this.store.get("current_task_id");
    }
    if (task_id == null) {
      return;
    }
    let local_view_state = this.store.get("local_view_state");
    if (local_view_state == null) return;
    const full_desc = local_view_state.get("full_desc") ?? Set<string>();
    if (full_desc.has(task_id)) {
      local_view_state = local_view_state.set(
        "full_desc",
        full_desc.remove(task_id)
      );
    } else {
      local_view_state = local_view_state.set(
        "full_desc",
        full_desc.add(task_id)
      );
    }
    this.setState({ local_view_state });
    this._update_visible();
    this._save_local_view_state();
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

  public set_font_size(size: number): void {
    this.set_local_view_state({ font_size: size });
  }

  public increase_font_size(): void {
    const size = this.store.getIn(["local_view_state", "font_size"]) ?? 14;
    this.set_font_size(size + 1);
  }

  public decrease_font_size(): void {
    const size = this.store.getIn(["local_view_state", "font_size"]) ?? 14;
    this.set_font_size(size - 1);
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
      this.store.getIn(["local_view_state", "selected_hashtags"]) ??
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
    let view = this.store.get("local_view_state");
    let sort = view.get("sort") ?? (fromJS({}) as Sort);
    sort = sort.set("column", column);
    sort = sort.set("dir", dir);
    view = view.set("sort", sort);
    this.setState({ local_view_state: view });
    this._update_visible();
    this.__save_local_view_state();
  }

  // Move task that was at position old_index to now be at
  // position new_index
  public reorder_tasks(old_index: number, new_index: number): void {
    if (old_index === new_index) {
      return;
    }
    const visible = this.store.get("visible");
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
    this.setState({ focus_find_box: true });
  }

  public blur_find_box(): void {
    this.enable_key_handler();
    this.setState({ focus_find_box: false });
  }

  async scroll_into_view(): Promise<void> {
    await delay(50);
    this.setState({ scroll_into_view: true });
  }

  public scroll_into_view_done(): void {
    this.setState({ scroll_into_view: false });
  }

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
    checked: boolean
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

  public async show(): Promise<void> {
    await delay(1);
    this.enable_key_handler();
  }

  // Exports the currently visible tasks to a markdown file and opens it.
  public async export_to_markdown(): Promise<void> {
    const visible = this.store.get("visible");
    if (visible == null) return;
    const tasks = this.store.get("tasks");
    if (tasks == null) return;
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
    const content = v.join("\n\n---\n\n");
    const path = this.path + ".md";
    await webapp_client.project_client.write_text_file({
      project_id: this.project_id,
      path,
      content,
    });
    this.redux
      .getProjectActions(this.project_id)
      .open_file({ path, foreground: true });
  }
}
