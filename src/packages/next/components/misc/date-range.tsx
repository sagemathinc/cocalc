import { DatePicker } from "antd";
import moment from "moment";
import { CSSProperties, useState } from "react";

type Date0 = Date | undefined;

interface Props {
  onChange?: (x: [Date0, Date0]) => void;
  style?: CSSProperties;
  noPast?: boolean; // if true, don't allow dates in the past
  maxDaysInFuture?: number; // don't allow dates this far in the future from now
  initialValues?: [Date0, Date0];
}

export default function DateRange({
  onChange,
  style,
  noPast,
  maxDaysInFuture,
  initialValues = [undefined, undefined],
}: Props) {
  const [dateRange, setDateRange] = useState<[Date0, Date0]>(initialValues);
  return (
    <div style={style}>
      <DatePicker.RangePicker
        allowEmpty={[true, true]}
        ranges={{
          Week: [moment(), moment().add(1, "week")],
          Month: [moment(), moment().add(1, "month")],
          Year: [moment(), moment().add(1, "year")],
          "+ Week": [moment(dateRange[0]), moment(dateRange[0]).add(1, "week")],
          "+ Month": [
            moment(dateRange[0]),
            moment(dateRange[0]).add(1, "month"),
          ],
          "+ Three Months": [
            moment(dateRange[0]),
            moment(dateRange[0]).add(3, "months"),
          ],
          "+ Four Months": [
            moment(dateRange[0]),
            moment(dateRange[0]).add(4, "months"),
          ],
        }}
        value={
          [
            dateRange[0] ? moment(dateRange[0]) : undefined,
            dateRange[1] ? moment(dateRange[1]) : undefined,
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
                if (noPast && date <= moment().subtract(1, "days")) return true;
                if (
                  maxDaysInFuture &&
                  date >= moment().add(maxDaysInFuture, "days")
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
