import unlinkStrategy from "./unlink-strategy";
import getPool from "@cocalc/database/pool";
import getStrategies from "@cocalc/database/settings/get-sso-strategies";

jest.mock("@cocalc/database/pool");
jest.mock("@cocalc/database/settings/get-sso-strategies");

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedGetStrategies = getStrategies as jest.MockedFunction<
  typeof getStrategies
>;

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";

const baseStrategy = {
  name: "saml",
  display: "University SSO",
  icon: "",
  backgroundColor: "",
  public: false,
  exclusiveDomains: ["university.edu"],
  doNotHide: false,
  updateOnLogin: false,
};

describe("unlinkStrategy", () => {
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn();
    mockedGetPool.mockReturnValue({ query } as any);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("blocks unlink when account email is covered by the exclusive strategy", async () => {
    query.mockResolvedValueOnce({
      rows: [{ email_address: "user@university.edu" }],
    });
    mockedGetStrategies.mockResolvedValueOnce([baseStrategy]);

    await expect(
      unlinkStrategy({ account_id: ACCOUNT_ID, name: "saml-123" }),
    ).rejects.toThrow("You are not allowed to unlink this SSO account");

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(
      "SELECT email_address FROM accounts",
    );
  });

  test("allows unlink when account email is not covered by the exclusive strategy", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ email_address: "user@gmail.com" }] })
      .mockResolvedValueOnce({ rows: [] });
    mockedGetStrategies.mockResolvedValueOnce([baseStrategy]);

    await expect(
      unlinkStrategy({ account_id: ACCOUNT_ID, name: "saml-123" }),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toMatch(
      "UPDATE accounts SET passports = passports - $2 WHERE account_id=$1",
    );
    expect(query.mock.calls[1][1]).toEqual([ACCOUNT_ID, "saml-123"]);
  });
});
