/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Edit description of a single task
*/

import { React, useRef } from "../../app-framework";
import { TaskActions } from "./actions";
import { MarkdownInput } from "../markdown-input";

interface Props {
  actions: TaskActions;
  task_id: string;
  desc: string;
  font_size: number; // used only to cause refresh
  project_id: string;
  path: string;
}

export const DescriptionEditor: React.FC<Props> = React.memo(
  ({ actions, task_id, desc, font_size, project_id, path }) => {
    const submitMentionsRef = useRef<Function>();

    function done() {
      const value = submitMentionsRef.current?.();
      if (value != null) {
        actions.set_desc(task_id, value);
      }
      actions.enable_key_handler();
      actions.stop_editing_desc(task_id);
    }
    return (
      <MarkdownInput
        value={desc}
        project_id={project_id}
        path={path}
        onChange={(desc) => actions.set_desc(task_id, desc)}
        fontSize={font_size}
        onShiftEnter={done}
        onFocus={actions.disable_key_handler}
        onBlur={actions.enable_key_handler}
        enableUpload={true}
        enableMentions={true}
        submitMentionsRef={submitMentionsRef}
        height={"30vH"}
        placeholder={"Enter a description..."}
        lineWrapping={true}
        extraHelp={"Use #hashtags to easily label and filter your tasks."}
        autoFocus
      />
    );
  }
);
