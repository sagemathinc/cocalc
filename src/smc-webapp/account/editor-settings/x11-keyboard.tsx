/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { LabeledRow, Loading, SelectorInput } from "../../r_misc";
import { React } from "../../app-framework";
import { PHYSICAL_KEYBOARDS } from "../../frame-editors/x11-editor/xpra/keyboards";

interface PhysicalKeyboardProps {
  physical_keyboard: string;
  on_change: (selected: string) => void;
}

export function EditorSettingsPhysicalKeyboard(
  props: PhysicalKeyboardProps
): JSX.Element {
  if (props.physical_keyboard === "NO_DATA") {
    return <Loading />;
  } else {
    return (
      <LabeledRow label="Keyboard layout (for X11 Desktop)">
        <SelectorInput
          options={PHYSICAL_KEYBOARDS}
          selected={props.physical_keyboard}
          on_change={props.on_change}
        />
      </LabeledRow>
    );
  }
}

interface KeyboardVariantProps {
  keyboard_variant: string;
  on_change: (selected: string) => void;
  keyboard_variant_options: { value: string; display: string }[];
}

export function EditorSettingsKeyboardVariant(
  props: KeyboardVariantProps
): JSX.Element {
  if (props.keyboard_variant === "NO_DATA") {
    return <Loading />;
  } else {
    return (
      <LabeledRow label="Keyboard variant (for X11 Desktop)">
        <SelectorInput
          options={props.keyboard_variant_options}
          selected={props.keyboard_variant}
          on_change={props.on_change}
        />
      </LabeledRow>
    );
  }
}
