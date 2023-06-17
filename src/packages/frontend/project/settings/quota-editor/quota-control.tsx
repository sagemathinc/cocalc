import type { QuotaParams } from "./types";
import { Checkbox, InputNumber } from "antd";
import { parse_number_input } from "@cocalc/util/misc";

interface Props {
  label: keyof QuotaParams;
  quotaState: QuotaParams | null;
  setQuotaState: (state: QuotaParams | null) => void;
  units?: string;
}

export default function QuotaControl({
  label,
  quotaState,
  setQuotaState,
  units,
}: Props) {
  if (quotaState == null) {
    return null;
  }
  if (
    label === "network" ||
    label === "member_host" ||
    label === "always_running"
  ) {
    return (
      <Checkbox
        key={label}
        checked={!!quotaState[label]}
        style={{ marginLeft: 0 }}
        onChange={(e) =>
          setQuotaState({ ...quotaState, [label]: e.target.checked ? 1 : 0 })
        }
      >
        {quotaState[label] ? "Enabled" : "Disabled"}
      </Checkbox>
    );
  } else {
    return (
      <InputNumber
        status={
          // is this even a problem given InputNumber...?
          parse_number_input(quotaState[label]) == null ? "error" : undefined
        }
        addonAfter={units ? <b>{units}</b> : undefined}
        style={{ width: "150px" }}
        key={label}
        min={0}
        value={quotaState[label]}
        step={getStepSize(label)}
        onChange={(value) => {
          setQuotaState({ ...quotaState, [label]: value });
        }}
      />
    );
  }
}

function getStepSize(label) {
  if (label.includes("disk") || label.includes("memory")) {
    return 1000;
  }
  return 1;
}
