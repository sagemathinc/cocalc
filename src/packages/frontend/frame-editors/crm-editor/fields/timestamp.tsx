import { useEffect, useRef, useState } from "react";
import { Button, DatePicker, Space } from "antd";
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
  const [value, setValue] = useState<dayjs.Dayjs | undefined | null>(
    obj[field] ? dayjs(obj[field]) : undefined
  );
  const { save, saving, counter, edit, error, ClickToEdit } =
    useEditableContext<Date>(field);

  const ref = useRef<dayjs.Dayjs | undefined | null>(value);

  useEffect(() => {
    setValue(obj[field] ? dayjs(obj[field]) : undefined);
  }, [counter]);

  const saveValue = () => {
    if (ref.current) {
      save(obj, ref.current.toDate());
    }
  };

  if (edit) {
    return (
      <>
        <Space direction="vertical" style={{ width: "100%" }}>
          <DatePicker
            showTime
            value={value}
            disabled={saving}
            onChange={(value) => {
              ref.current = value;
              setValue(value);
            }}
            onOk={saveValue}
            onBlur={saveValue}
            placeholder={fieldToLabel(field)}
          />
          {error}
          <Button
            disabled={saving}
            onClick={() => {
              setValue(null);
              save(obj, null);
            }}
          >
            Clear
          </Button>
        </Space>
      </>
    );
  } else {
    return (
      <ClickToEdit empty={!value}>
        {value && <TimeAgo date={value?.toDate()} />}
      </ClickToEdit>
    );
  }
});
