import type { QuotaParams } from "./types";
import { Checkbox, InputNumber } from "antd";
import { parse_number_input } from "@cocalc/util/misc";

interface Props {
  label: keyof QuotaParams;
  quotaState: QuotaParams | null;
  setQuotaState: (state: QuotaParams | null) => void;
}

export default function QuotaControl({
  label,
  quotaState,
  setQuotaState,
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
        key={label}
        value={quotaState[label]}
        style={validationStyle(quotaState[label])}
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

function validationStyle(input: number) {
  if (parse_number_input(input) == null) {
    return {
      outline: "none",
      borderColor: "red",
      boxShadow: "0 0 10px red",
    };
  } else {
    return {
      border: "1px solid lightgrey",
      borderRadius: "3px",
      padding: "5px",
    };
  }
}
