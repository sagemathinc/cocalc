/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Edit description of a single task
*/

import { Button } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { Icon } from "@cocalc/frontend/components/icon";
import { TaskActions } from "./actions";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import { MAX_HEIGHT } from "./constants";
import { SimpleInputMerge } from "@cocalc/sync/editor/generic/simple-input-merge";

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
  const [localValue, setLocalValue] = useState(desc);
  const mergeHelperRef = useRef<SimpleInputMerge>(new SimpleInputMerge(desc));
  const commit0 = useCallback(() => {
    const desc = getValueRef.current();
    actions.set_desc(task_id, desc, true);
    mergeHelperRef.current.noteSaved(desc);
  }, [task_id]);
  const commit = useDebouncedCallback(commit0, SAVE_DEBOUNCE_MS);

  const saveAndClose = useCallback(() => {
    commit0();
    actions.enable_key_handler();
    actions.stop_editing_desc(task_id);
  }, []);

  const getValueRef = useRef<() => string>(() => "");

  // Reset merge helper when switching tasks.
  useEffect(() => {
    mergeHelperRef.current.reset(desc);
    setLocalValue(desc);
  }, [task_id]);

  // When a new desc value arrives (e.g., from remote), merge with the live buffer
  // to preserve uncommitted local edits.
  useEffect(() => {
    mergeHelperRef.current.handleRemote({
      remote: desc ?? "",
      getLocal: getValueRef.current,
      applyMerged: (v) => setLocalValue(v),
    });
  }, [desc]);

  return (
    <div>
      <MarkdownInput
        saveDebounceMs={SAVE_DEBOUNCE_MS}
        cacheId={task_id}
        value={localValue}
        onChange={(desc) => {
          setLocalValue(desc);
          commit();
        }}
        getValueRef={getValueRef}
        fontSize={font_size}
        onShiftEnter={saveAndClose}
        onFocus={actions.disable_key_handler}
        enableUpload={true}
        enableMentions={true}
        height={MAX_HEIGHT}
        placeholder={
          "Enter a description.  Use markdown with LaTeX.  Evaluate code blocks."
        }
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
        modeSwitchStyle={{
          float: "right",
          position: "relative",
        }}
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
      <Button
        onClick={saveAndClose}
        size="small"
        type="link"
        style={{ marginTop: "5px" }}
      >
        <Icon name="save" /> Done (shift+enter)
      </Button>
    </div>
  );
}
