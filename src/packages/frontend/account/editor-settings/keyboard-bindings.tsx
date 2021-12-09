/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */


import { LabeledRow, SelectorInput } from "../../components";
import { EDITOR_BINDINGS } from "@cocalc/util/db-schema/accounts";

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
