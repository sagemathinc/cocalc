import { Button, Select } from "antd";
import { CSSProperties, ReactNode, useState } from "react";
import { keys } from "lodash";
import { is_array } from "@cocalc/util/misc";

const { Option } = Select;

interface Props {
  value?: string;
  defaultValue?: string;
  initialValue?: string;
  onChange: (string) => void;
  options: { [value: string]: ReactNode } | string[];
  style?: CSSProperties;
}

export default function SelectWithDefault({
  value,
  defaultValue,
  initialValue,
  onChange,
  options,
  style,
}: Props) {
  const [val, setVal] = useState<string>(
    value ?? initialValue ?? defaultValue ?? keys(options)[0] ?? ""
  );

  const v: ReactNode[] = [];
  if (is_array(options)) {
    // @ts-ignore
    for (const value of options) {
      v.push(
        <Option key={value} value={value}>
          {value}
        </Option>
      );
    }
  } else {
    for (const value in options) {
      v.push(
        <Option key={value} value={value}>
          {options[value]}
        </Option>
      );
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <Select
        showSearch
        value={val}
        onChange={(value) => {
          onChange(value);
          setVal(value);
        }}
        style={{ width: "30ex", maxWidth: "100%", ...style }}
      >
        {v}
      </Select>
      {defaultValue != null && (
        <Button
          type="dashed"
          disabled={(value ?? val) == defaultValue}
          style={{ marginLeft: "5px" }}
          onClick={() => {
            onChange(defaultValue);
            setVal(defaultValue);
          }}
        >
          {(value ?? val) == defaultValue ? (
            "Default"
          ) : (
            <>Changed from {is_array(options) ? defaultValue : options[defaultValue]}</>
          )}
        </Button>
      )}
    </div>
  );
}
