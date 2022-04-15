/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Uptime } from "@cocalc/util/consts/site-license";
import {
  PurchaseInfo,
  Subscription,
} from "@cocalc/util/licenses/purchase/types";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { plural } from "@cocalc/util/misc";
import { React } from "../app-framework";
import { Example, LicenseExamples } from "./license-examples";
import { discount_pct } from "@cocalc/util/licenses/purchase/consts";

const p1data: PurchaseInfo = {
  type: "quota",
  user: "academic",
  upgrade: "custom",
  quantity: 2,
  subscription: "monthly",
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2020-02-01T11:59:59.999Z"),
  custom_ram: 1,
  custom_cpu: 1,
  custom_disk: 1,
  custom_member: true,
  custom_dedicated_ram: 0,
  custom_dedicated_cpu: 0,
  custom_uptime: "short" as Uptime,
};
const Price1m = compute_cost(p1data);
const Price1y = compute_cost({
  ...p1data,
  ...{ subscription: "yearly" as Subscription },
});

const p2data: PurchaseInfo = {
  type: "quota",
  user: "academic",
  upgrade: "custom",
  quantity: 7,
  subscription: "monthly",
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2021-02-01T11:59:59.999Z"),
  custom_ram: 5,
  custom_cpu: 2,
  custom_disk: 10,
  custom_member: true,
  custom_dedicated_ram: 1,
  custom_dedicated_cpu: 0,
  custom_uptime: "short" as Uptime,
};
const Price2m = compute_cost(p2data);
const Price2y = compute_cost({
  ...p2data,
  ...{ subscription: "yearly" as Subscription },
});

const p3data: PurchaseInfo = {
  type: "quota",
  user: "business",
  upgrade: "custom",
  quantity: 3,
  subscription: "monthly",
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2020-02-01T11:59:59.999Z"),
  custom_ram: 3,
  custom_cpu: 1,
  custom_disk: 5,
  custom_member: true,
  custom_dedicated_ram: 1,
  custom_dedicated_cpu: 1,
  custom_uptime: "short" as Uptime,
};
const Price3m = compute_cost(p3data);
const Price3y = compute_cost({
  ...p3data,
  ...{ subscription: "yearly" as Subscription },
});

const EXAMPLES: Example[] = [
  {
    title: "Hobbyist",
    icon: "battery-quarter",
    user: p1data.user,
    lines: [
      {
        value: p1data.quantity,
        unit: "simultaneously running",
        resource: plural(p1data.quantity, "Project"),
      },
      { value: p1data.custom_ram, unit: "GB", resource: "Shared RAM" },
      {
        value: p1data.custom_cpu,
        unit: plural(p1data.custom_cpu, "core"),
        resource: "Shared CPU",
      },
      { value: p1data.custom_disk, unit: "GB", resource: "Disk space" },
    ],
    price_monthly: Price1m,
    price_yearly: Price1y,
  },
  {
    title: "Academic Research",
    icon: "battery-three-quarters",
    user: p2data.user,
    lines: [
      {
        value: p2data.quantity,
        unit: "simultaneously running",
        resource: "Projects",
      },
      { value: p2data.custom_ram, unit: "GB", resource: "Shared RAM" },
      {
        value: p2data.custom_dedicated_ram,
        unit: "GB",
        resource: "Dedicated RAM",
      },
      {
        value: p2data.custom_cpu,
        unit: plural(p2data.custom_cpu, "core"),
        resource: "Shared CPU",
      },
      { value: p2data.custom_disk, unit: "GB", resource: "Disk space" },
    ],
    price_monthly: Price2m,
    price_yearly: Price2y,
  },
  {
    title: "Professional Workgroup",
    icon: "battery-full",
    user: p3data.user,
    lines: [
      {
        value: p3data.quantity,
        unit: "simultaneously running",
        resource: "Projects",
      },
      { value: p3data.custom_ram, unit: "GB", resource: "Shared RAM" },
      {
        value: p3data.custom_dedicated_ram,
        unit: "GB",
        resource: "Dedicated RAM",
      },
      {
        value: p3data.custom_cpu,
        unit: plural(p3data.custom_cpu, "core"),
        resource: "Shared CPU",
      },
      {
        value: p3data.custom_dedicated_cpu,
        unit: plural(p3data.custom_dedicated_cpu, "core"),
        resource: "Dedicated CPU",
      },
      { value: p3data.custom_disk, unit: "GB", resource: "Disk space" },
    ],
    price_monthly: Price3m,
    price_yearly: Price3y,
  },
];

// common lines
for (const ex of EXAMPLES) {
  ex.lines.push({
    value: Number.POSITIVE_INFINITY,
    unit: "collaborators",
    resource: "",
  });

  if (ex.user == "academic") {
    ex.lines.push({
      value: discount_pct,
      unit: "%",
      resource: "Academic Discount",
    });
  }
}

export const SubscriptionLicenses: React.FC<{}> = () => {
  return <LicenseExamples examples={EXAMPLES} show_discount_pct={true} />;
};
