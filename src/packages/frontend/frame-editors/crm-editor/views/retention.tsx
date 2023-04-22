import { Tooltip } from "antd";
import { ReactNode, useMemo, useState } from "react";
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

export const DEFAULT_RETENTION = {
  model: getTableDescription("crm_retention").retention?.models[0] ?? "",
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
  const { size, period, startTimes } = useMemo(() => {
    let size = 0;
    for (const x of retentionData ?? []) {
      size += x?.size ?? 0;
    }
    if (retentionData == null || retentionData.length == 0) {
      return { size: 0, period: 0, startTimes: [] };
    }
    const { start, active, last_start_time } = retentionData[0];
    const period =
      (last_start_time.valueOf() - start.valueOf()) /
      Math.max(1, active.length - 1);
    const startTimes: [dayjs.Dayjs, number][] = [];
    let t = dayjs(start);
    for (let n = 0; n < active.length; n++) {
      startTimes.push([t, n + 1]);
      t = t.add(period, "milliseconds");
    }
    return { size, period, startTimes };
  }, [retentionData]);

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
          itemContent={(index) => (
            <Row {...retentionData[index]} period={period} />
          )}
          fixedHeaderContent={() => (
            <Header size={size} period={period} startTimes={startTimes} />
          )}
        />
      )}
    </div>
  );
}

function Header({ size, period, startTimes }) {
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
              {dayjs(t[0]).format("MMM D, YYYY h:mm A")} -{" "}
              {dayjs(t[0].add(period, "milliseconds")).format(
                "MMM D, YYYY h:mm A"
              )}{" "}
              for first cohort
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
            Period {t[1]}
          </td>
        </Tooltip>
      ))}
    </tr>
  );
}

function Row({ start, stop, size, active, period }) {
  const cols: ReactNode[] = [];
  if (active != null) {
    for (let i = 0; i < active.length; i++) {
      const n = active[i] ?? 0;
      cols.push(
        <Active
          key={i}
          n={n}
          size={size}
          tip={() => (
            <>
              {dayjs(start)
                .add(i * period, "milliseconds")
                .format("MMM D, YYYY h:mm A")}{" "}
              -{" "}
              {dayjs(start)
                .add((i + 1) * period, "milliseconds")
                .format("MMM D, YYYY h:mm A")}{" "}
              <br />
              {n} active {plural(n, "user")}
            </>
          )}
        />
      );
    }
  }
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
      {cols}
    </>
  );
}

function Active({ n, size, tip }) {
  const s = n / Math.max(1, size);
  const p = (s * 100).toFixed(2);
  return (
    <Tooltip
      title={tip}
      mouseEnterDelay={0.5}
      overlayInnerStyle={{ width: "325px" }}
    >
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
