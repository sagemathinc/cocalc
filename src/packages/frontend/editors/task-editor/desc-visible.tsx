/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Summary line about what is being shown.
*/

import { plural } from "@cocalc/util/misc";
import { LocalViewStateMap } from "./types";

interface Props {
  num_visible?: number;
  num_tasks?: number;
  local_view_state: LocalViewStateMap;
  search_desc: string;
}

export function DescVisible({
  num_visible,
  num_tasks,
  local_view_state,
  search_desc,
}: Props) {
  function render_checked() {
    const v: string[] = [];
    for (let type of ["done", "deleted"]) {
      if (local_view_state.get(`show_${type}`)) {
        v.push(type);
      }
    }
    if (v.length === 0) {
      return;
    }
    return (
      <span style={{ color: "#666", marginLeft: "10px" }}>
        Including{" "}
        <b>
          <i>{v.join(" and ")}</i>
        </b>{" "}
        tasks.
      </span>
    );
  }

  if (num_visible == null || local_view_state == null || num_tasks == null) {
    return <span />;
  }
  return (
    <div style={{ marginTop: "12.5px", fontWeight: 500 }}>
      <span style={{ color: "#666" }}>
        {num_visible} matching {plural(num_visible, "task")}.
      </span>
      {search_desc && (
        <span style={{ color: "#666", marginLeft: "10px" }}>
          Tasks that match{" "}
          <b>
            <i>{search_desc}</i>
          </b>
          .
        </span>
      )}
      {render_checked()}
    </div>
  );
}
