import { Tooltip } from "antd";
import { useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { getTableDescription } from "../tables";
import RetentionConfig from "./retention/config";
import type { Data as RetentionData } from "./retention/update";
import { plural } from "@cocalc/util/misc";
import dayjs from "dayjs";

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
          itemContent={(index) => <Row {...retentionData[index]} />}
        />
      )}
    </div>
  );
}

function Row({ start, stop, size, active }) {
  return (
    <>
      <td
        style={{
          border: "1px solid #eee",
          padding: "5px 15px",
          height: "30px",
          minWidth: "250px",
        }}
      >
        <b>
          {dayjs(start).format("MMM D, YYYY")} -{" "}
          {dayjs(stop).format("MMM D, YYYY")}
        </b>
        <br />
        <div style={{ color: "#888" }}>{size} users</div>
      </td>
      {active.map((n) => (
        <Active n={n} size={size} />
      ))}
    </>
  );
}

function Active({ n, size }) {
  const s = n / Math.max(1, size);
  const p = (s * 100).toFixed(2);
  return (
    <Tooltip title={`${n} active ${plural(n, "user")}`} mouseEnterDelay={0.5}>
      <td
        style={{
          border: "1px solid #eee",
          padding: "0 5px",
          height: "30px",
          minWidth: "75px",
          textAlign: "center",
          backgroundColor: mapToPastelGreen(s),
        }}
      >{`${parseFloat(p)}%`}</td>
    </Tooltip>
  );
}

function mapToPastelGreen(value) {
  if (value < 0 || value > 1) {
    console.error("Value must be between 0 and 1.");
    return "white";
  }

  const minGreen = 240; // Light shade
  const maxGreen = 120; // Fairly dark shade
  const greenRange = minGreen - maxGreen;

  const red = Math.floor(150 + (100 - 150) * value);
  const green = Math.floor(minGreen - greenRange * value);
  const blue = Math.floor(150 + (50 - 150) * value);

  return `rgb(${red},${green},${blue})`;
}
