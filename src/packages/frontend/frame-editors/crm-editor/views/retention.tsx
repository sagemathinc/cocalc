import { Tooltip } from "antd";
import { useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { getTableDescription } from "../tables";
import RetentionConfig from "./retention/config";
import type { Data as RetentionData } from "./retention/update";
import { plural } from "@cocalc/util/misc";
import dayjs from "dayjs";
import { createColors, rgbHex } from "color-map";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

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
          fixedHeaderContent={() => <Header retentionData={retentionData} />}
        />
      )}
    </div>
  );
}

function Header({ retentionData }) {
  let size = 0;
  for (const x of retentionData) {
    size += x?.size ?? 0;
  }
  if (retentionData.length == 0) return null;
  const { start, active, last_start_time } = retentionData[0];
  const period = (last_start_time - start) / Math.max(1, active.length - 1);
  const startTimes: dayjs.Dayjs[] = [];
  let t = dayjs(start);
  for (let n = 0; n < active.length; n++) {
    startTimes.push(t);
    t = t.add(period, "milliseconds");
  }
  return (
    <tr style={{ background: "white" }}>
      <td
        style={{
          padding: "5px 15px",
          border: "1px solid #eee",
          minWidth: "250px",
        }}
      >
        <b
          style={{
            fontSize: "15pt",
          }}
        >
          User Retention
        </b>
        <div style={{ color: "#888" }}>{size} users</div>
      </td>
      {startTimes.map((t) => (
        <Tooltip
          title={
            <>
              {dayjs(t).format("MMM D, YYYY h:mm A")} -{" "}
              {dayjs(t.add(period, "milliseconds")).format(
                "MMM D, YYYY h:mm A"
              )}
            </>
          }
        >
          <td
            style={{
              background: "#fafafa",
              border: "1px solid #eee",
              padding: "0 5px",
              textAlign: "center",
            }}
          >
            {t.format("MMM D, YYYY")}
          </td>
        </Tooltip>
      ))}
    </tr>
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
          ...getColorStyle(s),
        }}
      >{`${parseFloat(p)}%`}</td>
    </Tooltip>
  );
}

const COLORS = createColors([206, 221, 248], [26, 56, 168], 101);

function getColorStyle(value) {
  if (value < 0) value = 0;
  if (value > 1) value = 1;
  value = Math.min(1, 3 * value); // spread out since smaller values sadly all too common.
  const backgroundColor = rgbHex(COLORS[Math.round(value * 100)]);
  return { backgroundColor, color: avatar_fontcolor(backgroundColor) };
}
