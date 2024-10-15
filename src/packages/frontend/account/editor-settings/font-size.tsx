/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { InputNumber } from "antd";
import { LabeledRow } from "@cocalc/frontend/components";
import { useIntl } from "react-intl";

interface Props {
  font_size: number;
  on_change: (name: string, value: number) => void;
}

export function EditorSettingsFontSize(props: Props) {
  const intl = useIntl();

  return (
    <LabeledRow
      label={intl.formatMessage({
        id: "account.editor-settings.font-size.label",
        defaultMessage: "Default global font size",
      })}
      className="cc-account-prefs-font-size"
    >
      <InputNumber
        onChange={(n) => props.on_change("font_size", n ?? 14)}
        min={5}
        max={32}
        value={props.font_size}
        addonAfter="px"
      />
    </LabeledRow>
  );
}
