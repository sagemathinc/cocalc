/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
import { LicenseExamples } from "./license-examples";
import {
  compute_cost,
  discount_pct,
  User,
  Upgrade,
  Subscription,
} from "../site-licenses/purchase/util";
import { plural } from "smc-util/misc2";

const p1data = {
  user: "academic" as User,
  upgrade: "custom" as Upgrade,
  quantity: 2,
  subscription: "monthly" as Subscription,
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2020-02-01T11:59:59.999Z"),
  custom_ram: 1,
  custom_cpu: 1,
  custom_disk: 1,
  custom_member: true,
  custom_dedicated_ram: 0,
  custom_dedicated_cpu: 0,
  custom_always_running: false,
};
const Price1 = compute_cost(p1data);

const p2data = {
  user: "academic" as User,
  upgrade: "custom" as Upgrade,
  quantity: 7,
  subscription: "monthly" as Subscription,
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2021-02-01T11:59:59.999Z"),
  custom_ram: 5,
  custom_cpu: 2,
  custom_disk: 10,
  custom_member: true,
  custom_dedicated_ram: 0,
  custom_dedicated_cpu: 0,
  custom_always_running: false,
};
const Price2 = compute_cost(p2data);

const p3data = {
  user: "business" as User,
  upgrade: "custom" as Upgrade,
  quantity: 3,
  subscription: "monthly" as Subscription,
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2020-02-01T11:59:59.999Z"),
  custom_ram: 3,
  custom_cpu: 1,
  custom_disk: 5,
  custom_member: true,
  custom_dedicated_ram: 1,
  custom_dedicated_cpu: 1,
  custom_always_running: false,
};
const Price3 = compute_cost(p3data);

const EXAMPLES = [
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
      { value: p1data.custom_cpu, unit: "cores", resource: "Shared CPU" },
      { value: p1data.custom_disk, unit: "GB", resource: "Disk space" },
    ],
    price: Price1,
    period: "per month",
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
        value: p3data.custom_dedicated_ram,
        unit: "GB",
        resource: "Dedicated RAM",
      },
      { value: p2data.custom_cpu, unit: "cores", resource: "Shared CPU" },
      { value: p2data.custom_disk, unit: "GB", resource: "Disk space" },
    ],
    price: Price2,
    period: "per month",
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
      { value: p3data.custom_cpu, unit: "cores", resource: "Shared CPU" },
      {
        value: p3data.custom_dedicated_cpu,
        unit: "cores",
        resource: "Dedicated CPU",
      },
      { value: p3data.custom_disk, unit: "GB", resource: "Disk space" },
    ],
    price: Price3,
    period: "per month",
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
  return <LicenseExamples examples={EXAMPLES} />;
};
