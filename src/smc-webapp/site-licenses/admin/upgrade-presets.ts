/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
We define a mapping from plans to the upgrades provided by a license.

NOTES:

- Since licenses do not play well with disk upgrades, we never provide
  disk space upgrades as part off this.
*/

import { upgrades } from "smc-util/upgrade-spec";
import { Upgrades } from "./types";
import { capitalize } from "smc-util/misc";

interface Product {
  upgrades: Partial<Upgrades>;
  desc?: string;
}

let PRESETS:
  | {
      [name: string]: Product;
    }
  | undefined = undefined;

export function presets(): { [name: string]: Product } {
  if (PRESETS == null) {
    compute_presets();
  }
  if (PRESETS == null) throw Error("Bug");
  return PRESETS;
}

function compute_presets() {
  PRESETS = {};

  // This naturally completes things to be consistent between plans and courses.
  PRESETS["plan-basic"] = {
    upgrades: {
      member_host: 1,
      network: 1,
      mintime: 0,
      disk_quota: 0,
      memory: 0,
      memory_request: 0,
      cores: 0,
      cpu_shares: 0,
    },
    desc: "Basic plan",
  };

  for (const x of upgrades.live_subscriptions) {
    if (x[0].indexOf("course") != -1) {
      let name: string, desc: string;
      // course subscription -- just take info from the first entry.
      if (x[0].indexOf("basic") != -1) {
        name = "course-basic";
        desc = "Basic course";
      } else if (x[0].indexOf("premium") != -1) {
        name = "course-premium";
        desc = "Premium course";
      } else {
        name = "course-standard";
        desc = "Standard course";
      }
      const sub = upgrades.subscription[x[0]];
      if (sub == null) throw Error(`invalid upgrade-spec ${x[0]}`);
      const num_people = sub.benefits.member_host;
      PRESETS[name] = scaled_product(sub, num_people, desc);
    } else {
      // normal plans
      for (const plan of x) {
        if (plan.indexOf("professional") != -1) continue; // redundant due to normalizing.
        const name = `plan-${plan.slice(0, plan.length - 1)}`;
        const sub = upgrades.subscription[plan];
        if (sub == null) throw Error(`invalid upgrade-spec ${plan}`);
        const num_people = sub.benefits.member_host;
        PRESETS[name] = scaled_product(
          sub,
          num_people,
          `${capitalize(plan.slice(0, plan.length - 1))} plan`
        );
      }
    }
  }

  // Adjust for better consistency with courses and more realistic usage.
  PRESETS["plan-standard"].upgrades["cores"] = 1;
  PRESETS["plan-standard"].upgrades["mintime"] = 2;
  PRESETS["plan-premium"].upgrades["cores"] = 2;
  PRESETS["plan-premium"].upgrades["cpu_shares"] = 256;
  PRESETS["plan-premium"].upgrades["memory"] = 3000;
  PRESETS["plan-premium"].upgrades["memory_request"] = 500;
  PRESETS["plan-premium"].upgrades["mintime"] = 3600 * 24;
  PRESETS["course-premium"].upgrades["mintime"] = 3600 * 12;
  PRESETS["course-standard"].upgrades["mintime"] = 3600 * 2;
}

function scaled_product(sub: any, num_people: number, desc: string): Product {
  const upgrades: Partial<Upgrades> = {};
  for (const field in sub.benefits) {
    if (field.indexOf("disk") != -1) {
      upgrades[field] = 0;
    } else {
      upgrades[field] = sub.benefits[field] / num_people;
    }
  }
  // scale network and member_host fields to 0 or 1, which is the only thing that makes sense.
  for (const field of ["network", "member_host", "always_running"]) {
    if (upgrades[field]) {
      upgrades[field] = 1;
    }
  }
  return {
    upgrades,
    desc,
  };
}
