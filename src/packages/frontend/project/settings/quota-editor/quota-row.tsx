import type { QuotaParams } from "./types";
import { KUCALC_DISABLED } from "@cocalc/util/db-schema/site-defaults";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { LabeledRow, Tip } from "@cocalc/frontend/components";
import EditQuota from "./edit-quota";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { Button } from "antd";

const UNITS = {
  disk_quota: "MB",
  memory: "MB",
  memory_request: "MB",
  cores: "cores",
  cpu_shares: "cores",
  mintime: "seconds",
};

interface Props {
  name: keyof QuotaParams;
  quotaState: Partial<QuotaParams> | null;
  setQuotaState: (state: Partial<QuotaParams> | null) => void;
  maxQuotas?: Partial<QuotaParams> | null;
}

export default function QuotaRow({
  name,
  quotaState,
  setQuotaState,
  maxQuotas,
}: Props) {
  const kucalc: string = useTypedRedux("customize", "kucalc");
  const params_data = PROJECT_UPGRADES.params[name];

  if (
    kucalc == KUCALC_DISABLED &&
    name != "mintime" &&
    name != "always_running"
  ) {
    // In anything except KuCalc, only the mintime and always_on quota is implemented.
    // NONE of the other quotas are.
    return null;
  }

  // if always_running is true, don't show idle timeout row, since not relevant
  if (name == "mintime" && quotaState?.always_running) {
    return null;
  }

  const max = maxQuotas?.[name];
  const units = UNITS[name];

  return (
    <LabeledRow
      label_cols={6}
      label={
        <div style={{ marginTop: units != null ? "5px" : undefined }}>
          <Tip
            title={params_data.display}
            tip={params_data.desc}
            placement="top"
          >
            {params_data.display}
          </Tip>
          {max != null && units != null && (
            <>
              {" "}
              <Button
                type="text"
                size="small"
                onClick={() => {
                  setQuotaState({ ...quotaState, [name]: max });
                }}
              >
                (max: {valueToStr(max, units)})
              </Button>
            </>
          )}
        </div>
      }
      key={params_data.display}
      style={{
        borderBottom: "1px solid #eee",
        paddingBottom: "8px",
      }}
    >
      <EditQuota
        name={name}
        quotaState={quotaState}
        setQuotaState={setQuotaState}
        units={units}
        max={max}
      />
    </LabeledRow>
  );
}

function valueToStr(value, units) {
  if (units == "MB") {
    return `${Math.round(value / 1000)} GB`;
  } else {
    return `${value} ${units}`;
  }
}
