import { useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { getTableDescription } from "../tables";
import RetentionConfig from "./retention/config";
import type { Data as RetentionData } from "./retention/update";

export interface Retention {
  model: string;
  start: Date;
  stop: Date;
  period: string;
  dataEnd?: Date;
}

const oneMonthAgo = new Date();
oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
oneMonthAgo.setUTCHours(0, 0, 0, 0);

const oneMonthAgoPlusDay = new Date(oneMonthAgo);
oneMonthAgoPlusDay.setUTCDate(oneMonthAgo.getUTCDate() + 1);

export const DEFAULT_RETENTION = {
  model: getTableDescription("crm_retention").retention?.models[0] ?? "",
  start: oneMonthAgo,
  stop: oneMonthAgoPlusDay,
  period: "1 day",
} as Retention;

interface Props {
  recordHeight?: number;
  retention: Retention;
  setRetention: (retention) => void;
  retentionDescription;
}

export default function RetentionView({
  recordHeight,
  retention,
  retentionDescription,
  setRetention,
}: Props) {
  const [retentionData, setRetentionData] = useState<RetentionData[] | null>(
    null
  );

  return (
    <div className="smc-vfill" style={{ height: "100%" }}>
      <RetentionConfig
        retention={retention}
        setRetention={setRetention}
        retentionDescription={retentionDescription}
        setData={setRetentionData}
      />
      {retentionData && (
        <TableVirtuoso
          overscan={500}
          style={{ height: "100%", overflow: "auto" }}
          totalCount={retentionData.length}
          itemContent={(index) => {
            //console.log("index = ", index, retentionData[index]);
            const { start, stop, size, active } = retentionData[index] ?? {};
            if (start == null) return null;
            return (
              <pre>
                {`${start.toLocaleString()}-${stop.toLocaleString()}`}, {size}
                {" users, "}
                {active
                  .map(toPercent(size))
                  .map((n) => `${parseFloat(n.toFixed(2))}%`)
                  .join(", ")}
              </pre>
            );
          }}
        />
      )}
    </div>
  );
}

function toPercent(size): (number) => number {
  return (n) => (100 * n) / Math.max(size, 1);
}
