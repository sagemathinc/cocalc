import { render, sorter } from "./register";
import { PRIORITIES } from "@cocalc/util/db-schema/crm";
import { Progress } from "antd";
import { capitalize, cmp } from "@cocalc/util/misc";
import { blue, red, green, yellow } from "@ant-design/colors";

const COLORS = [green[5], blue[5], yellow[5], red[5]] as any;

const _priorityToNumber: { [priority: string]: number } = {};
let i = 1;
for (const priority of PRIORITIES) {
  _priorityToNumber[priority] = i;
  i += 1;
}

function priorityToNumber(priority: string): number {
  return _priorityToNumber[priority] ?? 0;
}

render({ type: "priority" }, ({ field, obj }) => {
  const priority = obj[field];
  if (priority == null) return null;
  const n = priorityToNumber(priority);
  if (n == 0) return null; // corrupt data

  return (
    <div style={{ width: "100%", display: "inline-block" }}>
      <Progress
        style={{ marginRight: "5px" }}
        strokeColor={COLORS[n - 1]}
        steps={PRIORITIES.length}
        showInfo={false}
        percent={(100 * n) / PRIORITIES.length}
      />
      <span style={{ color: "#666" }}>{capitalize(priority)}</span>
    </div>
  );
});

sorter({ type: "priority" }, (a, b) =>
  cmp(priorityToNumber(a), priorityToNumber(b))
);
