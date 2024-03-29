import { ReactNode, useMemo } from "react";
import { Calendar, Popover } from "antd";
import dayjs from "dayjs";
import * as gallery from "./gallery";
import type { ColumnsType } from "../fields";

interface Props {
  timeField?: string;
  rowKey: string;
  data: object[];
  columns: ColumnsType[];
}

export default function CalendarData({
  timeField = "last_edited",
  rowKey,
  data,
  columns,
}: Props) {
  const { monthCellRender, dateCellRender } = useMemo(() => {
    const monthToData: { [year_month: string]: object[] } = {};
    const dateToData: { [year_month_day: string]: object[] } = {};
    for (const e of data) {
      const time = e[timeField];
      if (time == null) continue;
      const year_month_day = toYearMonthDay(time);
      if (dateToData[year_month_day] == null) {
        dateToData[year_month_day] = [e];
      } else {
        dateToData[year_month_day].push(e);
      }
      const i = year_month_day.lastIndexOf("-");
      const year_month = year_month_day.slice(0, i);
      if (monthToData[year_month] == null) {
        monthToData[year_month] = [e];
      } else {
        monthToData[year_month].push(e);
      }
    }

    const monthCellRender = (time: dayjs.Dayjs) => {
      return (
        <DataList
          data={monthToData[toYearMonth(time)]}
          columns={columns}
          rowKey={rowKey}
        />
      );
    };
    const dateCellRender = (time: dayjs.Dayjs) => {
      return (
        <DataList
          data={dateToData[toYearMonthDay(time)]}
          columns={columns}
          rowKey={rowKey}
        />
      );
    };
    return { monthCellRender, dateCellRender };
  }, [data, timeField]);

  return (
    <Calendar
      dateCellRender={dateCellRender}
      monthCellRender={monthCellRender}
    />
  );
}

function toYearMonth(time): string {
  const d = dayjs(time);
  return `${d.year()}-${d.month()}`;
}

function toYearMonthDay(time): string {
  const d = dayjs(time);
  return `${d.year()}-${d.month()}-${d.date()}`;
}

function DataList({ data, columns, rowKey }) {
  if (data == null) return null;
  const v: ReactNode[] = [];
  for (const elt of data) {
    const c = columns[0];
    const x = <gallery.Data noTitle elt={elt} columns={[c]} />;
    v.push(
      <Popover
        key={elt[rowKey]}
        trigger="click"
        content={() => (
          <gallery.OneCard
            elt={elt}
            columns={columns.slice(1)}
            rowKey={rowKey}
          />
        )}
        title={x}
      >
        <div
          style={{
            border: "1px solid #eee",
            margin: "2.5px",
            padding: "5px",
            background: "white",
            borderRadius: "3px",
          }}
        >
          {x}
        </div>
      </Popover>
    );
  }
  return <div>{v}</div>;
}
