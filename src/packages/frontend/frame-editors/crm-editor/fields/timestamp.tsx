import { useEffect, useMemo, useRef, useState } from "react";
import { DatePicker, Space } from "antd";
import { useEditableContext } from "./context";
import { TimeAgo } from "@cocalc/frontend/components";
import dayjs from "dayjs";
import { fieldToLabel } from "../util";
import { cmp_Date } from "@cocalc/util/cmp";

import { render, sorter } from "./register";

sorter({ type: "timestamp" }, (a, b) => {
  if (a == null) return 1;
  if (b == null) return -1;
  return cmp_Date(a, b);
});

render({ type: "timestamp" }, ({ field, obj }) => (
  <TimeAgo date={obj[field]} />
));

render({ type: "timestamp", editable: true }, ({ field, obj }) => {
  const [value, setValue] = useState<dayjs.Dayjs | undefined>(
    obj[field] ? dayjs(obj[field]) : undefined
  );
  const { edit, save, saving, counter, error, ClickToEdit } =
    useEditableContext<Date | null>(field);

  useEffect(() => {
    setValue(obj[field] ? dayjs(obj[field]) : undefined);
  }, [counter]);

  const timeRef = useRef<dayjs.Dayjs | undefined>(value);
  const timeOffset = useMemo(() => {
    return (value: dayjs.Dayjs | undefined) => {
      if (value == undefined || timeRef.current == undefined) return value;
      value = value.hour(timeRef.current.hour());
      value = value.minute(timeRef.current.minute());
      value = value.second(timeRef.current.second());
      return value;
    };
  }, []);
  const fullSave = useMemo(() => {
    return (newValue?) => {
      if (newValue === undefined) {
        // still explicitly allow newValue === null to clear.
        newValue = value;
      }
      newValue = timeOffset(newValue);
      setValue(newValue ?? null);
      save(obj, newValue?.toDate() ?? null);
    };
  }, [value]);

  if (edit) {
    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <DatePicker
          allowClear
          value={value}
          disabled={saving}
          onChange={fullSave}
          placeholder={fieldToLabel(field)}
          showToday={true}
        />
        {value != null && (
          <DatePicker
            allowClear={false}
            defaultValue={value}
            format={"hh:mm:ss A"}
            picker={"time"}
            onChange={(value) => {
              timeRef.current = value ?? undefined;
              fullSave();
            }}
          />
        )}
        {error}
      </Space>
    );
  } else {
    return (
      <ClickToEdit empty={!value}>
        <Space direction="vertical">
          {value && <TimeAgo date={value.toDate()} />}
        </Space>
      </ClickToEdit>
    );
  }
});
