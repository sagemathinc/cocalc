import { ReactNode, useEffect, useMemo, useState } from "react";
import { render, sorter, ANY } from "./register";
import { STATUSES } from "@cocalc/util/db-schema/crm";
import { Select, Tag } from "antd";
import { capitalize, cmp } from "@cocalc/util/misc";
import { blue, green, red, yellow } from "@ant-design/colors";
import { useEditableContext } from "./context";

const COLORS = [yellow[5], red[5], green[5], blue[5], "#888"] as any;

const _valueToNumber: { [value: string]: number } = {};
let n = 0;
const options: any[] = [];
const valueDisplay: { [value: string]: ReactNode } = {};
for (const value of STATUSES) {
  _valueToNumber[value] = n;
  const label = <StatusDisplay n={n} value={value} />;
  options.push({
    label,
    value: value,
  });
  valueDisplay[value] = label;
  n += 1;
}

function valueToNumber(value: string | undefined): number {
  if (value == null) return 0;
  return _valueToNumber[value] ?? 0;
}

function StatusDisplay({ value, n }) {
  if (n == -1) return null;
  return <Tag color={COLORS[n]}>{capitalize(value)}</Tag>;
}

render({ type: "select", options: ANY }, ({ field, obj, spec, viewOnly }) => {
  if (spec.type != "select") {
    throw Error("bug");
  }
  const { counter, save, error } = useEditableContext<string>(field);
  const [value, setValue] = useState<string>(obj[field] ?? STATUSES[0]);
  useEffect(() => {
    setValue(obj[field] ?? STATUSES[0]);
  }, [counter, obj[field]]);

  const n = valueToNumber(value);

  const set = useMemo(() => {
    return (n: number) => {
      setValue(STATUSES[n]);
      save(obj, STATUSES[n]);
    };
  }, [n]);

  return (
    <div style={{ width: "100%", display: "inline-block" }}>
      {viewOnly ? (
        valueDisplay[value]
      ) : (
        <Select
          disabled={!spec.editable}
          value={value}
          style={{ width: "112px", display: "inline-block" }}
          options={options}
          onChange={(value) => set(valueToNumber(value))}
        />
      )}
      {error}
    </div>
  );
});

sorter({ type: "select", options: ANY }, (a, b) =>
  cmp(valueToNumber(a), valueToNumber(b))
);
