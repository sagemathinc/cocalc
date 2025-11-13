/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component for task list
*/

import { Button } from "antd";
import { fromJS } from "immutable";
import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { TaskActions } from "./actions";
import { DescVisible } from "./desc-visible";
import { Find } from "./find";
import { HashtagBar } from "./hashtag-bar";
import { Headings } from "./headings";
import { HEADINGS, is_sortable } from "./headings-info";
import TaskList from "./list";
import { TaskState } from "./types";

interface Props {
  actions: TaskActions;
  path: string;
  project_id: string;
  desc;
  read_only?: boolean;
}

export function TaskEditor({
  actions,
  path,
  project_id,
  desc,
  read_only,
}: Props) {
  const useEditor = useEditorRedux<TaskState>({ project_id, path });
  const tasks = useEditor("tasks");
  const visible = desc.get("data-visible");
  const local_task_state = desc.get("data-local_task_state") ?? fromJS({});
  const local_view_state = desc.get("data-local_view_state") ?? fromJS({});
  const hashtags = desc.get("data-hashtags");
  const current_task_id = desc.get("data-current_task_id");
  const counts = desc.get("data-counts");
  const search_terms = desc.get("data-search_terms");
  const search_desc = desc.get("data-search_desc");
  const focus_find_box = desc.get("data-focus_find_box");

  if (tasks == null || visible == null) {
    return (
      <div
        style={{
          fontSize: "40px",
          textAlign: "center",
          padding: "15px",
          color: "#999",
        }}
      >
        <Loading />
      </div>
    );
  }

  return (
    <div className={"smc-vfill"}>
      <Row>
        <Col md={7} style={{ display: "flex", marginTop: "5px" }}>
          <Button
            style={{ marginLeft: "5px" }}
            onClick={() => {
              actions.new_task();
            }}
          >
            <Icon name="plus-circle" /> New Task
          </Button>
          <Find
            style={{ flex: 1 }}
            actions={actions}
            local_view_state={local_view_state}
            counts={counts}
            focus_find_box={focus_find_box}
          />
        </Col>
        <Col md={5}>
          <DescVisible
            num_visible={visible?.size}
            num_tasks={tasks?.size}
            local_view_state={local_view_state}
            search_desc={search_desc}
          />
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {hashtags != null && (
            <HashtagBar
              actions={actions}
              hashtags={hashtags}
              selected_hashtags={local_view_state.get("selected_hashtags")}
            />
          )}
        </Col>
      </Row>
      <Headings actions={actions} sort={local_view_state.get("sort")} />
      <div style={{ paddingTop: "5px" }} />
      {visible.size == 0 ? (
        <a
          onClick={actions.new_task}
          style={{
            fontSize: "40px",
            textAlign: "center",
            padding: "15px",
          }}
        >
          Create a task...
        </a>
      ) : (
        <TaskList
          actions={actions}
          path={path}
          project_id={project_id}
          tasks={tasks}
          visible={visible}
          current_task_id={current_task_id}
          local_task_state={local_task_state}
          scrollState={(local_view_state as any).get("scrollState")?.toJS?.()}
          font_size={desc.get("font_size")}
          sortable={
            !read_only &&
            is_sortable(
              local_view_state.getIn(["sort", "column"]) ?? HEADINGS[0],
            )
          }
          read_only={read_only}
          selected_hashtags={local_view_state.get("selected_hashtags")}
          search_terms={search_terms}
        />
      )}
    </div>
  );
}
