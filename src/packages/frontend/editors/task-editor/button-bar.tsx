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
import { Button } from "antd";
import { Icon } from "../../components";
import { TaskActions } from "./actions";

interface Props {
  actions: TaskActions;
}

export const ButtonBar: React.FC<Props> = React.memo(({ actions }) => {
  function render_task_group() {
    return (
      <span key="task">
        <Button.Group>
          <Button key="font-increase" onClick={actions.export_to_markdown}>
            <Icon name="external-link" /> Export
          </Button>
        </Button.Group>
      </span>
    );
  }

  // the zIndex 1 and background white is so that when the description
  // of what is visible in the previous line flows around (for skinny display),
  // it is hidden.
  return (
    <div style={{ padding: "0px 5px 5px", zIndex: 1, background: "white" }}>
      {render_task_group()}
    </div>
  );
});
