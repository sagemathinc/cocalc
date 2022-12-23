import { useEffect, useMemo, useState } from "react";
import { InputNumber, Progress } from "antd";
import { useEditableContext } from "./context";
import { render, sorter } from "./register";
import { toNumber } from "../util";
import { cmp } from "@cocalc/util/cmp";

sorter({ type: "percent" }, () => (a, b) => cmp(a ?? 0, b ?? 0));

render({ type: "percent" }, ({ field, obj, spec }) => {
  if (spec.type != "percent") throw Error("bug");
  const { save, saving, counter, edit, error, ClickToEdit } =
    useEditableContext<number>(field);
  const [value, setValue] = useState<number>(Math.round(toNumber(obj[field])));

  useEffect(() => {
    setValue(obj[field]);
  }, [counter, obj[field]]);

  const status = useMemo<"normal" | "success" | "active" | "exception">(() => {
    // status options for progress bar are:
    //   'success' 'exception' 'normal' 'active'
    // Could base this on last_edited and actual status field
    const percent = Math.round(toNumber(value));
    if (percent >= 100) {
      return "success";
    } else if (percent >= 50) {
      return "active";
    } else {
      return "normal";
    }
  }, [value]);

  const bar = (
    <ClickToEdit>
      <Progress
        percent={value ?? 0}
        status={status}
        steps={spec.steps}
        strokeColor={status == "success" ? "#52c41a" : undefined}
      />
    </ClickToEdit>
  );

  if (!edit) return bar;

  /* as any in parser below due to antd typing bug? */
  return (
    <>
      {bar}
      <InputNumber
        autoFocus
        disabled={saving}
        value={value}
        min={0}
        step={spec.steps ? 100 / spec.steps : 1}
        max={100}
        formatter={(value) => `${value}%`}
        parser={((value) => value!.replace("%", "")) as any}
        onChange={setValue as any}
        onBlur={() => save(obj, value)}
        onPressEnter={() => save(obj, value)}
      />
      {error}
    </>
  );
});
