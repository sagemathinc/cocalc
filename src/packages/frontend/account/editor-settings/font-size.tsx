/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { LabeledRow, NumberInput } from "../../r_misc";

interface Props {
  font_size: number;
  on_change: (name: string, value: number) => void;
}

export function EditorSettingsFontSize(props: Props): JSX.Element {
  return (
    <LabeledRow label="Font Size" className="cc-account-prefs-font-size">
      <NumberInput
        on_change={(n) => props.on_change("font_size", n)}
        min={5}
        max={32}
        number={props.font_size}
        unit="px"
      />
    </LabeledRow>
  );
}
