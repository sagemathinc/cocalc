import { useEffect, useMemo, useRef, useState } from "react";
import { render, sorter } from "./register";
import { PRIORITIES } from "@cocalc/util/db-schema/crm";
import { Button, Progress } from "antd";
import { capitalize, cmp } from "@cocalc/util/misc";
import { blue, red, green, yellow } from "@ant-design/colors";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import { useEditableContext } from "./context";

const COLORS = [green[5], blue[5], yellow[5], red[5]] as any;

const _priorityToNumber: { [priority: string]: number } = {};
let i = 0;
for (const priority of PRIORITIES) {
  _priorityToNumber[priority] = i;
  i += 1;
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

render({ type: "priority", editable: false }, ({ field, obj }) => {
  const priority = obj[field];
  if (priority == null) return null;
  const n = priorityToNumber(priority);
  if (n == -1) return null;

  return (
    <div style={{ width: "100%", display: "inline-block" }}>
      <PriorityDisplay priority={priority} n={n} />
    </div>
  );
});

render({ type: "priority", editable: true }, ({ field, obj }) => {
  const { counter, save, error } = useEditableContext<string>(field);
  const [priority, setPriority] = useState<string | undefined>(obj[field]);
  const lastSaveRef = useRef<number>(0);
  useEffect(() => {
    if (new Date().valueOf() - lastSaveRef.current <= 10000) {
      // ignore right after you save to avoid feedback.
      return;
    }
    setPriority(obj[field]);
  }, [counter]);

  const n = priorityToNumber(priority);

  const set = useMemo(() => {
    return (n: number) => {
      lastSaveRef.current = new Date().valueOf();
      setPriority(PRIORITIES[n]);
      save(obj, PRIORITIES[n]);
    };
  }, [n]);

  return (
    <div style={{ width: "100%", display: "inline-block" }}>
      <Button.Group style={{ fontSize: "8px" }}>
        <Button
          style={{ color: "#666" }}
          size="small"
          disabled={n <= -1}
          onClick={() => set(n - 1)}
          icon={<MinusOutlined />}
        />
        <Button
          style={{ color: "#666" }}
          size="small"
          disabled={n >= PRIORITIES.length - 1}
          onClick={() => set(n + 1)}
          icon={<PlusOutlined />}
        />
      </Button.Group>
      <PriorityDisplay priority={priority} n={n} />
      {error}
    </div>
  );
});

sorter({ type: "priority" }, (a, b) =>
  cmp(priorityToNumber(a), priorityToNumber(b))
);
