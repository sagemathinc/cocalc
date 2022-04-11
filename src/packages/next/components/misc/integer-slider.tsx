import { Button, Slider, InputNumber, Row, Col, Tag } from "antd";
import { useState } from "react";
import { COLORS as COLORS_THEME } from "@cocalc/util/theme";

interface Props {
  min: number;
  max: number;
  maxText?: number;
  value?: number;
  defaultValue?: number;
  initialValue?: number;
  onChange: (number) => void;
  units?: string;
  presets?: number[];
  disabled?: boolean;
  step?: number;
}

export default function IntegerSlider({
  value,
  onChange,
  min,
  max,
  maxText,
  defaultValue,
  initialValue,
  units,
  presets,
  disabled = false,
  step = 1,
}: Props) {
  function toNumber(x) {
    return typeof x === "number" ? x : min;
  }
  const [val, setVal] = useState<number>(
    value ?? initialValue ?? defaultValue ?? min
  );

  return (
    <>
      <Row>
        <Col span={12}>
          <Slider
            disabled={disabled}
            style={{ width: "100%" }}
            min={min}
            max={max}
            onChange={(x) => {
              onChange(x);
              setVal(x);
            }}
            value={value != null ? toNumber(value) : val}
            defaultValue={initialValue}
            step={step}
          />
        </Col>
        <Col span={12}>
          <InputNumber
            min={min}
            max={maxText ?? max}
            disabled={disabled}
            style={{
              marginLeft: "16px",
              marginBottom: "5px",
              minWidth: "8ex",
              width: "20ex",
            }}
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
              disabled={disabled || (value ?? val) == defaultValue}
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
      {presets && (
        <div>
          {presets.map((number) => (
            <Tag
              key={number}
              color={disabled ? COLORS_THEME.GRAY_LL : "blue"}
              style={{ cursor: disabled ? "not-allowed" : "pointer" }}
              onClick={() => {
                if (disabled) return;
                onChange(number);
                setVal(number);
              }}
            >
              {number}
            </Tag>
          ))}
        </div>
      )}
    </>
  );
}
