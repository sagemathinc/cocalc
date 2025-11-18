import userQuery, {
  cancelQuery,
  close,
  init,
  resetTable,
} from "../../../lite/hub/sqlite/user-query";
import { account_id } from "@cocalc/backend/data";

function freshDb() {
  close();
  init({ filename: ":memory:" });
}

describe("lite sqlite user query", () => {
  beforeEach(() => {
    freshDb();
  });

  afterAll(() => {
    close();
  });

  test("returns default account", () => {
    const result = userQuery({
      query: { accounts: [{ email_address: null }] },
    });
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].email_address).toBe("user@cocalc.com");
    expect(result.accounts[0].account_id).toBe(account_id);
  });

  test("set query updates account", () => {
    userQuery({
      query: {
        accounts: {
          account_id,
          first_name: "Test",
          email_address: "new@cocalc.com",
        },
      },
      options: [{ set: true }],
    });

    const result = userQuery({
      query: {
        accounts: [
          {
            account_id,
            first_name: null,
            email_address: null,
          },
        ],
      },
    });

    expect(result.accounts[0].first_name).toBe("Test");
    expect(result.accounts[0].email_address).toBe("new@cocalc.com");
  });

  test("changefeed receives updates", async () => {
    const changefeedId = "cf-test";
    const updates: any[] = [];

    await new Promise<void>((resolve) => {
      userQuery({
        query: {
          accounts: [
            {
              account_id,
              first_name: null,
            },
          ],
        },
        changes: changefeedId,
        cb: (_err: any, row: any) => {
          updates.push(row);
          if (updates.length === 1) {
            resolve();
          }
        },
      });

      userQuery({
        query: {
          accounts: {
            account_id,
            first_name: "Bob",
          },
        },
        options: [{ set: true }],
      });
    });

    expect(updates[0].first_name).toBe("Bob");

    cancelQuery(changefeedId);
  });

  test("delete removes row", () => {
    const pk = "11111111-1111-4111-8111-111111111111";
    userQuery({
      query: {
        accounts: {
          account_id: pk,
          email_address: "deleteme@cocalc.com",
        },
      },
      options: [{ set: true }],
    });

    userQuery({
      query: {
        accounts: {
          account_id: pk,
        },
      },
      options: [{ delete: true }, { set: true }],
    });

    const result = userQuery({
      query: { accounts: [{ account_id: pk, email_address: null }] },
    });
    expect(result.accounts[0]).toBeUndefined();
  });

  test("multi query returns multiple rows", () => {
    const pk1 = "11111111-1111-4111-8111-111111111112";
    const pk2 = "11111111-1111-4111-8111-111111111113";
    resetTable("accounts");
    userQuery({
      query: {
        accounts: {
          account_id: pk1,
          email_address: "a1@cocalc.com",
        },
      },
      options: [{ set: true }],
    });
    userQuery({
      query: {
        accounts: {
          account_id: pk2,
          email_address: "a2@cocalc.com",
        },
      },
      options: [{ set: true }],
    });

    const result = userQuery({
      query: {
        accounts: [
          {
            account_id: null,
            email_address: null,
          },
        ],
      },
    });

    const emails = result.accounts.map((x) => x.email_address).sort();
    expect(emails).toEqual(["a1@cocalc.com", "a2@cocalc.com"]);
  });

  test("defaults apply when fields missing", () => {
    resetTable("accounts");
    userQuery({
      query: {
        accounts: {
          account_id: account_id,
          email_address: "defaults@cocalc.com",
        },
      },
      options: [{ set: true }],
    });

    const result = userQuery({
      query: {
        accounts: [
          {
            account_id,
            autosave: null,
            first_name: null,
          },
        ],
      },
    });

    expect(result.accounts[0].autosave).toBeDefined();
  });
});
