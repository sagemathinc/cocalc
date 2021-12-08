import { Button, Checkbox as AntdCheckbox, Space } from "antd";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  checked: boolean;
  defaultValue?: boolean;
  onChange: (boolean) => void;
}
export default function Checkbox({
  children,
  checked,
  defaultValue,
  onChange,
}: Props) {
  const check = (
    <AntdCheckbox
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    >
      {children}
    </AntdCheckbox>
  );
  if (defaultValue == null) return check;
  return (
    <Space>
      {check}{" "}
      <Button
        type="text"
        disabled={checked == defaultValue}
        style={{ marginLeft: "5px" }}
        onClick={() => onChange(defaultValue)}
      >
        ({defaultValue ? "default is checked" : "default is unchecked"})
      </Button>
    </Space>
  );
}
