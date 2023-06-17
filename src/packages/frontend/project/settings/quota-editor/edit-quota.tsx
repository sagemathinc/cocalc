import type { QuotaParams } from "./types";
import { Checkbox, InputNumber } from "antd";
import { parse_number_input } from "@cocalc/util/misc";

interface Props {
  name: keyof QuotaParams;
  quotaState: Partial<QuotaParams> | null;
  setQuotaState: (state: Partial<QuotaParams> | null) => void;
  units?: string;
}

export default function EditQuota({
  name,
  quotaState,
  setQuotaState,
  units,
}: Props) {
  if (quotaState == null) {
    return null;
  }
  if (
    name === "network" ||
    name === "member_host" ||
    name === "always_running"
  ) {
    return (
      <Checkbox
        key={name}
        checked={!!quotaState[name]}
        style={{ marginLeft: 0 }}
        onChange={(e) =>
          setQuotaState({ ...quotaState, [name]: e.target.checked ? 1 : 0 })
        }
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
              <b>{units}</b>
            </div>
          ) : undefined
        }
        style={{ width: "175px" }}
        key={name}
        min={0}
        value={quotaState[name]}
        step={getStepSize(name)}
        onChange={(value) => {
          setQuotaState({ ...quotaState, [name]: value });
        }}
      />
    );
  }
}

function getStepSize(name) {
  if (name.includes("disk") || name.includes("memory")) {
    return 1000;
  }
  return 1;
}
