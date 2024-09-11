/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { LabeledRow, NumberInput } from "@cocalc/frontend/components";
import { useIntl } from "react-intl";

interface Props {
  font_size: number;
  on_change: (name: string, value: number) => void;
}

export function EditorSettingsFontSize(props: Props): JSX.Element {
  const intl = useIntl();

  return (
    <LabeledRow
      label={intl.formatMessage({
        id: "account.editor-settings.font-size.label",
        defaultMessage: "Default global font size",
      })}
      className="cc-account-prefs-font-size"
    >
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
