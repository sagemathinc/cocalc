import { Input } from "antd";
import { React } from "../../app-framework";
import { LabeledRow } from "../../r_misc";

// in a grid:   Title [text input]
interface Props {
  label: string;
  value?: string;
  onChange: (e) => void;
  onBlur?: (e) => void;
  maxLength?: number;
  disabled?: boolean;
}

export function TextSetting(props: Props): JSX.Element {
  return (
    <LabeledRow
      label={props.label}
      style={props.disabled ? { color: "#666" } : undefined}
    >
      <Input
        value={props.value}
        onChange={props.onChange}
        onBlur={props.onBlur}
        maxLength={props.maxLength}
        disabled={props.disabled}
      />
    </LabeledRow>
  );
}
