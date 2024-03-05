import type { QuotaParams } from "./types";
import { Checkbox, InputNumber } from "antd";
import { parse_number_input } from "@cocalc/util/misc";

interface Props {
  name: keyof QuotaParams;
  quotaState: Partial<QuotaParams> | null;
  setQuotaState: (state: Partial<QuotaParams> | null) => void;
  units?: string;
  max?: number;
  disabled?: boolean;
}

export default function EditQuota({
  name,
  quotaState,
  setQuotaState,
  units,
  max,
  disabled,
}: Props) {
  if (quotaState == null) {
    return null;
  }
  if (
    name === "network" ||
    name === "member_host" ||
    name === "always_running"
  ) {
    if (max != null && max == 0) {
      return (
        <Checkbox key={name} disabled style={{ marginLeft: 0 }}>
          Not supported
        </Checkbox>
      );
    }
    return (
      <Checkbox
        key={name}
        checked={!!quotaState[name]}
        style={{ marginLeft: 0 }}
        onChange={(e) =>
          setQuotaState({ ...quotaState, [name]: e.target.checked ? 1 : 0 })
        }
        disabled={disabled}
      >
        {quotaState[name] ? "Enabled" : "Disabled"}
      </Checkbox>
    );
  } else {
    return (
      <InputNumber
        status={
          // is this even a problem given InputNumber...?
          parse_number_input(quotaState[name]) == null ? "error" : undefined
        }
        addonAfter={
          units ? (
            <div style={{ width: "50px" }}>
              <b>{displayUnits(units)}</b>
            </div>
          ) : undefined
        }
        style={{ width: "175px" }}
        key={name}
        min={MIN[name] ?? 1}
        max={max ? (units == "MB" ? max / 1000 : max) : undefined}
        value={displayValue(quotaState[name], units)}
        step={1}
        onChange={(value) => {
          setQuotaState({
            ...quotaState,
            [name]: internalValue(value, units),
          });
        }}
        disabled={disabled}
      />
    );
  }
}

const MIN = {
  mintime: 0.25,
  cpu_shares: 0,
  memory_request: 0,
};

function displayValue(value, units) {
  if (value == null) return 1;
  if (units == "MB") {
    return value / 1000;
  }
  return value;
}

function displayUnits(units) {
  if (units == "MB") {
    return "GB";
  }
  if (units == "seconds") {
    return "hours";
  }
  return units;
}

function internalValue(value, units) {
  if (value == null) return value;
  if (units == "MB") {
    return value * 1000;
  }
  if (units == "seconds") {
    return value * 3600;
  }
  return value;
}
