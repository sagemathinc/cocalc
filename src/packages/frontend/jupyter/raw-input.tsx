import { useEffect, useRef, useState } from "react";
import { Input } from "antd";
import type { InputRef } from "antd";
import type { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";

export default function RawInput({ prompt, password, actions, style }) {
  const inputRef = useRef<InputRef>(null);
  const [value, setValue] = useState<string>("");
  useEffect(() => {
    inputRef.current?.focus({ cursor: "start" });
  }, []);
  if (actions == null) {
    return null;
  }

  const C = password ? Input.Password : Input;
  return (
    <C
      allowClear
      style={style}
      ref={inputRef}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      placeholder={prompt}
      onPressEnter={() => {
        actions.store.emit("stdin", value);
        setTimeout(() => {
          const frame_actions = actions?.jupyterEditorActions?.frame_actions;
          if (frame_actions != null) {
            for (const a of Object.values(
              frame_actions,
            ) as NotebookFrameActions[]) {
              a.enable_key_handler(true);
            }
          }
        }, 1);
      }}
      onFocus={() => {
        const frame_actions = actions?.jupyterEditorActions?.frame_actions;
        if (frame_actions != null) {
          for (const a of Object.values(
            frame_actions,
          ) as NotebookFrameActions[]) {
            a.disable_key_handler();
          }
        }
      }}
    />
  );
}
