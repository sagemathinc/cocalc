import { useEffect, useMemo, useState } from "react";
import { InputNumber } from "antd";
import { useEditableContext } from "./context";
import { render } from "./register";
import { Icon } from "@cocalc/frontend/components";

render({ type: "number" }, ({ field, obj, viewOnly, spec }) => {
  if (spec.type != "number") throw Error("bug");
  if (!viewOnly && spec.editable) {
    return <EditNumber obj={obj} field={field} spec={spec} />;
  } else {
    const value = obj[field];
    return <>{value != null ? getFormat(spec).displayFormatter(value) : ""}</>;
  }
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  // See https://stackoverflow.com/questions/149055/how-to-format-numbers-as-currency-strings
  //minimumFractionDigits: 0, // (this suffices for whole numbers, but will print 2500.10 as $2,500.1)
  //maximumFractionDigits: 0, // (causes 2500.99 to be printed as $2,501)
});

function getFormat(spec): {
  formatter: (value: number) => string; // for editing
  displayFormatter: (value: number) => string; // for display
  parser: (value: string) => string;
} {
  if (spec.format == "money") {
    return {
      displayFormatter: (value) => currencyFormatter.format(value),
      formatter: (value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ","),
      parser: (value) => value!.replace(/\$\s?|(,*)/g, ""),
    };
  }
  if (spec.format == "percent") {
    return {
      formatter: (value) => `${value}%`,
      displayFormatter: (value) => `${value}%`,
      parser: (value) => value!.replace("%", ""),
    };
  }
  return {
    formatter: (value) => `${value}`,
    displayFormatter: (value) => `${value}`,
    parser: (value) => value,
  };
}

function EditNumber({ field, obj, spec }) {
  const [value, setValue] = useState<number | undefined>(obj[field]);
  const { save, saving, counter, edit, error, ClickToEdit } =
    useEditableContext<number | undefined>(field);

  useEffect(() => {
    setValue(obj[field]);
  }, [counter, obj[field]]);

  const { displayFormatter, formatter, parser } = useMemo(
    () => getFormat(spec),
    [spec.format]
  );

  if (edit) {
    return (
      <>
        <InputNumber
          min={spec.min}
          max={spec.max}
          step={spec.step ?? 1}
          formatter={formatter}
          parser={parser}
          style={{ width: "100%" }}
          disabled={saving}
          autoFocus
          value={value}
          onChange={(value) => {
            if (spec.integer) {
              setValue(Math.round(value));
            } else {
              setValue(value);
            }
          }}
          onBlur={() => {
            save(obj, value);
          }}
          onPressEnter={() => {
            save(obj, value);
          }}
        />
        {error}
      </>
    );
  } else {
    return (
      <ClickToEdit empty={value == null}>
        <Icon name="pencil" style={{ marginRight: "8px", color: "#666" }} />
        {value != null ? displayFormatter(value) : ""}
      </ClickToEdit>
    );
  }
}
