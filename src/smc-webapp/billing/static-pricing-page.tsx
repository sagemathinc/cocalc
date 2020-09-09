/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered } from "../app-framework";

import { ExplainResources } from "./explain-resources";
import { ExplainPlan } from "./explain-plan";
import { SubscriptionGrid } from "./subscription-grid";
import { DedicatedVM } from "./dedicated-vm";

export function render_static_pricing_page(): Rendered {
  return (
    <div>
      <ExplainResources type="shared" is_static={true} />
      <hr />
      <ExplainPlan type="personal" />
      <SubscriptionGrid periods={["month", "year"]} is_static={true} />
      <hr />
      {false && <ExplainPlan type="course" />}
      {false && (
        <SubscriptionGrid
          periods={["week", "month4", "year1"]}
          is_static={true}
        />
      )}
      {false && <hr />}
      <DedicatedVM />
    </div>
  );
}
