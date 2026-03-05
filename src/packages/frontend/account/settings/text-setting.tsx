/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input } from "antd";

import { COLORS } from "@cocalc/util/theme";

import { LabeledRow } from "@cocalc/frontend/components";

// in a grid:   Title [text input]
interface Props {
  label: string;
  value?: string;
  onChange: (e) => void;
  onBlur?: (e) => void;
  onFocus?: () => void;
  onPressEnter?: (e) => void;
  maxLength?: number;
  disabled?: boolean;
  title?: string; // tooltip text
}

// Note -- we disable all password manager autocomplete, since this is a component
// that's used internally in the app for configuration. See https://github.com/sagemathinc/cocalc/issues/6868

export function TextSetting(props: Props): React.JSX.Element {
  return (
    <LabeledRow
      label={props.label}
      style={props.disabled ? { color: COLORS.GRAY_M } : undefined}
    >
      <Input
        value={props.value}
        onChange={props.onChange}
        onBlur={props.onBlur}
        onFocus={props.onFocus}
        onPressEnter={props.onPressEnter}
        maxLength={props.maxLength}
        disabled={props.disabled}
        title={props.title}
        autoComplete={"off"}
        data-lpignore="true"
        data-1p-ignore
      />
    </LabeledRow>
  );
}
