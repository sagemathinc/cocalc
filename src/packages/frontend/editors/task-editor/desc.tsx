/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Task description:

 - displays description as markdown
 - allows for changing it
*/

import { Tooltip } from "antd";
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
  is_current: boolean;
  font_size: number;
  read_only: boolean;
  selectedHashtags: Set<string>;
  searchWords?: string[];
  hideBody?: boolean;
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
    is_current,
    font_size,
    read_only,
    selectedHashtags,
    searchWords,
    hideBody,
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
            desc={desc}
            read_only={read_only}
            selectedHashtags={selectedHashtags}
            searchWords={searchWords}
            is_current={is_current}
            hideBody={hideBody}
          />
        </div>
      );
    }

    function render_edit_button() {
      if (!is_current || editing) {
        return;
      }
      return (
        <Tooltip title="Edit this task (double click or enter key)">
          <Button onClick={edit} style={{ float: "right" }}>
            <Icon name={"edit"} /> Edit
          </Button>
        </Tooltip>
      );
    }

    if (read_only || actions == null) {
      return render_desc();
    }
    return (
      <div>
        {render_editor()}
        {render_edit_button()}
        {render_desc()}
      </div>
    );
  }
);
