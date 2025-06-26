/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";
import { InputNumber } from "antd";
import { LabeledRow } from "@cocalc/frontend/components";

interface Props {
  autosave: number;
  on_change: (string, number) => void;
}

export function EditorSettingsAutosaveInterval(props: Props): React.JSX.Element {
  const intl = useIntl();

  return (
    <LabeledRow
      label={intl.formatMessage({
        id: "account.editor-settings-autosave-interval.label",
        defaultMessage: "Autosave interval",
      })}
    >
      <InputNumber
        onChange={(n) => props.on_change("autosave", n)}
        min={15}
        max={900}
        value={props.autosave}
        addonAfter="seconds"
      />
    </LabeledRow>
  );
}
