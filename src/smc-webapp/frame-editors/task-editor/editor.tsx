/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for task list
*/

import { React, useEffect, useRedux } from "../../app-framework";

import { Row, Col } from "../../antd-bootstrap";
import { Loading } from "../../r_misc";
import { TaskList } from "./list";
import { ButtonBar } from "./button-bar";
import { Find } from "./find";
import { DescVisible } from "./desc-visible";
import { HashtagBar } from "./hashtag-bar";
import { is_sortable } from "./headings-info";
import { Headings } from "./headings";

import { TaskActions } from "./actions";
//import { TaskState } from "./types";

interface Props {
  actions: TaskActions;
  path: string;
  project_id: string;
}

export const TaskEditor: React.FC<Props> = React.memo(
  ({ actions, path, project_id }) => {
    const tasks = useRedux(["tasks"], project_id, path);
    const counts = useRedux(["counts"], project_id, path);
    const visible = useRedux(["visible"], project_id, path);
    const current_task_id = useRedux(["current_task_id"], project_id, path);
    const has_unsaved_changes = useRedux(
      ["has_unsaved_changes"],
      project_id,
      path
    );
    const has_uncommitted_changes = useRedux(
      ["has_uncommitted_changes"],
      project_id,
      path
    );
    const local_task_state = useRedux(["local_task_state"], project_id, path);
    const local_view_state = useRedux(["local_view_state"], project_id, path);
    const hashtags = useRedux(["hashtags"], project_id, path);
    const search_terms = useRedux(["search_terms"], project_id, path);
    const search_desc = useRedux(["search_desc"], project_id, path);
    const focus_find_box = useRedux(["focus_find_box"], project_id, path);
    const read_only = useRedux(["read_only"], project_id, path);
    const scroll_into_view = useRedux(["scroll_into_view"], project_id, path);
    const load_time_estimate = useRedux(
      ["load_time_estimate"],
      project_id,
      path
    );

    useEffect(() => {
      actions.enable_key_handler();
      return actions.disable_key_handler;
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
            full_desc={local_view_state.get("full_desc")}
            scrollTop={local_view_state.get("scrollTop")}
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
