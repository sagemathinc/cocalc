import { useEffect, useMemo, useState } from "react";
import { render, sorter } from "./register";
import { PRIORITIES } from "@cocalc/util/db-schema/crm";
import { Progress, Select } from "antd";
import { capitalize, cmp } from "@cocalc/util/misc";
import { blue, red, green, yellow } from "@ant-design/colors";
import { useEditableContext } from "./context";

const COLORS = [yellow[5], blue[5], green[5], red[5]] as any;

const _priorityToNumber: { [priority: string]: number } = {};
let n = 0;
const options: any[] = [];
for (const priority of PRIORITIES) {
  _priorityToNumber[priority] = n;
  options.push({
    label: <PriorityDisplay n={n} priority={priority} />,
    value: priority,
  });
  n += 1;
}

function priorityToNumber(priority: string | undefined): number {
  if (priority == null) return -1;
  return _priorityToNumber[priority] ?? -1;
}

function PriorityDisplay({ priority, n }) {
  if (n == -1) return null;
  return (
    <>
      <Progress
        style={{ marginRight: "5px" }}
        strokeColor={COLORS[n]}
        steps={PRIORITIES.length}
        showInfo={false}
        percent={(100 * (n + 1)) / PRIORITIES.length}
      />
      <span style={{ color: "#666" }}>{capitalize(priority)}</span>
    </>
  );
}

render({ type: "priority" }, ({ field, obj, spec }) => {
  if (spec.type != "priority") {
    throw Error("bug");
  }
  const { counter, save, error } = useEditableContext<string>(field);
  const [priority, setPriority] = useState<string | undefined>(obj[field]);
  useEffect(() => {
    setPriority(obj[field]);
  }, [counter]);

  const n = priorityToNumber(priority);

  const set = useMemo(() => {
    return (n: number) => {
      setPriority(PRIORITIES[n]);
      save(obj, PRIORITIES[n]);
    };
  }, [n]);

  return (
    <div style={{ width: "100%", display: "inline-block" }}>
      <Select
        allowClear
        disabled={!spec.editable}
        value={priority}
        style={{ width: "160px", display: "inline-block" }}
        options={options}
        onChange={(priority) => set(priorityToNumber(priority))}
      />
      {error}
    </div>
  );
});

sorter({ type: "priority" }, (a, b) =>
  cmp(priorityToNumber(a), priorityToNumber(b))
);
