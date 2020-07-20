/*
Button bar:

 - New        : make a new task
 - Up         : move task to the top of displayed tasks
 - Down       : move task to the bottom...
 - Delete     : delete a task

 - Save       : Save task list to disk
 - TimeTravel : Show edit history
 - Help       : Show help about the task editor (link to github wiki)
*/

import { React } from "../../app-framework";
import { ButtonGroup, Button } from "../../antd-bootstrap";
import { Icon, Space, UncommittedChanges } from "../../r_misc";
import { TaskActions } from "./actions";

interface Props {
  actions: TaskActions;
  read_only: boolean;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  current_task_id: string;
  current_task_is_deleted: boolean;
}

export const ButtonBar: React.FC<Props> = React.memo(
  ({
    actions,
    read_only,
    has_unsaved_changes,
    has_uncommitted_changes,
    current_task_id,
    current_task_is_deleted,
  }) => {
    function render_task_group() {
      const spacer = <span style={{ marginLeft: "5px" }} />;
      return (
        <span key="task">
          <ButtonGroup>
            <Button key="new" onClick={actions.new_task} disabled={read_only}>
              <Icon name="plus-circle" /> New
            </Button>
            {render_delete()}
          </ButtonGroup>
          {spacer}
          <ButtonGroup>
            <Button key="undo" onClick={actions.undo} disabled={read_only}>
              <Icon name="undo" /> Undo
            </Button>
            <Button key="redo" onClick={actions.redo} disabled={read_only}>
              <Icon name="repeat" /> Redo
            </Button>
          </ButtonGroup>
          {spacer}
          <ButtonGroup>
            <Button key="font-increase" onClick={actions.decrease_font_size}>
              <Icon style={{ fontSize: "7pt" }} name="font" />
            </Button>
            <Button key="font-decrease" onClick={actions.increase_font_size}>
              <Icon style={{ fontSize: "10pt" }} name="font" />
            </Button>
          </ButtonGroup>
        </span>
      );
    }

    function render_undelete_button() {
      return (
        <Button
          key="delete"
          disabled={!current_task_id || read_only}
          onClick={actions.undelete_current_task}
        >
          <Icon name="trash-o" /> Undelete Task
        </Button>
      );
    }

    function render_delete() {
      if (current_task_is_deleted) {
        return render_undelete_button();
      } else {
        return render_delete_button();
      }
    }

    function render_delete_button() {
      return (
        <Button
          key="delete"
          disabled={!current_task_id || read_only}
          onClick={actions.delete_current_task}
        >
          <Icon name="trash-o" /> Delete
        </Button>
      );
    }

    function render_help() {
      return (
        <Button key="help" bsStyle="info" onClick={actions.help}>
          <Icon name="question-circle" /> Help
        </Button>
      );
    }

    function render_editor_group() {
      return (
        <ButtonGroup key="editor">
          <Button
            key="save"
            bsStyle="success"
            disabled={!has_unsaved_changes || read_only}
            onClick={actions.save}
          >
            <Icon name="save" /> {read_only ? "Readonly" : "Save"}
            <UncommittedChanges
              has_uncommitted_changes={has_uncommitted_changes}
            />
          </Button>
          <Button key="timetravel" bsStyle="info" onClick={actions.time_travel}>
            <Icon name="history" /> TimeTravel
          </Button>
        </ButtonGroup>
      );
    }

    // the zIndex 1 and background white is so that when the description
    // of what is visible in the previous line flows around (for skinny display),
    // it is hidden.
    return (
      <div style={{ padding: "0px 5px 5px", zIndex: 1, background: "white" }}>
        {render_editor_group()}
        <Space />
        {render_task_group()}
        <Space />
        {render_help()}
      </div>
    );
  }
);
