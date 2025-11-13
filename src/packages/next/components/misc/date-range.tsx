/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { DatePicker } from "antd";
import dayjs from "dayjs";
import { CSSProperties, useState } from "react";
import { DateRangeType, Date0 } from "@cocalc/util/types/store";

interface Props {
  onChange?: (x: DateRangeType) => void;
  style?: CSSProperties;
  noPast?: boolean; // if true, don't allow dates in the past
  maxDaysInFuture?: number; // don't allow dates this far in the future from now
  disabled?: boolean;
  initialValues?: DateRangeType;
  suffix?: string;
}

export default function DateRange(props: Props) {
  const {
    onChange,
    style,
    noPast,
    maxDaysInFuture,
    disabled = false,
    initialValues = [undefined, undefined],
    suffix,
  } = props;

  const [dateRange, setDateRange] = useState<DateRangeType>(initialValues);

  const presets = [
    { label: "Day", value: [dayjs(), dayjs().add(1, "day")] },
    { label: "Week", value: [dayjs(), dayjs().add(1, "week")] },
    { label: "Month", value: [dayjs(), dayjs().add(1, "month")] },
    { label: "Year", value: [dayjs(), dayjs().add(1, "year")] },
    {
      label: "+ Hour",
      value: [dayjs(dateRange[0]), dayjs(dateRange[0]).add(1, "hour")],
    },
    {
      label: "+ Day",
      value: [dayjs(dateRange[0]), dayjs(dateRange[0]).add(1, "day")],
    },
    {
      label: "+ Week",
      value: [dayjs(dateRange[0]), dayjs(dateRange[0]).add(1, "week")],
    },
    {
      label: "+ Month",
      value: [dayjs(dateRange[0]), dayjs(dateRange[0]).add(1, "month")],
    },
    {
      label: "+ Three Months",
      value: [dayjs(dateRange[0]), dayjs(dateRange[0]).add(3, "months")],
    },
    {
      label: "+ Four Months",
      value: [dayjs(dateRange[0]), dayjs(dateRange[0]).add(4, "months")],
    },
  ];

  return (
    <div style={style}>
      <DatePicker.RangePicker
        changeOnBlur
        disabled={disabled}
        allowEmpty={[true, true]}
        renderExtraFooter={() => (
          <div style={{ marginBottom: "-15px" }}>
            <div>
              Select start and end dates above, with the help of the presets
              below:
            </div>
            <ul>
              <li style={{ marginTop: "-15px" }}>
                Week = one week starting today
              </li>
              <li style={{ marginTop: "-15px" }}>
                +Week = one week, starting from the selected start date
              </li>
            </ul>
          </div>
        )}
        presets={presets as any}
        value={
          [
            dateRange[0] ? dayjs(dateRange[0]) : undefined,
            dateRange[1] ? dayjs(dateRange[1]) : undefined,
          ] as any
        }
        onChange={(value) => {
          const now = dayjs();
          // Ensure start is the later of now or the start of the selected day
          const start = value?.[0]
            ? dayjs(value[0]).isBefore(now)
              ? now.toDate()
              : dayjs(value[0]).startOf("day").toDate()
            : undefined;
          // Set end of day, but only modify if there's a value
          const end = value?.[1]
            ? dayjs(value[1]).endOf("day").subtract(1, "minute").toDate()
            : undefined;
          const x: [Date0, Date0] = [start, end];
          setDateRange(x);
          onChange?.(x);
        }}
        disabledDate={
          noPast || maxDaysInFuture
            ? (date) => {
                if (!date) return false;
                if (noPast && date <= dayjs().subtract(1, "day")) return true;
                if (
                  maxDaysInFuture &&
                  date >= dayjs().add(maxDaysInFuture, "days")
                ) {
                  return true;
                }
                return false;
              }
            : undefined
        }
      />
      {suffix && <span style={{ marginLeft: "5px" }}>{suffix}</span>}
    </div>
  );
}
