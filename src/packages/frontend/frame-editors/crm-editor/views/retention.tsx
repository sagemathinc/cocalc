import { Tooltip } from "antd";
import { ReactNode, useMemo, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import RetentionConfig from "./retention/config";
import type { Data as RetentionData } from "./retention/update";
import { plural } from "@cocalc/util/misc";
import dayjs from "dayjs";
import { createColors, rgbHex } from "color-map";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import PlotActiveUsers from "./retention/plot-active-users";
import PlotRetention from "./retention/plot-retention";

export interface Retention {
  model: string;
  start: Date;
  stop: Date;
  period: string;
  dataEnd?: Date;
  display?: "table" | "line" | "bar";
}

export const DEFAULT_RETENTION = {
  model: "file_access_log",
  period: "1 day",
} as Retention;

interface Props {
  recordHeight?: number;
  retention: Retention;
  setRetention: (retention) => void;
}

export default function RetentionView({ retention, setRetention }: Props) {
  const all = useMemo(
    () => retention.model.endsWith(":all"),
    [retention.model],
  );
  const [retentionData, setRetentionData] = useState<RetentionData[] | null>(
    null,
  );
  const { size, period, startTimes } = useMemo(() => {
    let size = 0;
    for (const x of retentionData ?? []) {
      size += x?.size ?? 0;
    }
    if (
      retentionData == null ||
      retentionData.length == 0 ||
      retentionData[0] == null
    ) {
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

  const display = useMemo(() => retention.display ?? "table", [retention]);

  return (
    <div className="smc-vfill" style={{ height: "100%" }}>
      <RetentionConfig
        retention={retention}
        setRetention={setRetention}
        setData={setRetentionData}
      />
      {retentionData &&
        display != "table" &&
        retention.model.endsWith(":all") && (
          <PlotActiveUsers
            data={retentionData?.[0]}
            startTimes={startTimes}
            display={display}
          />
        )}
      {retentionData &&
        display != "table" &&
        !retention.model.endsWith(":all") && (
          <PlotRetention retentionData={retentionData} />
        )}
      {retentionData && display == "table" && (
        <TableVirtuoso
          overscan={500}
          style={{ height: "100%", overflow: "auto", flex: 1 }}
          totalCount={retentionData.length}
          itemContent={(index) => (
            <Row {...retentionData[index]} period={period} all={all} />
          )}
          fixedHeaderContent={() => (
            <Header
              size={size}
              period={period}
              startTimes={startTimes}
              all={all}
            />
          )}
        />
      )}
    </div>
  );
}

function Header({ size, period, startTimes, all }) {
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
          {all ? "Active Users" : "Active Users in Cohort"}
        </b>
        <div style={{ color: "#888" }}>{size} users</div>
      </td>
      {startTimes.map((t) => (
        <Tooltip
          overlayInnerStyle={{ width: "325px" }}
          mouseEnterDelay={0.5}
          key={t[0]}
          title={
            <>
              {dayjs(t[0]).format("dd MMM D, YYYY h:mm A")} -{" "}
              {dayjs(t[0].add(period, "milliseconds")).format(
                "dd MMM D, YYYY h:mm A",
              )}{" "}
              {all ? "all active users" : "first cohort active users"}
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
            {all && (
              <>
                <br />
                {dayjs(t[0]).format("dd M-DD")}
                <br />
                to
                <br />
                {dayjs(t[0]).add(period, "milliseconds").format("dd M-DD")}
              </>
            )}
          </td>
        </Tooltip>
      ))}
    </tr>
  );
}

function Row({ start, stop, size, active, period, all }) {
  const cols: ReactNode[] = [];
  if (active != null) {
    for (let i = 0; i < active.length; i++) {
      const n = active[i] ?? 0;
      cols.push(
        <Active
          all={all}
          key={i}
          n={n}
          size={size}
          tip={() => (
            <>
              {dayjs(start)
                .add(i * period, "milliseconds")
                .format("dd MMM D, YYYY h:mm A")}{" "}
              -{" "}
              {dayjs(start)
                .add((i + 1) * period, "milliseconds")
                .format("dd MMM D, YYYY h:mm A")}{" "}
              <br />
              {n} active {plural(n, "user")}
            </>
          )}
        />,
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
        {all ? (
          <b>All Users</b>
        ) : (
          <>
            <Tooltip
              mouseEnterDelay={0.5}
              title={
                <>
                  Cohort of users that created an account between{" "}
                  {dayjs(start).format("ddd MMM D, YYYY h:mm A")} and{" "}
                  {dayjs(stop).format("ddd MMM D, YYYY h:mm A")}
                </>
              }
            >
              <b>{dayjs(start).format("ddd MMM D, YYYY")}</b>
              <br />
              <div style={{ color: "#888" }}>{size} users</div>
            </Tooltip>
          </>
        )}
      </td>
      {cols}
    </>
  );
}

function Active({ n, size, tip, all }) {
  const s = n / Math.max(1, size);
  let content;
  if (all) {
    content = n;
  } else {
    const p = (s * 100).toFixed(2);
    content = `${parseFloat(p)}%`;
  }
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
      >
        {content}
      </td>
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
