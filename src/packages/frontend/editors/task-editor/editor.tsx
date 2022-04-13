/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for task list
*/

import { React, useEffect, useEditorRedux } from "../../app-framework";

import { Row, Col } from "../../antd-bootstrap";
import { Loading } from "../../components";
import { TaskList } from "./list";
import { ButtonBar } from "./button-bar";
import { Find } from "./find";
import { DescVisible } from "./desc-visible";
import { HashtagBar } from "./hashtag-bar";
import { is_sortable } from "./headings-info";
import { Headings } from "./headings";

import { TaskActions } from "./actions";
import { TaskState } from "./types";

interface Props {
  actions: TaskActions;
  path: string;
  project_id: string;
}

export const TaskEditor: React.FC<Props> = React.memo(
  ({ actions, path, project_id }) => {
    const useEditor = useEditorRedux<TaskState>({ project_id, path });

    const tasks = useEditor("tasks");
    const counts = useEditor("counts");
    const visible = useEditor("visible");
    const current_task_id = useEditor("current_task_id");
    const has_unsaved_changes = useEditor("has_unsaved_changes");
    const has_uncommitted_changes = useEditor("has_uncommitted_changes");
    const local_task_state = useEditor("local_task_state");
    const local_view_state = useEditor("local_view_state");
    const hashtags = useEditor("hashtags");
    const search_terms = useEditor("search_terms");
    const search_desc = useEditor("search_desc");
    const focus_find_box = useEditor("focus_find_box");
    const read_only = useEditor("read_only");
    const scroll_into_view = useEditor("scroll_into_view");
    const load_time_estimate = useEditor("load_time_estimate");

    useEffect(() => {
      actions?.enable_key_handler();
      return actions?.disable_key_handler;
    }, []);

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
          <Loading estimate={load_time_estimate} />
        </div>
      );
    }

    return (
      <div className={"smc-vfill"}>
        {hashtags != null && (
          <HashtagBar
            actions={actions}
            hashtags={hashtags}
            selected_hashtags={local_view_state.get("selected_hashtags")}
          />
        )}

        <Row>
          <Col md={7}>
            {" "}
            <Find
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
        <ButtonBar
          actions={actions}
          read_only={read_only}
          has_unsaved_changes={has_unsaved_changes}
          has_uncommitted_changes={has_uncommitted_changes}
          current_task_id={current_task_id}
          current_task_is_deleted={tasks?.getIn([current_task_id, "deleted"])}
        />
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
            scroll_into_view={scroll_into_view}
            font_size={local_view_state.get("font_size")}
            sortable={
              !read_only &&
              is_sortable(local_view_state.getIn(["sort", "column"]))
            }
            read_only={read_only}
            selected_hashtags={local_view_state.get("selected_hashtags")}
            search_terms={search_terms}
            onSortEnd={({ oldIndex, newIndex }) =>
              actions.reorder_tasks(oldIndex, newIndex)
            }
            useDragHandle={true}
            lockAxis={"y"}
            lockToContainerEdges={true}
          />
        )}
      </div>
    );
  }
);
