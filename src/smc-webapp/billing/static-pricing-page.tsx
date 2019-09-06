import { React, Rendered } from "../app-framework";

import { ExplainResources } from "./explain-resources";
import { ExplainPlan } from "./explain-plan";
import { SubscriptionGrid } from "./subscription-grid";
import { DedicatedVM } from "./dedicated-vm";
import { FAQ } from "./faq";

export function render_static_pricing_page(): Rendered {
  return (
    <div>
      <ExplainResources type="shared" is_static={true} />
      <hr />
      <ExplainPlan type="personal" />
      <SubscriptionGrid periods={["month", "year"]} is_static={true} />
      <hr />
      <ExplainPlan type="course" />
      <SubscriptionGrid
        periods={["week", "month4", "year1"]}
        is_static={true}
      />
      <hr />
      <DedicatedVM />
      <hr />
      <FAQ />
    </div>
  );
}
