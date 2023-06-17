import type { ReactNode } from "react";
import type { QuotaParams } from "./types";
import { KUCALC_DISABLED } from "@cocalc/util/db-schema/site-defaults";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { LabeledRow, Tip } from "@cocalc/frontend/components";

interface Props {
  name: keyof QuotaParams;
  quota: { edit: ReactNode; view: ReactNode } | undefined;
  params_data: {
    display_factor: number;
    display_unit: string;
    display: string;
    desc: string;
  };
  total_quotas?: object;
  editing?: boolean;
}

export default function QuotaRow({
  name,
  quota,
  params_data,
  total_quotas,
  editing,
}: Props) {
  const kucalc: string = useTypedRedux("customize", "kucalc");

  if (quota == null) {
    // happens for cocalc-cloud only params
    return null;
  }
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
  if (
    name == "mintime" &&
    ((quota["always_running"] && quota["editing"]) ||
      total_quotas?.["always_running"])
  ) {
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
      {editing ? quota.edit : quota.view}
    </LabeledRow>
  );
}
