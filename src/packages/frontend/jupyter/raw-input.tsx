import { useEffect, useRef, useState } from "react";
import { Input } from "antd";
import type { InputRef } from "antd";

export default function RawInput({ prompt, password, actions, style }) {
  const inputRef = useRef<InputRef>(null);
  const [value, setValue] = useState<string>("");
  useEffect(() => {
    inputRef.current?.focus({ cursor: "start" });
  }, []);

  const C = password ? Input.Password : Input;
  return (
    <C
      style={style}
      ref={inputRef}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      placeholder={prompt}
      onPressEnter={() => {
        actions.store.emit("stdin", value);
      }}
    />
  );
}
