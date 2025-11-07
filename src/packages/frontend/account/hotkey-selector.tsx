/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Select, SelectProps } from "antd";
import { IS_MACOS } from "@cocalc/frontend/feature";

export type HotkeyOption =
  | "shift+shift"
  | "alt+shift+h"
  | "alt+shift+space"
  | "disabled";

interface HotkeySelectorProps
  extends Omit<SelectProps, "options" | "onChange"> {
  value?: HotkeyOption;
  onChange?: (hotkey: HotkeyOption) => void;
}

/**
 * A selector for choosing the global hotkey to open quick navigation dialog
 */
export function HotkeySelector({
  value,
  onChange,
  ...props
}: HotkeySelectorProps) {
  const altShiftH = IS_MACOS ? "Cmd+Shift+H" : "Alt+Shift+H";
  const altShiftSpace = IS_MACOS ? "Cmd+Shift+Space" : "Alt+Shift+Space";

  const options = [
    {
      value: "shift+shift" as HotkeyOption,
      label: "Shift, Shift (double tap)",
    },
    {
      value: "alt+shift+h" as HotkeyOption,
      label: `${altShiftH}`,
    },
    {
      value: "alt+shift+space" as HotkeyOption,
      label: `${altShiftSpace}`,
    },
    {
      value: "disabled" as HotkeyOption,
      label: "<disabled>",
    },
  ];

  return (
    <Select
      value={value ?? "shift+shift"}
      onChange={onChange}
      options={options}
      placeholder="Select hotkey..."
      popupMatchSelectWidth={false}
      {...props}
    />
  );
}
