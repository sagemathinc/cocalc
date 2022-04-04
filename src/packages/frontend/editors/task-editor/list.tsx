/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Windowed List of Tasks -- we use windowing so that even task lists with 500 tasks are fully usable!
*/

import { List, Set } from "immutable";
import { SortableContainer, SortableElement } from "react-sortable-hoc";
import { React, useEffect, useRef } from "../../app-framework";
import { WindowedList } from "../../components/windowed-list";
import { Task } from "./task";
import { TaskActions } from "./actions";
import { LocalTaskStateMap, SelectedHashtags, Tasks } from "./types";
const SortableTask = SortableElement(Task);

interface Props {
  actions?: TaskActions;
  path?: string;
  project_id?: string;
  tasks: Tasks;
  visible: List<string>;
  current_task_id?: string;
  local_task_state?: LocalTaskStateMap;
  full_desc?: Set<string>; // id's of tasks for which show full description (all shown if actions is null)
  scrollTop?: number; // scroll position -- only used when initially mounted
  scroll_into_view?: boolean;
  font_size: number;
  sortable?: boolean;
  read_only?: boolean;
  selected_hashtags?: SelectedHashtags;
  search_terms?: Set<string>;
}

const TaskListNonsort: React.FC<Props> = React.memo(
  ({
    actions,
    path,
    project_id,
    tasks,
    visible,
    current_task_id,
    local_task_state,
    full_desc,
    scrollTop,
    scroll_into_view,
    font_size,
    sortable,
    read_only,
    selected_hashtags,
    search_terms,
  }) => {
    const windowed_list_ref = useRef<WindowedList>(null);
    const main_div_ref = useRef(null);

    useEffect(() => {
      windowed_list_ref.current?.refresh();
    }, [visible]);

    useEffect(() => {
      return save_scroll_position;
    }, []);

    useEffect(() => {
      if (actions && scroll_into_view) {
        _scroll_into_view();
        actions.scroll_into_view_done();
      }
    }, [scroll_into_view]);

    function _scroll_into_view() {
      if (current_task_id == null) {
        return;
      }
      // Figure out the index of current_task_id.
      const index = visible.indexOf(current_task_id);
      if (index === -1) {
        return;
      }
      windowed_list_ref?.current?.scrollToRow(index, "top");
    }

    function render_task(index, task_id) {
      if (index === visible.size) {
        // Empty div at the bottom makes it possible to scroll
        // the calendar into view...
        return <div style={{ height: "300px" }} />;
      }

      const task = tasks.get(task_id);
      if (task == null) {
        // task deletion and visible list might not quite immediately be in sync/consistent
        return;
      }
      let T;
      if (sortable) {
        T = SortableTask;
      } else {
        T = Task;
      }
      let show_full_desc: boolean;
      let editing_due_date: boolean;
      let editing_desc: boolean;
      if (actions != null) {
        const state = local_task_state?.get(task_id);
        show_full_desc = !!full_desc?.has(task_id);
        editing_due_date = !!state?.get("editing_due_date");
        editing_desc = !!state?.get("editing_desc");
      } else {
        // full_desc = true since always expand, e.g., in (stateless) history viewer
        // -- until we implement some state for it (?)
        show_full_desc = true;
        editing_due_date = editing_desc = false;
      }
      return (
        <T
          key={task_id}
          index={index}
          actions={actions}
          path={path}
          project_id={project_id}
          task={task}
          is_current={current_task_id === task_id}
          editing_due_date={editing_due_date}
          editing_desc={editing_desc}
          full_desc={show_full_desc}
          font_size={font_size}
          sortable={sortable}
          read_only={read_only}
          selected_hashtags={selected_hashtags}
          search_terms={search_terms}
        />
      );
    }

    function save_scroll_position() {
      if (actions == null) {
        return;
      }
      const scrollTop = windowed_list_ref?.current?.get_scroll();
      if (scrollTop != null) {
        actions.set_local_view_state({ scrollTop });
      }
    }

    function on_click(e) {
      if (e.target === main_div_ref.current) {
        actions?.enable_key_handler();
      }
    }

    return (
      <div
        className="smc-vfill"
        ref={main_div_ref}
        onClick={on_click}
        style={{ overflow: "hidden" }}
      >
        <WindowedList
          ref={windowed_list_ref}
          overscan_row_count={10}
          estimated_row_size={44}
          row_count={visible.size + 1}
          row_renderer={(obj) => render_task(obj.index, obj.key)}
          row_key={(index) => visible.get(index) ?? "filler"}
          cache_id={actions?.name}
          scroll_top={scrollTop}
          hide_resize={false} // hide_resize is false so drag and drop works.
        />
      </div>
    );
  }
);

export const TaskList = SortableContainer(TaskListNonsort);
