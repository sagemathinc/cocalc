import { Button, Slider, InputNumber, Row, Col } from "antd";
import { useState } from "react";

interface Props {
  min: number;
  max: number;
  value?: number;
  defaultValue?: number;
  initialValue?: number;
  onChange: (number) => void;
  units?: string;
}

export default function IntegerSlider({
  value,
  onChange,
  min,
  max,
  defaultValue,
  initialValue,
  units,
}: Props) {
  function toNumber(x) {
    return typeof x === "number" ? x : min;
  }
  const [val, setVal] = useState<number>(value ?? initialValue ?? defaultValue ?? min);

  return (
    <Row>
      <Col span={12}>
        <Slider
          style={{ width: "100%" }}
          min={min}
          max={max}
          onChange={(x) => {
            onChange(x);
            setVal(x);
          }}
          value={value != null ? toNumber(value) : val}
          defaultValue={initialValue}
        />
      </Col>
      <Col span={12}>
        <InputNumber
          min={min}
          max={max}
          style={{ marginLeft: "16px", minWidth: "8ex", width: "20ex" }}
          defaultValue={initialValue}
          value={value ?? val}
          onChange={(value) => {
            onChange(toNumber(value));
            setVal(toNumber(value));
          }}
          addonAfter={units}
        />
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
            Default: {defaultValue}
          </Button>
        )}
      </Col>
    </Row>
  );
}
