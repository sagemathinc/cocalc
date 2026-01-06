/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Select, SelectProps } from "antd";
import { IS_MACOS } from "@cocalc/frontend/feature";

export type Hotkey =
  | "shift+shift"
  | "alt+shift+h"
  | "alt+shift+space"
  | "disabled";

export const DEFAULT_HOTKEY: Hotkey = "disabled";
export const DEFAULT_HOTKEY_DELAY_MS = 400;

interface HotkeySelectorProps
  extends Omit<SelectProps, "options" | "onChange"> {
  value?: Hotkey;
  onChange?: (hotkey: Hotkey) => void;
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
      value: "shift+shift" as Hotkey,
      label: "Shift, Shift (double tap)",
    },
    {
      value: "alt+shift+h" as Hotkey,
      label: `${altShiftH}`,
    },
    {
      value: "alt+shift+space" as Hotkey,
      label: `${altShiftSpace}`,
    },
    {
      value: DEFAULT_HOTKEY,
      label: "<disabled>",
    },
  ];

  return (
    <Select
      value={value ?? DEFAULT_HOTKEY}
      onChange={onChange}
      options={options}
      placeholder="Select hotkey..."
      popupMatchSelectWidth={false}
      {...props}
    />
  );
}
