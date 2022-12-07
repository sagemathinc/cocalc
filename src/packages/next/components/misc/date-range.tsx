/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { DatePicker } from "antd";
import dayjs from "dayjs";
import { CSSProperties, useState } from "react";
import { DateRangeType, Date0 } from "@cocalc/util/types/store";
import { roundToMidnight } from "@cocalc/util/stripe/timecalcs";

interface Props {
  onChange?: (x: DateRangeType) => void;
  style?: CSSProperties;
  noPast?: boolean; // if true, don't allow dates in the past
  maxDaysInFuture?: number; // don't allow dates this far in the future from now
  disabled?: boolean;
  initialValues?: DateRangeType;
}

export default function DateRange(props: Props) {
  const {
    onChange,
    style,
    noPast,
    maxDaysInFuture,
    disabled = false,
    initialValues = [undefined, undefined],
  } = props;

  // we round values to exactly midnight, because otherwise e.g. 2022-06-12T23:58:95 will be shown as 2022-06-12
  // that's confusing and causes problems down the road
  initialValues[0] = roundToMidnight(initialValues[0], "start");
  initialValues[1] = roundToMidnight(initialValues[1], "end");

  const [dateRange, setDateRange] = useState<DateRangeType>(initialValues);

  const presets = [
    { label: "Week", value: [dayjs(), dayjs().add(1, "week")] },
    { label: "Month", value: [dayjs(), dayjs().add(1, "month")] },
    { label: "Year", value: [dayjs(), dayjs().add(1, "year")] },
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
          const x: [Date0, Date0] = [
            value?.[0]?.toDate(),
            value?.[1]?.toDate(),
          ];
          setDateRange(x);
          onChange?.(x);
        }}
        disabledDate={
          noPast || maxDaysInFuture
            ? (date) => {
                if (!date) return false;
                if (noPast && date <= dayjs().subtract(1, "days")) return true;
                if (
                  maxDaysInFuture &&
                  date >= dayjs().add(maxDaysInFuture, "days")
                )
                  return true;
                return false;
              }
            : undefined
        }
      />
    </div>
  );
}
