import { useEffect, useMemo, useRef, useState } from "react";
import { render, sorter } from "./register";
import { STATUSES } from "@cocalc/util/db-schema/crm";
import { Select, Tag } from "antd";
import { capitalize, cmp } from "@cocalc/util/misc";
import { blue, red, yellow } from "@ant-design/colors";
import { useEditableContext } from "./context";

const COLORS = [yellow[5], red[5], blue[5], "#888"] as any;

const _statusToNumber: { [status: string]: number } = {};
let n = 0;
const options: any[] = [];
for (const status of STATUSES) {
  _statusToNumber[status] = n;
  options.push({
    label: <StatusDisplay n={n} status={status} />,
    value: status,
  });
  n += 1;
}

function statusToNumber(status: string | undefined): number {
  if (status == null) return 0;
  return _statusToNumber[status] ?? 0;
}

function StatusDisplay({ status, n }) {
  if (n == -1) return null;
  return <Tag color={COLORS[n]}>{capitalize(status)}</Tag>;
}

render({ type: "status" }, ({ field, obj, spec }) => {
  if (spec.type != "status") {
    throw Error("bug");
  }
  const { counter, save, error } = useEditableContext<string>(field);
  const [status, setStatus] = useState<string>(obj[field] ?? STATUSES[0]);
  const lastSaveRef = useRef<number>(0);
  useEffect(() => {
    if (new Date().valueOf() - lastSaveRef.current <= 10000) {
      // ignore right after you save to avoid feedback.
      return;
    }
    setStatus(obj[field] ?? STATUSES[0]);
  }, [counter]);

  const n = statusToNumber(status);

  const set = useMemo(() => {
    return (n: number) => {
      lastSaveRef.current = new Date().valueOf();
      setStatus(STATUSES[n]);
      save(obj, STATUSES[n]);
    };
  }, [n]);

  return (
    <div style={{ width: "100%", display: "inline-block" }}>
      <Select
        disabled={!spec.editable}
        value={status}
        style={{ width: "112px", display: "inline-block" }}
        options={options}
        onChange={(status) => set(statusToNumber(status))}
      />
      {error}
    </div>
  );
});

sorter({ type: "status" }, (a, b) => cmp(statusToNumber(a), statusToNumber(b)));
