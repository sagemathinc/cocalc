import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import createAccount from "@cocalc/server/accounts/create-account";
import updatePendingPurchases from "./update-pending-purchases";
import createPurchase from "./create-purchase";
import getBalance, { getPendingBalance } from "./get-balance";

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("basic consistency checks for marking purchases that are pending to not pending", () => {
  const account_id = uuid();

  it("make account for testing", async () => {
    await createAccount({
      email: "",
      password: "xyz",
      firstName: "Test",
      lastName: "User",
      account_id,
    });
  });

  it("updating pending when there are no purchases at all doesn't crash", async () => {
    await updatePendingPurchases(account_id);
  });

  it("updating pending when there is one non-pending purchase doesn't crash", async () => {
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 5,
    });
    await updatePendingPurchases(account_id);
  });

  it("updating pending when there is one pending purchase but no money doesn't change anything; also ensure balances are consistent", async () => {
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 3,
      pending: true,
    });
    expect(await getBalance(account_id)).toBe(-5);
    await updatePendingPurchases(account_id);
    expect(await getPendingBalance(account_id)).toBe(-3);
  });

  it("add credit to account so that the pending purchase gets marked as not pending", async () => {
    await createPurchase({
      account_id,
      service: "credit",
      description: {} as any,
      client: null,
      cost: -9,
    });
    expect(await getBalance(account_id)).toBe(4); // enough
    await updatePendingPurchases(account_id);
    expect(await getPendingBalance(account_id)).toBe(0);
    expect(await getBalance(account_id)).toBe(1); // what's left
  });

  it("create 3 pending purchases and have knapsack select 2 carefully to get marked as non-pending", async () => {
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 2,
      pending: true,
    });
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 3,
      pending: true,
    });
    await createPurchase({
      account_id,
      service: "license",
      description: {} as any,
      client: null,
      cost: 6,
      pending: true,
    });
    // balance was 1 from above, so lets increase it to 7
    await createPurchase({
      account_id,
      service: "credit",
      description: {} as any,
      client: null,
      cost: -6,
    });
    expect(await getPendingBalance(account_id)).toBe(-(2 + 3 + 6));
    expect(await getBalance(account_id)).toBe(7);
    // update pending should select the purchase that cost $6 above
    // instead of the $2 and $3 purchases, since that maximizes the
    // amount of money that gets used.  After doing that the balance
    // is back to 1.
    await updatePendingPurchases(account_id);
    expect(await getPendingBalance(account_id)).toBe(-(2 + 3));
    expect(await getBalance(account_id)).toBe(1); // what's left
  });
});
