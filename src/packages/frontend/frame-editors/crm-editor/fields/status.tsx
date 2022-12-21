import { ReactNode, useEffect, useMemo, useState } from "react";
import { render, sorter } from "./register";
import { STATUSES } from "@cocalc/util/db-schema/crm";
import { Select, Tag } from "antd";
import { capitalize, cmp } from "@cocalc/util/misc";
import { blue, green, red, yellow } from "@ant-design/colors";
import { useEditableContext } from "./context";

const COLORS = [yellow[5], red[5], green[5], blue[5], "#888"] as any;

const _statusToNumber: { [status: string]: number } = {};
let n = 0;
const options: any[] = [];
const statusDisplay: { [status: string]: ReactNode } = {};
for (const status of STATUSES) {
  _statusToNumber[status] = n;
  const label = <StatusDisplay n={n} status={status} />;
  options.push({
    label,
    value: status,
  });
  statusDisplay[status] = label;
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

render({ type: "status" }, ({ field, obj, spec, viewOnly }) => {
  if (spec.type != "status") {
    throw Error("bug");
  }
  const { counter, save, error } = useEditableContext<string>(field);
  const [status, setStatus] = useState<string>(obj[field] ?? STATUSES[0]);
  useEffect(() => {
    setStatus(obj[field] ?? STATUSES[0]);
  }, [counter]);

  const n = statusToNumber(status);

  const set = useMemo(() => {
    return (n: number) => {
      setStatus(STATUSES[n]);
      save(obj, STATUSES[n]);
    };
  }, [n]);

  return (
    <div style={{ width: "100%", display: "inline-block" }}>
      {viewOnly ? (
        statusDisplay[status]
      ) : (
        <Select
          disabled={!spec.editable}
          value={status}
          style={{ width: "112px", display: "inline-block" }}
          options={options}
          onChange={(status) => set(statusToNumber(status))}
        />
      )}
      {error}
    </div>
  );
});

sorter({ type: "status" }, (a, b) => cmp(statusToNumber(a), statusToNumber(b)));
