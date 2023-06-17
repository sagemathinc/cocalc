import type { ReactNode } from "react";
import { User } from "@cocalc/frontend/users";
import type { QuotaParams } from "./types";
import { KUCALC_DISABLED } from "@cocalc/util/db-schema/site-defaults";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import * as misc from "@cocalc/util/misc";
import { LabeledRow, Tip } from "@cocalc/frontend/components";

interface Props {
  name: keyof QuotaParams;
  quota: { edit: ReactNode; view: ReactNode } | undefined;
  base_value?: number;
  upgrades?: QuotaParams;
  params_data: {
    display_factor: number;
    display_unit: string;
    display: string;
    desc: string;
  };
  site_license: number;
  total_quotas?: object;
  editing?: boolean;
}

export default function QuotaRow({
  name,
  quota,
  base_value = 0,
  upgrades,
  params_data,
  site_license,
  total_quotas,
  editing,
}: Props) {
  const kucalc: string = useTypedRedux("customize", "kucalc");
  const is_commercial: boolean = useTypedRedux("customize", "is_commercial");
  const user_map = useTypedRedux("users", "user_map");

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

  const factor = params_data.display_factor;
  const unit = params_data.display_unit;

  function text(val) {
    const amount = misc.round2(val * factor);
    if (name === "mintime") {
      return misc.seconds2hm(val);
    } else {
      return `${amount} ${misc.plural(amount, unit)}`;
    }
  }

  const upgrade_list: JSX.Element[] = [];
  if (upgrades != null) {
    for (const id in upgrades) {
      const val = upgrades[id];
      const li = (
        <li key={id}>
          {text(val)} given by <User account_id={id} user_map={user_map} />
        </li>
      );
      upgrade_list.push(li);
    }
  }

  if (base_value && is_commercial) {
    // amount given by free project
    upgrade_list.unshift(
      <li key="free">{text(base_value)} included for free</li>
    );
  }

  if (site_license) {
    // amount given by site licenses
    upgrade_list.unshift(
      <li key="site-license">
        {text(site_license)} provided by site license (see below)
      </li>
    );
  }

  return (
    <LabeledRow
      label={
        <Tip title={params_data.display} tip={params_data.desc}>
          {params_data.display}
        </Tip>
      }
      key={params_data.display}
      style={{ borderBottom: "1px solid #ccc" }}
    >
      {editing ? quota.edit : quota.view}
      <ul style={{ color: "#666" }}>{upgrade_list}</ul>
    </LabeledRow>
  );
}
