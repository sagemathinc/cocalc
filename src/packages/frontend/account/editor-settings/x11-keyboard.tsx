/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

import {
  LabeledRow,
  Loading,
  SelectorInput,
} from "@cocalc/frontend/components";
import { PHYSICAL_KEYBOARDS } from "@cocalc/frontend/frame-editors/x11-editor/xpra/keyboards";

interface PhysicalKeyboardProps {
  physical_keyboard: string;
  on_change: (selected: string) => void;
}

export function EditorSettingsPhysicalKeyboard(
  props: PhysicalKeyboardProps,
): React.JSX.Element {
  const intl = useIntl();

  if (props.physical_keyboard === "NO_DATA") {
    return <Loading />;
  } else {
    const label = intl.formatMessage({
      id: "account.editor-settings.x11-physical-keyboard.label",
      defaultMessage: "Keyboard layout (for X11 Desktop)",
    });

    return (
      <LabeledRow label={label}>
        <SelectorInput
          options={PHYSICAL_KEYBOARDS}
          selected={props.physical_keyboard}
          on_change={props.on_change}
          showSearch={true}
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
  props: KeyboardVariantProps,
): React.JSX.Element {
  const intl = useIntl();

  if (props.keyboard_variant === "NO_DATA") {
    return <Loading />;
  } else {
    const label = intl.formatMessage({
      id: "account.editor-settings.x11-keyboard-variant.label",
      defaultMessage: "Keyboard variant (for X11 Desktop)",
    });

    return (
      <LabeledRow label={label}>
        <SelectorInput
          options={props.keyboard_variant_options}
          selected={props.keyboard_variant}
          on_change={props.on_change}
          showSearch={true}
        />
      </LabeledRow>
    );
  }
}
