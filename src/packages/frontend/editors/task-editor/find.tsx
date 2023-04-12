/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Searching for tasks by full text search and done/deleted status.
*/

import { useEffect, useRef } from "../../app-framework";
import { Input } from "antd";
import { ShowToggle } from "./show-toggle";
import { EmptyTrash } from "./empty-trash";
import { TaskActions } from "./actions";
import { Counts, LocalViewStateMap } from "./types";

interface Props {
  actions: TaskActions;
  local_view_state: LocalViewStateMap;
  counts?: Counts;
  focus_find_box?: boolean;
}

export function Find({
  actions,
  local_view_state,
  counts,
  focus_find_box,
}: Props) {
  const inputRef = useRef<any>(null);
  useEffect(() => {
    if (focus_find_box) {
      inputRef.current?.focus();
    }
  }, [focus_find_box]);

  return (
    <div style={{ display: "flex", marginLeft: "5px" }}>
      <Input.Search
        ref={inputRef}
        allowClear
        value={local_view_state.get("search") ?? ""}
        placeholder={"Search for tasks..."}
        onChange={(e) =>
          actions.set_local_view_state({
            search: e.target.value,
          })
        }
        onBlur={() => actions.blur_find_box()}
        onFocus={() => actions.disable_key_handler()}
        onKeyDown={(evt) => {
          if (evt.which === 27) {
            actions.set_local_view_state({ search: "" });
            inputRef.current?.blur();
            return false;
          }
        }}
      />
      <Toggle
        type="done"
        counts={counts}
        local_view_state={local_view_state}
        actions={actions}
      />
      <Toggle
        type="deleted"
        counts={counts}
        local_view_state={local_view_state}
        actions={actions}
      />
    </div>
  );
}

function Toggle({ type, counts, local_view_state, actions }) {
  if (counts == null) return null;
  const count = counts.get(type);
  const show = local_view_state.get(`show_${type}`);
  return (
    <div style={{ padding: "2px 5px", display: "flex" }}>
      <ShowToggle actions={actions} type={type} show={show} count={count} />
      {show && type === "deleted" && count > 0 && (
        <EmptyTrash actions={actions} count={count} />
      )}
    </div>
  );
}
