/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Edit description of a single task
*/

import { Button } from "antd";
import { useCallback, useEffect, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { Icon } from "@cocalc/frontend/components/icon";
import { TaskActions } from "./actions";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";
import ColorPicker from "@cocalc/frontend/components/color-picker";

interface Props {
  actions: TaskActions;
  task_id: string;
  desc: string;
  font_size: number; // used only to cause refresh
  color?: string;
}

export default function DescriptionEditor({
  actions,
  task_id,
  desc,
  font_size,
  color,
}: Props) {
  const commit = useDebouncedCallback(() => {
    actions.commit();
  }, SAVE_DEBOUNCE_MS);

  const saveAndClose = useCallback(() => {
    actions.commit();
    actions.enable_key_handler();
    actions.stop_editing_desc(task_id);
  }, []);

  const getValueRef = useRef<any>(null);
  useEffect(() => {
    if (actions.syncdb == null) return;
    const beforeChange = () => {
      const desc = getValueRef.current();
      actions.set_desc(task_id, desc, false);
      commit();
    };
    actions.syncdb.on("before-change", beforeChange);
    return () => {
      actions.syncdb.removeListener("before-change", beforeChange);
    };
  }, []);

  return (
    <div style={{ border: "1px solid #40a9ff", padding: "5px 15px" }}>
      <MarkdownInput
        cacheId={task_id}
        value={desc}
        onChange={(desc) => {
          actions.set_desc(task_id, desc, false);
          commit();
        }}
        getValueRef={getValueRef}
        fontSize={font_size}
        onShiftEnter={saveAndClose}
        onFocus={actions.disable_key_handler}
        enableUpload={true}
        enableMentions={true}
        height={"auto"}
        placeholder={"Enter description..."}
        lineWrapping={true}
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
        minimal
        editBarStyle={{ marginBottom: "10px" }}
      />
      <ColorPicker
        toggle={<Button style={{ float: "right" }}>Color...</Button>}
        color={color}
        onChange={(color) => {
          actions.set_color(task_id, color);
          commit();
        }}
        style={{
          float: "right",
          border: "1px solid #ccc",
          padding: "15px",
          background: "white",
          marginBottom: "15px",
          boxShadow: "3px 3px 3px #ccc",
        }}
      />
      <Button onClick={saveAndClose} style={{ marginTop: "5px" }}>
        <Icon name="save" /> Save (Shift+Enter)
      </Button>
    </div>
  );
}
