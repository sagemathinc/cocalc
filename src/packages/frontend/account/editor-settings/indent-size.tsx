/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";
import { InputNumber } from "antd";
import { LabeledRow } from "@cocalc/frontend/components";

interface Props {
  tab_size: number;
  on_change: (name: string, value: number) => void;
}

export function EditorSettingsIndentSize(props: Props): React.JSX.Element {
  const intl = useIntl();

  return (
    <LabeledRow
      label={intl.formatMessage({
        id: "account.editor-settings.indent-size.label",
        defaultMessage: "Indent size",
      })}
    >
      <InputNumber
        onChange={(n) => props.on_change("tab_size", n ?? 10)}
        min={2}
        max={32}
        value={props.tab_size}
        addonAfter="spaces"
      />
    </LabeledRow>
  );
}
