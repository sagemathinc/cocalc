import { useEffect, useRef, useState } from "react";
import { Input } from "antd";
import type { InputRef } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export default function RawInput({ prompt, password, actions, style }) {
  const frame = useFrameContext();
  const inputRef = useRef<InputRef>(null);
  const [value, setValue] = useState<string>("");
  useEffect(() => {
    inputRef.current?.focus({ cursor: "start" });
  }, []);

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
          (frame.actions as any).frame_actions[frame.id].enable_key_handler(
            true,
          );
        }, 1);
      }}
      onFocus={() => {
        (frame.actions as any).frame_actions[frame.id].disable_key_handler();
      }}
    />
  );
}
