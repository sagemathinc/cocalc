import { ReactNode, useEffect, useMemo, useState } from "react";
import { render, sorter, ANY } from "./register";
import { Progress, Select, Tag, Space } from "antd";
import { capitalize, cmp } from "@cocalc/util/misc";
import { useEditableContext } from "./context";
import LRU from "lru-cache";

function StatusDisplay({ value, color, n }) {
  if (n == -1) return null;
  return <Tag color={color}>{capitalize(value)}</Tag>;
}

function PriorityDisplay({ value, color, n, len }) {
  if (n == -1) return null;
  return (
    <Space>
      <Progress
        style={{ marginRight: "5px" }}
        strokeColor={color}
        steps={len}
        showInfo={false}
        percent={(100 * (n + 1)) / len}
      />
      <div style={{ color: "#666" }}>{capitalize(value)}</div>
    </Space>
  );
}

const parseCache = new LRU<string, any>({ max: 50 });

function parse(spec) {
  const key = JSON.stringify(spec);
  if (parseCache.has(key)) {
    return parseCache.get(key);
  }
  if (spec.type != "select") {
    throw Error("bug");
  }
  const _valueToNumber: { [value: string]: number } = {};
  let n = 0;
  const options: any[] = [];
  const valueDisplay: { [value: string]: ReactNode } = {};
  for (const value of spec.options) {
    _valueToNumber[value] = n;
    const label = spec.priority ? (
      <PriorityDisplay
        n={n}
        value={value}
        color={spec.colors?.[n]}
        len={spec.options.length}
      />
    ) : (
      <StatusDisplay n={n} value={value} color={spec.colors?.[n]} />
    );
    options.push({
      label,
      value,
    });
    valueDisplay[value] = label;
    n += 1;
  }
  function valueToNumber(value: string | undefined): number {
    if (value == null) return 0;
    return _valueToNumber[value] ?? 0;
  }

  const x = { options, valueDisplay, valueToNumber };
  parseCache.set(key, x);
  return x;
}

render(
  { type: "select", options: ANY, colors: ANY, priority: ANY },
  ({ field, obj, spec, viewOnly }) => {
    if (spec.type != "select") {
      throw Error("bug");
    }
    const { options, valueDisplay, valueToNumber } = useMemo(
      () => parse(spec),
      [spec],
    );

    const { counter, save, error } = useEditableContext<string>(field);
    const [value, setValue] = useState<string | undefined>(obj[field]);
    useEffect(() => {
      setValue(obj[field]);
    }, [counter, obj[field]]);

    const n = valueToNumber(value);

    const set = useMemo(() => {
      return (n: number) => {
        setValue(spec.options[n]);
        save(obj, spec.options[n]);
      };
    }, [n]);

    return (
      <div
        style={{
          display: "inline-block",
        }}
      >
        {viewOnly ? (
          value == null ? (
            "(not set)"
          ) : (
            valueDisplay[value]
          )
        ) : (
          <Select
            style={{ minWidth: "200px" }}
            disabled={!spec.editable}
            value={value}
            options={options}
            onChange={(value) => set(valueToNumber(value))}
          />
        )}
        {error}
      </div>
    );
  },
);

sorter({ type: "select", options: ANY, colors: ANY, priority: ANY }, (spec) => {
  const { valueToNumber } = parse(spec);
  return (a, b) => cmp(valueToNumber(a), valueToNumber(b));
});
