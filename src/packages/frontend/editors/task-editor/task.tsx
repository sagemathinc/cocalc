/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
A single task
*/

import { CSSProperties } from "react";
import { Grid, Row, Col } from "../../antd-bootstrap";
import { MinToggle } from "./min-toggle";
import { Description } from "./desc";
import { Changed } from "./changed";
import { DueDate } from "./due";
import { DragHandle } from "./drag";
import { DoneCheckbox } from "./done";
import { header_part } from "./desc-rendering";
import { TaskMap } from "./types";
import { TaskActions } from "./actions";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import {
  CODE_FOCUSED_COLOR,
  FOCUSED_COLOR,
} from "@cocalc/frontend/editors/slate/util";

interface Props {
  actions?: TaskActions;
  project_id?: string;
  path?: string;
  task: TaskMap;
  is_current: boolean;
  editing_due_date: boolean;
  editing_desc: boolean;
  font_size: number;
  sortable?: boolean;
  read_only?: boolean;
  selectedHashtags: Set<string>;
  searchWords?: string[];
}

export default function Task({
  actions,
  path,
  project_id,
  task,
  is_current,
  editing_due_date,
  editing_desc,
  font_size,
  sortable,
  read_only,
  selectedHashtags,
  searchWords,
}: Props) {
  const style = {
    margin: "2px 5px",
    paddingTop: "5px",
    background: "white",
    borderRadius: "8px",
  } as CSSProperties;
  if (editing_desc) {
    style.border = `2px solid ${CODE_FOCUSED_COLOR}`;
    style.borderLeft = `10px solid ${CODE_FOCUSED_COLOR}`;
  } else if (is_current) {
    style.border = `2px solid ${FOCUSED_COLOR}`;
    style.borderLeft = `10px solid ${FOCUSED_COLOR}`;
  } else {
    style.border = "2px solid #ddd";
    style.borderTop = "2px solid #eeejj";
    style.borderLeft = `10px solid #ddd`;
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

  const color = task.get("color");
  if (color) {
    style.background = color;
    style.color = avatar_fontcolor(color);
  }

  return (
    <Grid
      style={style}
      onClick={() => {
        actions?.set_current_task(task.get("task_id"));
        actions?.enable_key_handler();
      }}
    >
      <Row>
        <Col sm={1}>
          {actions != null && (
            <DragHandle sortable={sortable} id={task.get("task_id")} />
          )}
          {actions != null && (
            <MinToggle
              actions={actions}
              task_id={task.get("task_id")}
              hideBody={task.get("hideBody")}
              has_body={min_toggle}
            />
          )}
        </Col>
        <Col sm={8}>
          <Description
            actions={actions}
            path={path}
            project_id={project_id}
            task_id={task.get("task_id")}
            desc={task.get("desc") ?? ""}
            color={color}
            editing={editing_desc}
            is_current={is_current}
            isDeleted={task.get("deleted")}
            font_size={font_size}
            read_only={read_only}
            selectedHashtags={selectedHashtags}
            searchWords={searchWords}
            hideBody={task.get("hideBody")}
          />
        </Col>
        <Col sm={1}>
          {" "}
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
        </Col>
        <Col sm={1}>
          <span style={{ fontSize: "10pt", color: "#666" }}>
            <Changed last_edited={task.get("last_edited")} />
          </span>
        </Col>
        <Col sm={1} style={{ textAlign: "center" }}>
          <DoneCheckbox
            actions={actions}
            read_only={read_only}
            done={!!task.get("done")}
            task_id={task.get("task_id")}
          />
        </Col>
      </Row>
    </Grid>
  );
}
