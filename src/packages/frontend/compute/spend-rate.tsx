import { Tag } from "antd";
import { DynamicallyUpdatingRate } from "@cocalc/frontend/purchases/pay-as-you-go/dynamically-updating-cost";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useMemo } from "react";
import { toDecimal } from "@cocalc/util/money";

interface Props {
  project_id: string;
}

export default function SpendRate({ project_id }: Props) {
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const costPerHour = useMemo(() => {
    if (computeServers == null) {
      return 0;
    }
    let cost = toDecimal(0);
    for (const [_, server] of computeServers) {
      if (server.get("state", "deprovisioned") != "deprovisioned") {
        cost = cost.add(server.get("cost_per_hour") ?? 0);
      }
    }
    return cost.toNumber();
  }, [computeServers]);
  if (costPerHour <= 0) {
    return null;
  }

  return (
    <Tag
      color="green"
      style={{
        marginInlineEnd: 0,
        color: "#126bc5",
        padding: costPerHour >= 10 ? "0" : undefined,
      }}
    >
      <DynamicallyUpdatingRate
        alwaysNonnegative
        costPerHour={costPerHour}
        extraTip={<div>Data transfer not included.</div>}
      />
    </Tag>
  );
}
