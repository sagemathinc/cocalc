/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Ensure that plans are all correctly defined in stripe.

Stripe API docs https://stripe.com/docs/api/node#create_plan
*/

import Stripe from "stripe";
import { upgrades } from "smc-util/upgrade-spec";
import { init_stripe } from "./connect";
import { PostgreSQL } from "../postgres/types";

// Create all plans that are missing
export async function create_missing_plans(
  logger: { debug: Function },
  database: PostgreSQL
) {
  const dbg = (m?) => logger.debug(`create_missing_plans: ${m}`);
  dbg();
  dbg("initialize stripe connection");
  const stripe = await init_stripe(database, logger);
  dbg("get already created plans");
  const plans = await stripe.plans.list({ limit: 999 });
  const known: { [id: string]: boolean } = {};
  for (const plan of plans.data) {
    known[plan.id] = true;
  }
  dbg("create any missing plans");
  for (const name in upgrades.subscription) {
    await create_plan(name, database, logger, known);
  }
}

// Create a specific plan (error if plan already defined)
async function create_plan(
  name: string, // the name of the plan, one of the keys of upgrades.subscription;
  // NOTE: there are multiple stripe plans associated to a single cocalc
  // plan, due to different intervals.
  database: PostgreSQL,
  logger: { debug: Function },
  known: { [id: string]: boolean } // map from known plan ids to true -- these are skipped
): Promise<void> {
  const spec = upgrades.subscription[name];
  if (spec == null) {
    throw Error(`unknown plan "${name}"`);
  }
  const dbg = (m?) => logger.debug(`create_plan(name="${name}"): ${m}`);
  dbg();
  dbg("initialize stripe connection");
  const stripe: Stripe = await init_stripe(database, logger);
  const plans = spec_to_plans(name, spec, known);
  if (plans.length === 0) {
    dbg("no missing stripe plans");
    return;
  }
  dbg(`creating ${plans.length} missing stripe plans`);
  for (const plan of plans) {
    const { interval } = plan;
    if (
      interval != "day" &&
      interval != "week" &&
      interval != "month" &&
      interval != "year"
    ) {
      // make TS happy, and a good consistency check -- this check above makes it so interval
      // has the right type, which is why we do the object merge below (to fix the typing).
      throw Error(`invalid plan interval "${plan.interval}"`);
    }
    await stripe.plans.create({ ...plan, ...{ interval } });
  }
}

function spec_to_plans(name: string, spec, known: { [id: string]: boolean }) {
  const v: {
    id: string;
    interval: string;
    interval_count: number;
    amount: number;
    product: {
      name: string;
      statement_descriptor: string;
    };
    currency: string;
  }[] = [];
  let the_desc = spec.desc;
  const i = the_desc.indexOf("\n");
  if (i !== -1) {
    the_desc = the_desc.slice(0, i);
  }
  for (const period in spec.price) {
    let desc, id, interval, interval_count;
    const amount = spec.price[period];
    switch (period) {
      case "month":
        id = name;
        interval = "month";
        interval_count = 1;
        desc = the_desc;
        break;
      case "month4":
        id = name;
        interval = "month";
        interval_count = 4;
        desc = the_desc;
        break;
      case "year":
      case "year1":
        id = `${name}-year`;
        interval = "year";
        interval_count = 1;
        desc = `One Year ${the_desc}`;
        break;
      case "week":
        id = `${name}-week`;
        interval = "week";
        interval_count = 1;
        desc = `One Week ${the_desc}`;
        break;
      default:
        throw Error(`unknown period '${period}'`);
    }

    if (known[id]) {
      continue;
    }

    let { statement } = spec;
    if (statement == null) {
      throw Error(
        `plan statement must be defined but it is not for name='${name}'`
      );
    }
    if (statement.length > 17) {
      throw Error(
        `statement '${statement}' must be at most 17 characters, but is ${statement.length} characters for name='${name}'`
      );
    }
    if (interval === "year") {
      statement += " YEAR";
    }
    v.push({
      id,
      interval,
      interval_count,
      amount: amount * 100,
      product: {
        name: desc,
        statement_descriptor: statement,
      },
      currency: "usd",
    });
  }
  return v;
}
