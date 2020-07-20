/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A single task
*/

import { Set } from "immutable";
import { React, CSS } from "../../app-framework";
import { Grid, Row, Col } from "../../antd-bootstrap";
import { MinToggle } from "./min-toggle";
import { Description } from "./desc";
import { Changed } from "./changed";
import { DueDate } from "./due";
import { DragHandle } from "./drag";
import { DoneCheckbox } from "./done";
import { header_part } from "./desc-rendering";
import { SelectedHashtags, TaskMap } from "./types";
import { TaskActions } from "./actions";

interface Props {
  actions?: TaskActions;
  project_id?: string;
  path?: string;
  task: TaskMap;
  is_current: boolean;
  editing_due_date: boolean;
  editing_desc: boolean;
  full_desc: boolean;
  font_size: number;
  sortable: boolean;
  read_only: boolean;
  selected_hashtags: SelectedHashtags;
  search_terms: Set<string>;
}

export const Task: React.FC<Props> = React.memo(
  ({
    actions,
    path,
    project_id,
    task,
    is_current,
    editing_due_date,
    editing_desc,
    full_desc,
    font_size,
    sortable,
    read_only,
    selected_hashtags,
    search_terms,
  }) => {
    function render_drag_handle() {
      return <DragHandle sortable={sortable} />;
    }

    function render_done_checkbox() {
      // cast of done to bool for backward compat
      return (
        <DoneCheckbox
          actions={actions}
          read_only={read_only}
          done={!!task.get("done")}
          task_id={task.get("task_id")}
        />
      );
    }

    function render_min_toggle(has_body) {
      return (
        <MinToggle
          actions={actions}
          task_id={task.get("task_id")}
          full_desc={full_desc}
          has_body={has_body}
        />
      );
    }

    function render_desc() {
      return (
        <Description
          actions={actions}
          path={path}
          project_id={project_id}
          task_id={task.get("task_id")}
          desc={task.get("desc") ?? ""}
          full_desc={full_desc}
          editing={editing_desc}
          is_current={is_current}
          font_size={font_size}
          read_only={read_only}
          selected_hashtags={selected_hashtags}
          search_terms={search_terms}
        />
      );
    }

    function render_last_edited() {
      return (
        <span style={{ fontSize: "10pt", color: "#666" }}>
          <Changed last_edited={task.get("last_edited")} />
        </span>
      );
    }

    function render_due_date() {
      return (
        <span style={{ fontSize: "10pt", color: "#666" }}>
          <DueDate
            actions={actions}
            read_only={read_only}
            task_id={task.get("task_id")}
            due_date={task.get("due_date")}
            editing={editing_due_date}
            is_done={!!task.get("done")}
          />
        </span>
      );
    }

    const style : CSS = {
      margin: "2px 5px",
      background: "white",
    };
    if (is_current) {
      style.border = "1px solid rgb(171, 171, 171)";
      style.borderLeft = "5px solid rgb(66, 165, 245)";
      style.background = "rgb(247, 247, 247)";
    } else {
      style.border = "1px solid #ccc";
      style.borderLeft = "5px solid #ccc";
    }
    if (task.get("deleted")) {
      style.background = "#d9534f";
      style.color = "#fff";
    } else if (task.get("done")) {
      style.color = "#888";
    }
    if (font_size != null) {
      style.fontSize = `${font_size}px`;
    }

    const desc = task.get("desc") ?? "";
    let min_toggle;
    if (editing_desc) {
      // while editing no min toggle
      min_toggle = false;
    } else {
      // not editing, so maybe a min toggle...
      min_toggle = header_part(desc) !== desc.trim();
    }

    return (
      <Grid
        style={style}
        onClick={() => actions?.set_current_task(task.get("task_id"))}
      >
        <Row>
          <Col sm={1}>
            {render_drag_handle()}
            {render_min_toggle(min_toggle)}
          </Col>
          <Col sm={8}>{render_desc()}</Col>
          <Col sm={1}>{render_due_date()}</Col>
          <Col sm={1}>{render_last_edited()}</Col>
          <Col sm={1}>{render_done_checkbox()}</Col>
        </Row>
      </Grid>
    );
  }
);
