/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Summary line about what is being shown.
*/

import { Map } from "immutable";
import { CSS, React } from "../../app-framework";
import { plural } from "smc-util/misc";

const STYLE: CSS = {
  padding: "10px 0px",
  float: "right",
  marginRight: "15px",
  fontSize: "12pt",
  position: "absolute",
  marginLeft: "5px",
} as const;

interface Props {
  num_visible?: number;
  num_tasks?: number;
  local_view_state: Map<string, any>;
  search_desc: string;
}

export const DescVisible: React.FC<Props> = React.memo(
  ({ num_visible, num_tasks, local_view_state, search_desc }) => {
    function render_visible() {
      return (
        <span style={{ color: "#666" }}>
          {num_visible} matching {plural(num_visible, "task")}.
        </span>
      );
    }

    function render_search() {
      if (!search_desc) {
        return;
      }
      return (
        <span style={{ color: "#666", marginLeft: "10px" }}>
          Tasks that match{" "}
          <b>
            <i>{search_desc}</i>
          </b>
          .
        </span>
      );
    }

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
      <div style={STYLE}>
        {render_visible()}
        {render_search()}
        {render_checked()}
      </div>
    );
  }
);
