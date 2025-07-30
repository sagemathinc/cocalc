/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Search input box with the following capabilities
   a clear button (that focuses the input)
   - `enter` to submit
   - `esc` to clear
*/

import { Input, InputRef } from "antd";
import { CSSProperties, useEffect, useRef, useState } from "react";

interface Props {
  size?;
  default_value?: string;
  value?: string;
  on_change?: (value: string, opts: { ctrl_down: boolean }) => void;
  on_clear?: () => void;
  on_submit?: (value: string, opts: { ctrl_down: boolean }) => void;
  buttonAfter?;
  disabled?: boolean;
  clear_on_submit?: boolean;
  on_down?: () => void;
  on_up?: () => void;
  on_escape?: (value: string) => void;
  style?: CSSProperties;
  autoFocus?: boolean;
  autoSelect?: boolean;
  placeholder?: string;
  focus?; // if this changes, focus the search box.
  status?: "warning" | "error";
}

export function SearchInput({
  size,
  default_value,
  value: value0,
  on_change,
  on_clear,
  on_submit,
  buttonAfter,
  disabled,
  clear_on_submit,
  on_down,
  on_up,
  on_escape,
  style,
  autoFocus,
  autoSelect,
  placeholder,
  focus,
  status,
}: Props) {
  const [value, setValue] = useState<string>(value0 ?? default_value ?? "");
  // if value changes, we update as well!
  useEffect(() => setValue(value ?? ""), [value]);

  const [ctrl_down, set_ctrl_down] = useState<boolean>(false);
  const [shift_down, set_shift_down] = useState<boolean>(false);

  const input_ref = useRef<InputRef>(null);

  useEffect(() => {
    if (autoSelect && input_ref.current) {
      try {
        input_ref.current?.select();
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (focus == null) return;
    input_ref.current?.focus();
  }, [focus]);

  function get_opts(): { ctrl_down: boolean; shift_down: boolean } {
    return { ctrl_down, shift_down };
  }

  function clear_value(): void {
    setValue("");
    on_change?.("", get_opts());
    on_clear?.();
  }

  function submit(e?): void {
    if (e != null) {
      e.preventDefault();
    }
    if (typeof on_submit === "function") {
      on_submit(value, get_opts());
    }
    if (clear_on_submit) {
      clear_value();
      on_change?.(value, get_opts());
    }
  }

  function key_down(e): void {
    switch (e.keyCode) {
      case 27:
        escape();
        break;
      case 40:
        on_down?.();
        break;
      case 38:
        on_up?.();
        break;
      case 17:
        set_ctrl_down(true);
        break;
      case 16:
        set_shift_down(true);
        break;
      case 13:
        submit();
        break;
    }
  }

  function key_up(e): void {
    switch (e.keyCode) {
      case 17:
        set_ctrl_down(false);
        break;
    }
  }

  function escape(): void {
    if (typeof on_escape === "function") {
      on_escape(value);
    }
    clear_value();
  }

  return (
    <Input.Search
      size={size}
      allowClear
      style={{ minWidth: "150px", ...style }}
      cocalc-test="search-input"
      autoFocus={autoFocus}
      ref={input_ref}
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        e.preventDefault();
        const value = e.target?.value ?? "";
        setValue(value);
        on_change?.(value, get_opts());
        if (!value) clear_value();
      }}
      onKeyDown={key_down}
      onKeyUp={key_up}
      disabled={disabled}
      enterButton={buttonAfter}
      status={status}
    />
  );
}
