/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import * as humanizeList from "humanize-list";
import { PROJECT_UPGRADES } from "smc-util/schema";
import { Upgrades } from "smc-util/upgrades/types";

import {
  rclass,
  rtypes,
  Rendered,
  Component,
  React,
  redux,
} from "../app-framework";

import { len } from "smc-util/misc2";

import { visit_billing_page } from "../billing/billing-page-link";

interface Props {
  // reduxProps:
  stripe_customer?: Map<string, any>;
  project_map?: Map<string, any>;
}

class UpgradeStatus extends Component<Props, {}> {
  static reduxProps() {
    return {
      account: {
        stripe_customer: rtypes.immutable.Map,
      },
      projects: {
        project_map: rtypes.immutable.Map,
      },
    };
  }

  open_account_upgrades_panel(): void {
    (redux.getActions("page") as any).set_active_tab("account");
    (redux.getActions("account") as any).set_active_tab("upgrades");
  }

  open_account_subscriptions_panel(): void {
    visit_billing_page();
  }

  render_unused_mesg(total: Upgrades, used: Upgrades): Rendered {
    let mesg: string;
    let f: (event: any) => void;
    if (len(total) == 0) {
      f = this.open_account_subscriptions_panel;
      mesg = "Purchase project upgrades...";
    } else {
      f = this.open_account_upgrades_panel;

      const unused: string[] = [];
      for (const quota in total) {
        if (total[quota] > (used[quota] ? used[quota] : 0)) {
          const info = PROJECT_UPGRADES.params[quota];
          if (info && info.display) {
            unused.push(info.display);
          }
        }
      }
      if (unused.length == 0) {
        mesg = "All your upgrades are applied to projects...";
      } else {
        unused.sort();
        mesg = `You may have unallocated ${humanizeList(unused)} upgrades...`;
      }
    }
    return (
      <a style={{ cursor: "pointer" }} onClick={f}>
        {mesg}
      </a>
    );
  }

  render(): Rendered {
    // These depend on stripe_customer and project_map, so get upgraded
    // when those get changed.
    const total = redux.getStore("account").get_total_upgrades();
    const used = redux
      .getStore("projects")
      .get_total_upgrades_you_have_applied();
    if (total == null || used == null) {
      // nothing to render
      return <span />;
    }

    return this.render_unused_mesg(total, used);
  }
}

const UpgradeStatus0 = rclass(UpgradeStatus);
export { UpgradeStatus0 as UpgradeStatus };
