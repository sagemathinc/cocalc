import type { QuotaParams } from "./types";
import { KUCALC_DISABLED } from "@cocalc/util/db-schema/site-defaults";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { LabeledRow, Tip } from "@cocalc/frontend/components";
import EditQuota from "./edit-quota";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";

const UNITS = {
  disk_quota: "MB",
  memory: "MB",
  memory_request: "MB",
  cores: "cores",
  cpu_shares: "cores",
  mintime: "hours",
};

interface Props {
  name: keyof QuotaParams;
  quotaState: QuotaParams | null;
  setQuotaState: (state: QuotaParams | null) => void;
}

export default function QuotaRow({
  name,
  quotaState,
  setQuotaState,
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

  return (
    <LabeledRow
      label={
        <Tip title={params_data.display} tip={params_data.desc}>
          {params_data.display}
        </Tip>
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
        units={UNITS[name]}
      />
    </LabeledRow>
  );
}
