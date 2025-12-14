/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
List of Tasks -- we use windowing via Virtuoso, so that even task lists with 500+ tasks are fully usable!
*/

import { List, Set as immutableSet } from "immutable";
import { useEffect, useMemo, useRef, useState } from "react";
import StatefulVirtuoso from "@cocalc/frontend/components/stateful-virtuoso";
import { TaskActions } from "./actions";
import Task from "./task";
import { LocalTaskStateMap, SelectedHashtags, Tasks } from "./types";

import {
  SortableItem,
  SortableList,
} from "@cocalc/frontend/components/sortable-list";

interface Props {
  actions?: TaskActions;
  path?: string;
  project_id?: string;
  tasks: Tasks;
  visible: List<string>;
  current_task_id?: string;
  local_task_state?: LocalTaskStateMap;
  font_size: number;
  sortable?: boolean;
  read_only?: boolean;
  selected_hashtags?: SelectedHashtags;
  search_terms?: immutableSet<string>;
}

export default function TaskList({
  actions,
  path,
  project_id,
  tasks,
  visible: visible0,
  current_task_id,
  local_task_state,
  font_size,
  sortable,
  read_only,
  selected_hashtags,
  search_terms,
}: Props) {
  const mainDivRef = useRef<any>(null);
  const [visible, setVisible] = useState<List<string>>(visible0);
  useEffect(() => {
    setVisible(visible0);
  }, [visible0]);

  const selectedHashtags: Set<string> = useMemo(() => {
    const X = new Set<string>([]);
    if (selected_hashtags == null) return X;
    for (const [key] of selected_hashtags) {
      if (selected_hashtags.get(key) == 1) {
        // Note -- we don't have to worry at all about v == -1, since such tasks won't be visible!
        X.add(key);
      }
    }
    return X;
  }, [selected_hashtags]);

  const searchWords: string[] | undefined = useMemo(() => {
    return search_terms?.toJS();
  }, [search_terms]);

  function render_task(task_id, index?) {
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
    let editing_due_date: boolean;
    let editing_desc: boolean;
    if (actions != null) {
      const state = local_task_state?.get(task_id);
      editing_due_date = !!state?.get("editing_due_date");
      editing_desc = !!state?.get("editing_desc");
    } else {
      editing_due_date = editing_desc = false;
    }
    const body = (
      <Task
        key={task_id}
        actions={actions}
        path={path}
        project_id={project_id}
        task={task}
        is_current={current_task_id === task_id}
        editing_due_date={editing_due_date}
        editing_desc={editing_desc}
        font_size={font_size}
        sortable={sortable}
        read_only={read_only}
        selectedHashtags={selectedHashtags}
        searchWords={searchWords}
      />
    );
    if (!sortable) return body;
    return <SortableItem id={task_id}>{body}</SortableItem>;
  }

  function on_click(e) {
    if (e.target === mainDivRef.current) {
      // The following from https://github.com/sagemathinc/cocalc/pull/6779 is definitely wrong.  E.g., open the find side
      // panel, then open a task list and try to edit a task and type e.g., "s" and saves the tasks file.
      // test, if e.target is a child of mainDivRef.current
      //if (mainDivRef.current.contains(e.target)) {
      actions?.enable_key_handler();
    }
  }

  return (
    <SortableList
      disabled={!sortable}
      items={visible.toJS()}
      Item={({ id }) => render_task(id)}
      onDragStop={(oldIndex, newIndex) => {
        // Move task that was at position oldIndex to now be at
        // position newIndex.  NOTE: This is NOT a swap.
        if (oldIndex == newIndex) {
          return;
        }
        let visible1 = visible.delete(oldIndex);
        visible1 = visible1.insert(newIndex, visible.get(oldIndex)!);
        setVisible(visible1);
        // must set visible0 (in the store) in next render loop, or the above
        // gets combined with this and there is flicker.
        setTimeout(() => {
          actions?.reorder_tasks(oldIndex, newIndex);
        }, 0);
      }}
    >
      <div
        className="smc-vfill"
        ref={mainDivRef}
        onClick={on_click}
        style={{ overflow: "hidden" }}
      >
        <StatefulVirtuoso
          overscan={500}
          totalCount={visible.size + 1}
          itemContent={(index) =>
            render_task(visible.get(index) ?? `${index}filler`, index)
          }
          cacheId={actions?.name ?? "task-list"}
        />
      </div>
    </SortableList>
  );
}
