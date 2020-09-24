/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered } from "../app-framework";

import { ExplainResources } from "./explain-resources";
import { ExplainLicenses } from "./explain-course-licenses";
import { SubscriptionLicenses } from "./subscription-licenses";
import { ExplainPlan } from "./explain-plan";
import { DedicatedVM } from "./dedicated-vm";
import { OnPrem } from "./on-prem";

export function render_static_pricing_page(): Rendered {
  return (
    <div>
      <ExplainResources type="shared" is_static={true} />
      <hr />
      <ExplainPlan type="personal" />
      <SubscriptionLicenses />
      <hr />
      <ExplainLicenses />
      <hr />
      <DedicatedVM />
      <hr />
      <OnPrem />
    </div>
  );
}
