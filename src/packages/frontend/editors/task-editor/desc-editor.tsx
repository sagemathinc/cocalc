/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Edit description of a single task
*/

import { Button } from "antd";
import React, { useRef } from "react";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { Icon } from "@cocalc/frontend/components/icon";
import { TaskActions } from "./actions";

interface Props {
  actions: TaskActions;
  task_id: string;
  desc: string;
  font_size: number; // used only to cause refresh
}

export const DescriptionEditor: React.FC<Props> = React.memo(
  ({ actions, task_id, desc, font_size }) => {
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
      <div>
        <MarkdownInput
          value={desc}
          onChange={(desc) => actions.set_desc(task_id, desc)}
          fontSize={font_size}
          onShiftEnter={done}
          onFocus={actions.disable_key_handler}
          enableUpload={true}
          enableMentions={true}
          submitMentionsRef={submitMentionsRef}
          height={"30vH"}
          placeholder={"Enter a description..."}
          lineWrapping={true}
          extraHelp={"Use #hashtags to easily label and filter your tasks."}
          autoFocus
        />
        <Button onClick={done} style={{ marginTop: "5px" }}>
          <Icon name="save" /> Save
        </Button>
      </div>
    );
  }
);
