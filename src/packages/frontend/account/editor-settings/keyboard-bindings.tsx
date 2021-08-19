/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { LabeledRow, SelectorInput } from "../../r_misc";

const EDITOR_BINDINGS = {
  standard: "Standard",
  sublime: "Sublime",
  vim: "Vim",
  emacs: "Emacs",
};

interface Props {
  bindings: string;
  on_change: (selected: string) => void;
}

export function EditorSettingsKeyboardBindings(props: Props): JSX.Element {
  return (
    <LabeledRow label="Editor keyboard bindings">
      <SelectorInput
        options={EDITOR_BINDINGS}
        selected={props.bindings}
        on_change={props.on_change}
      />
    </LabeledRow>
  );
}
