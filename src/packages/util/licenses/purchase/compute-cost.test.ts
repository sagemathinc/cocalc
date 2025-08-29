import { compute_cost } from "./compute-cost";
import { decimalMultiply } from "@cocalc/util/stripe/calc";

const MONTHLY_V1 = 27.15;

describe("compute-cost v1 pricing", () => {
  // This is a monthly business subscription for 3 projects with 1 cpu, 2 GB ram and 3 GB disk,
  // using v1 pricing.  On the website right now it says this should cost:
  //   "Cost: USD $27.15 monthly USD $9.05 per project"
  const monthly1 = MONTHLY_V1;
  const info1 = {
    version: "1",
    end: new Date("2024-01-06T22:00:02.582Z"),
    type: "quota",
    user: "business",
    boost: false,
    start: new Date("2023-12-05T17:15:55.781Z"),
    upgrade: "custom",
    quantity: 3,
    account_id: "6aae57c6-08f1-4bb5-848b-3ceb53e61ede",
    custom_cpu: 1,
    custom_ram: 2,
    custom_disk: 3,
    subscription: "monthly",
    custom_member: true,
    custom_uptime: "short",
    custom_dedicated_cpu: 0,
    custom_dedicated_ram: 0,
  } as const;

  it("computes the cost", () => {
    const cost1 = compute_cost(info1);
    expect(decimalMultiply(cost1.cost_sub_month, cost1.quantity)).toBe(
      monthly1,
    );
  });

  it("computes cost default", () => {
    const c_v1 = compute_cost(info1);
    const c_v3 = compute_cost({ ...info1, version: "3" });
    const cWithoutVersion = compute_cost({ ...info1, version: undefined });
    expect(c_v1).not.toEqual(c_v3);
    expect(c_v3).toEqual(cWithoutVersion);
  });

  it("computes correct cost with a different version of pricing params", () => {
    const info = { ...info1 };
    // @ts-ignore
    info.version = "test_1";
    const cost = compute_cost(info);
    expect(decimalMultiply(cost.cost_sub_month, cost.quantity)).toBe(54.3);
  });
});

describe("a couple more consistency checks with prod", () => {
  // each price below comes from just configuring this on prod

  it("computes the cost of a yearly academic license sub", () => {
    const yearly = 307.08; // from prod store
    const info = {
      version: "1",
      end: new Date("2024-01-06T22:00:02.582Z"),
      type: "quota",
      user: "academic",
      boost: false,
      start: new Date("2023-12-05T17:15:55.781Z"),
      upgrade: "custom",
      quantity: 3,
      account_id: "6aae57c6-08f1-4bb5-848b-3ceb53e61ede",
      custom_cpu: 2,
      custom_ram: 2,
      custom_disk: 3,
      subscription: "yearly",
      custom_member: true,
      custom_uptime: "short",
      custom_dedicated_cpu: 0,
      custom_dedicated_ram: 0,
    } as const;
    const cost = compute_cost(info);
    expect(decimalMultiply(cost.cost_sub_year, cost.quantity)).toBe(yearly);
  });

  it("computes the cost of a specific period academic license", () => {
    const amount = 29.64; // from prod store
    const info = {
      version: "1",
      start: new Date("2024-08-01T00:00:00.000Z"),
      type: "quota",
      user: "academic",
      boost: false,
      end: new Date("2024-08-31T00:00:00.000Z"),
      upgrade: "custom",
      quantity: 3,
      account_id: "6aae57c6-08f1-4bb5-848b-3ceb53e61ede",
      custom_cpu: 2,
      custom_ram: 2,
      custom_disk: 3,
      subscription: "no",
      custom_member: true,
      custom_uptime: "short",
      custom_dedicated_cpu: 0,
      custom_dedicated_ram: 0,
    } as const;
    const cost = compute_cost(info);
    expect(cost.cost).toBe(amount);
  });
});

describe("compute-cost v3 pricing", () => {
  // This is a monthly business subscription for 3 projects with 1 cpu, 2 GB ram and 3 GB disk,
  // using v3 pricing.
  const monthly3 = 31.5;
  const info1 = {
    version: "3",
    end: new Date("2024-01-06T22:00:02.582Z"),
    type: "quota",
    user: "business",
    boost: false,
    start: new Date("2023-12-05T17:15:55.781Z"),
    upgrade: "custom",
    quantity: 3,
    account_id: "6aae57c6-08f1-4bb5-848b-3ceb53e61ede",
    custom_cpu: 1,
    custom_ram: 2,
    custom_disk: 3,
    subscription: "monthly",
    custom_member: true,
    custom_uptime: "short",
    custom_dedicated_cpu: 0,
    custom_dedicated_ram: 0,
  } as const;

  it("computes the cost", () => {
    const cost1 = compute_cost(info1);
    expect(decimalMultiply(cost1.cost_sub_month, cost1.quantity)).toBe(
      monthly3,
    );
  });

  it("computes correct cost with a different version of pricing params", () => {
    const info = { ...info1 };
    // @ts-ignore
    info.version = "test_1";
    const cost = compute_cost(info);
    expect(decimalMultiply(cost.cost_sub_month, cost.quantity)).toBe(54.3);
  });
});
