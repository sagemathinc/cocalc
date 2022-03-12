/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Edit description of a single task
*/

import { Button } from "antd";
import { useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { Icon } from "@cocalc/frontend/components/icon";
import { TaskActions } from "./actions";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";

interface Props {
  actions: TaskActions;
  task_id: string;
  desc: string;
  font_size: number; // used only to cause refresh
}

export default function DescriptionEditor({
  actions,
  task_id,
  desc,
  font_size,
}: Props) {
  const commit = useDebouncedCallback(() => {
    actions.commit();
  }, SAVE_DEBOUNCE_MS);

  const saveAndClose = useCallback(() => {
    actions.commit();
    actions.enable_key_handler();
    actions.stop_editing_desc(task_id);
  }, []);

  return (
    <div>
      <MarkdownInput
        cacheId={task_id}
        value={desc}
        onChange={(desc) => {
          actions.set_desc(task_id, desc, false);
          commit();
        }}
        fontSize={font_size}
        onShiftEnter={saveAndClose}
        onFocus={actions.disable_key_handler}
        enableUpload={true}
        enableMentions={true}
        height={"auto"}
        placeholder={"Enter a description..."}
        lineWrapping={true}
        hideHelp
        autoFocus
        onSave={() => {
          actions.save();
        }}
        onUndo={() => {
          actions.undo();
        }}
        onRedo={() => {
          actions.redo();
        }}
      />
      <Button onClick={saveAndClose} style={{ marginTop: "5px" }}>
        <Icon name="save" /> Save (Shift+Enter)
      </Button>
    </div>
  );
}
