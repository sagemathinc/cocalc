/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Task description:

 - displays description as markdown
 - allows for changing it
*/

import { Map, Set } from "immutable";
import { Button } from "../../antd-bootstrap";
import { React } from "../../app-framework";
import { Icon } from "../../components";
import { DescriptionRendered } from "./desc-rendered";
import DescriptionEditor from "./desc-editor";
import { TaskActions } from "./actions";

interface Props {
  actions?: TaskActions;
  path?: string;
  project_id?: string;
  task_id: string;
  desc: string;
  color?: string;
  editing: boolean;
  full_desc: boolean;
  is_current: boolean;
  font_size: number;
  read_only: boolean;
  selected_hashtags: Map<string, any>;
  search_terms: Set<string>;
}

export const Description: React.FC<Props> = React.memo(
  ({
    actions,
    path,
    project_id,
    task_id,
    desc,
    color,
    editing,
    full_desc,
    is_current,
    font_size,
    read_only,
    selected_hashtags,
    search_terms,
  }) => {
    function edit() {
      actions?.edit_desc(task_id);
    }

    function render_editor() {
      if (!editing || actions == null || project_id == null || path == null) {
        return;
      }
      return (
        <div style={{ marginBottom: "5px" }}>
          <DescriptionEditor
            actions={actions}
            task_id={task_id}
            desc={desc}
            color={color}
            font_size={font_size}
          />
        </div>
      );
    }

    function render_desc() {
      if (editing) {
        return <></>;
      }
      return (
        <div onDoubleClick={edit}>
          <DescriptionRendered
            actions={actions}
            task_id={task_id}
            path={path}
            project_id={project_id}
            desc={desc}
            full_desc={full_desc}
            read_only={read_only}
            selected_hashtags={selected_hashtags}
            search_terms={search_terms}
            is_current={is_current}
          />
        </div>
      );
    }

    function render_edit_button() {
      if (!is_current || editing) {
        return;
      }
      return (
        <Button
          onClick={edit}
          style={{ margin: "5px 0" }}
          title={"Edit this task (double click or enter key)"}
        >
          <Icon name={"edit"} /> Edit
        </Button>
      );
    }

    if (read_only || actions == null) {
      return render_desc();
    }
    return (
      <div>
        {render_editor()}
        {render_desc()}
        {render_edit_button()}
      </div>
    );
  }
);
