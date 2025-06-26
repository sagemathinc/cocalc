/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input } from "antd";

import { LabeledRow } from "../../components";

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
}


// Note -- we disable all password manager autocomplete, since this is a component
// that's used internally in the app for configuration. See https://github.com/sagemathinc/cocalc/issues/6868

export function TextSetting(props: Props): React.JSX.Element {
  return (
    <LabeledRow
      label={props.label}
      style={props.disabled ? { color: "#666" } : undefined}
    >
      <Input
        value={props.value}
        onChange={props.onChange}
        onBlur={props.onBlur}
        onFocus={props.onFocus}
        onPressEnter={props.onPressEnter}
        maxLength={props.maxLength}
        disabled={props.disabled}
        autoComplete={"off"}
        data-lpignore="true"
        data-1p-ignore
      />
    </LabeledRow>
  );
}
