import { Slider, InputNumber, Row, Col } from "antd";
import { ReactNode } from "react";

interface Props {
  min: number;
  max: number;
  value: number;
  onChange: (number) => void;
}

export default function IntegerSlider({
  value,
  onChange,
  min,
  max,
}: Props) {
  function toNumber(x) {
    return typeof x === "number" ? x : min;
  }

  return (
    <Row>
      <Col span={12}>
        <Slider
          style={{ width: "100%" }}
          min={min}
          max={max}
          onChange={onChange}
          value={toNumber(value)}
        />
      </Col>
      <Col span={12}>
        <InputNumber
          min={min}
          max={max}
          style={{ marginLeft: "16px", minWidth:'8ex' }}
          value={value}
          onChange={(value) => {
            onChange(toNumber(value));
          }}
        />
      </Col>
    </Row>
  );
}
