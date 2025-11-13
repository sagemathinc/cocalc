/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Task description:

 - displays description as markdown
 - allows for changing it
*/

import { Button, Popconfirm, Tooltip } from "antd";
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
  read_only?: boolean;
  selectedHashtags: Set<string>;
  searchWords?: string[];
  hideBody?: boolean;
  isDeleted?: boolean;
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
    isDeleted,
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
        <div onDoubleClick={edit} style={{ fontSize: font_size }}>
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
      if (isDeleted)
        return (
          <Button
            size="small"
            key="delete"
            disabled={read_only}
            onClick={() => actions?.undelete_task(task_id)}
          >
            <Icon name="trash" /> Undelete
          </Button>
        );

      return (
        <Button.Group>
          <Tooltip title="Edit this task (double click or enter key)">
            <Button size="small" type="link" onClick={edit}>
              <Icon name={"edit"} /> Edit
            </Button>
          </Tooltip>
          <Popconfirm
            title="Delete Task?"
            onConfirm={() => actions?.delete_task(task_id)}
          >
            <Button size="small" type="link" key="delete" disabled={read_only}>
              <Icon name="trash" /> Delete
            </Button>
          </Popconfirm>
        </Button.Group>
      );
    }

    if (read_only || actions == null) {
      return render_desc();
    }
    return (
      <div>
        {render_editor()}
        <div
          style={{
            position: "absolute",
            right: "25px",
            bottom: "-10px",
            background: "white",
            zIndex: 1,
          }}
        >
          {render_edit_button()}
        </div>
        {render_desc()}
      </div>
    );
  },
);
