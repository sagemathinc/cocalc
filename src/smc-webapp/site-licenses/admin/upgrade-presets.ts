/*
We define a mapping from plans to the upgrades provided by a license.

NOTES:

- Since licenses do not play well with disk upgrades, we never provide
  disk space upgrades as part off this.
*/

import { upgrades } from "smc-util/upgrade-spec";
import { Upgrades } from "./types";

let PRESETS: { [name: string]: Upgrades } | undefined = undefined;

export function presets(): { [name: string]: Upgrades } {
  if (PRESETS == null) {
    compute_presets();
  }
  if (PRESETS == null) throw Error("Bug");
  return PRESETS;
}

function compute_presets() {
  PRESETS = {};

  // This naturally completes things to be consistent between plans and courses.
  PRESETS["plan-basic"] = { member_host: 1, network: 1 };

  for (const x of upgrades.live_subscriptions) {
    if (x[0].indexOf("course") != -1) {
      let name: string;
      // course subscription -- just take info from the first entry.
      if (x[0].indexOf("basic") != -1) {
        name = "course-basic";
      } else if (x[0].indexOf("premium") != -1) {
        name = "course-premium";
      } else {
        name = "course-standard";
      }
      const sub = upgrades.subscription[x[0]];
      if (sub == null) throw Error(`invalid upgrade-spec ${x[0]}`);
      const num_people = sub.benefits.member_host;
      PRESETS[name] = scaled_benefits_without_disk(sub.benefits, num_people);
    } else {
      // normal plans
      for (const plan of x) {
        if (plan.indexOf("professional") != -1) continue; // redundant due to normalizing.
        const name = `plan-${plan.slice(0, plan.length - 1)}`;
        const sub = upgrades.subscription[plan];
        if (sub == null) throw Error(`invalid upgrade-spec ${plan}`);
        const num_people = sub.benefits.member_host;
        PRESETS[name] = scaled_benefits_without_disk(sub.benefits, num_people);
      }
    }
  }

  // Adjust for better consistency with coures and more realistic usage.
  PRESETS['plan-standard']['cores'] = 0.5;
  PRESETS['plan-premium']['cores'] = 2;
  PRESETS['plan-premium']['memory'] = 3000;
  PRESETS['plan-premium']['memory_request'] = 500;
  PRESETS['plan-premium']['mintime'] = 3600*24;
}

function scaled_benefits_without_disk(
  benefits: Upgrades,
  num_people: number
): Upgrades {
  const result: Upgrades = {};
  for (const field in benefits) {
    if (field.indexOf("disk") != -1 || !benefits[field]) continue;
    result[field] = benefits[field] / num_people;
  }
  // scale network and member_host fields to 0 or 1, which is the only thing that makes sense.
  for (const field of ["network", "member_host"]) {
    if (result[field]) {
      result[field] = 1;
    }
  }
  return result;
}
