import { useEffect, useState } from "react";
import { capitalize, is_object } from "@cocalc/util/misc";
import { Button, DatePicker, InputNumber, Select, Space } from "antd";
import dayjs from "dayjs";
import { SUPPORTED_TIME_UNITS } from "@cocalc/util/schema";

function valueToMode(value): "absolute" | "relative" {
  return is_object(value) && value["relative_time"] != null
    ? "relative"
    : "absolute";
}

export default function TimeValue({ value, onChange }) {
  const [mode, setMode] = useState<"absolute" | "relative">(valueToMode(value));
  useEffect(() => {
    setMode(valueToMode(value));
  }, [value]);

  return (
    <Space>
      {mode == "absolute" && (
        <DatePicker
          style={{ width: "190px" }}
          showTime
          defaultValue={dayjs(value)}
          onChange={(x) => onChange(x?.toISOString())}
          onOk={(x) => onChange(x?.toISOString())}
        />
      )}
      {mode == "relative" && (
        <InputNumber
          style={{ width: "100px" }}
          defaultValue={-value?.relative_time}
          onChange={(x) => {
            if (x == null) {
              onChange({ relative_time: -1, unit: value?.["unit"] ?? "hours" });
            } else {
              onChange({
                relative_time: -x,
                unit: value?.["unit"] ?? "hours",
              });
            }
          }}
          step={1}
        />
      )}
      {mode == "relative" && (
        <SelectTimeUnit
          value={value?.["unit"]}
          onChange={(unit) => {
            onChange({ relative_time: value?.relative_time ?? -1, unit });
          }}
        />
      )}
      <Button
        type="text"
        onClick={() => {
          if (mode == "absolute") {
            // switch it to be relative
            onChange({ relative_time: -1, unit: "hours" });
          } else {
            // switch it to be absolute
            onChange(undefined);
          }
        }}
      >
        {mode}
      </Button>
    </Space>
  );
}

function SelectTimeUnit({ value, onChange }) {
  const unitOptions = SUPPORTED_TIME_UNITS.map((unit) => {
    return { value: unit, label: `${capitalize(unit)} ago` };
  });
  return (
    <Select
      value={value}
      options={unitOptions}
      onChange={onChange}
      style={{ width: "130px" }}
    />
  );
}
