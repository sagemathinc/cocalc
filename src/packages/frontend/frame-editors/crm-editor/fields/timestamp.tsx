import { useEffect, useState } from "react";
import { DatePicker } from "antd";
import { useEditableContext } from "./context";
import { TimeAgo } from "@cocalc/frontend/components";
import dayjs from "dayjs";
import { fieldToLabel } from "../util";

import { register } from "./register";

register({ type: "timestamp" }, ({ field, obj }) => (
  <TimeAgo date={obj[field]} />
));

register({ type: "timestamp", editable: true }, ({ field, obj }) => {
  const [value, setValue] = useState<dayjs.Dayjs | undefined | null>(
    obj[field] ? dayjs(obj[field]) : undefined
  );
  const { save, saving, counter, edit, error, ClickToEdit } =
    useEditableContext<Date>(field);

  useEffect(() => {
    setValue(obj[field] ? dayjs(obj[field]) : undefined);
  }, [counter]);

  if (edit) {
    return (
      <>
        <DatePicker
          value={value}
          disabled={saving}
          onChange={setValue}
          onOk={() => save(obj, value?.toDate())}
          onBlur={() => save(obj, value?.toDate())}
          placeholder={fieldToLabel(field)}
        />
        {error}
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
