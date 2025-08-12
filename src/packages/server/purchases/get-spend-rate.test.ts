import getSpendRate from "./get-spend-rate";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import createPurchase from "./create-purchase";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(before, 15000);
afterAll(after);

describe("get the spend rate of a user under various circumstances", () => {
  const account_id = uuid();

  it("gets spend rate of user that doesn't even exist", async () => {
    expect(await getSpendRate(account_id)).toBe(0);
  });

  it("create an account, and spend rate of course still 0", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
    expect(await getSpendRate(account_id)).toBe(0);
  });

  it("add a purchase that is not pay-as-you-go and spend rate still 0", async () => {
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 3.89,
    });
    expect(await getSpendRate(account_id)).toBe(0);
  });

  const cost_per_hour1 = 1.23;
  let purchase_id1 = -1;
  it("add a purchase that *is* pay-as-you-go and spend rate changes as it should", async () => {
    const project_id = uuid();
    purchase_id1 = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "project-upgrade",
      period_start: new Date(),
      cost_per_hour: cost_per_hour1,
      description: {
        type: "project-upgrade",
        start: Date.now(),
        project_id,
        quota: {} as any,
      },
    });
    expect(await getSpendRate(account_id, "")).toBe(cost_per_hour1);
  });

  const cost_per_hour2 = 0.49;
  let purchase_id2 = -1;

  it("add another purchase that *is* pay-as-you-go and spend rate is the sum", async () => {
    const project_id = uuid();
    purchase_id2 = await createPurchase({
      client: null,
      account_id,
      project_id,
      service: "project-upgrade",
      period_start: new Date(),
      cost_per_hour: cost_per_hour2,
      description: {
        type: "project-upgrade",
        start: Date.now(),
        project_id,
        quota: {} as any,
      },
    });
    expect(await getSpendRate(account_id, "")).toBe(
      cost_per_hour1 + cost_per_hour2
    );
  });

  it("change second purchase period to be done and see that it is no longer included in cost per hour", async () => {
    const pool = getPool();
    await pool.query("UPDATE purchases SET period_end=NOW() WHERE id=$1", [
      purchase_id2,
    ]);
    expect(await getSpendRate(account_id, "")).toBe(cost_per_hour1);
  });

  it("and do that again to get back to 0", async () => {
    const pool = getPool();
    await pool.query("UPDATE purchases SET period_end=NOW() WHERE id=$1", [
      purchase_id1,
    ]);
    expect(await getSpendRate(account_id, "")).toBe(0);
  });
});
