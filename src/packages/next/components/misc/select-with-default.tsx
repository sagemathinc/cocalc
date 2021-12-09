import { Button, Select, Space } from "antd";
import { CSSProperties, ReactNode, useState } from "react";
import { keys } from "lodash";

const { Option } = Select;

interface Props {
  value?: string;
  defaultValue?: string;
  initialValue?: string;
  onChange: (string) => void;
  options: { [value: string]: ReactNode };
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
  for (const value in options) {
    v.push(<Option value={value}>{options[value]}</Option>);
  }

  return (
    <Space style={{ width: "100%" }}>
      <Select
        showSearch
        value={val}
        onChange={(value) => {
          onChange(value);
          setVal(value);
        }}
        style={{ width: "40ex", maxWidth: "100%", ...style }}
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
            <>Changed from {options[defaultValue]}</>
          )}
        </Button>
      )}
    </Space>
  );
}
