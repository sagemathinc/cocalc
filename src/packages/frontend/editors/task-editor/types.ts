/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List, Map, Set } from "immutable";
import { TypedMap } from "@cocalc/frontend/app-framework";
import { LoadingEstimate } from "@cocalc/frontend/components";

export interface Task {
  task_id: string;
  deleted?: boolean;
  position?: number;
  desc?: string;
  due_date?: number;
  done?: boolean;
  last_edited?: number;
}

export type Headings = "Custom Order" | "Due" | "Changed";
export type HeadingsDir = "asc" | "desc";

export type TaskMap = TypedMap<Task>;
export type Sort = TypedMap<{ column: Headings; dir: HeadingsDir }>;

// 1=selected, -1=negated  (-1 is NOT implemented in the UI; it seems annoying; use -#foo in the search box though)
export type HashtagState = -1 | 1;
export type SelectedHashtags = Map<string, HashtagState>;

export interface LocalViewState {
  show_deleted: boolean;
  show_done: boolean;
  show_max: number;
  font_size: number;
  sort: Sort;
  selected_hashtags?: SelectedHashtags;
  search?: string;
  scroll?: number;
}

export type LocalViewStateMap = TypedMap<LocalViewState>;
export type LocalTaskStateMap = Map<string, any>;
export type Counts = TypedMap<{ done: number; deleted: number }>;

// Tasks is an immutable map from task_id (uuidv4) to {desc:?, position:?, last_edited:?, due_date:?, task_id:?}
export type Tasks = Map<string, TaskMap>;

// Hashtags.has('foo') if there is a *visible* (with current search/filters) task with hashtag #foo
export type HashtagsOfVisibleTasks = Set<string>;

// State of the Store
export interface TaskState {
  read_only: boolean;
  tasks?: Tasks;
  local_view_state: LocalViewStateMap;
  local_task_state: LocalTaskStateMap;
  current_task_id?: string;
  counts: Counts;
  search_desc: string;
  search_terms?: Set<string>;
  visible: List<string>; // ordered immutable js list of task_id's
  load_time_estimate?: LoadingEstimate;
  has_unsaved_changes?: boolean;
  has_uncommitted_changes?: boolean;
  scroll_into_view?: boolean;
  focus_find_box?: boolean;
  hashtags?: HashtagsOfVisibleTasks;
}
